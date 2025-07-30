# SEARCH.md - ChatSearch Vector Search Feature Plan

## Overview

This document outlines the implementation plan for a comprehensive ChatSearch component that enables vector-based semantic search across all chat messages. The feature is designed to be completely isolated with minimal integration points, requiring only placement in the sidebar.

## Architecture Goals

- **Isolation**: Zero modifications to existing files beyond sidebar integration
- **Vector Search**: Semantic search using AI embeddings for accurate content matching
- **Performance**: Efficient search with pagination and caching
- **User Experience**: Intuitive search interface with real-time results
- **Scalability**: Designed to handle large chat histories

## Current System Analysis

### Database Schema (lib/db/schema.ts:50-61)
```typescript
export const message = pgTable('Message_v2', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId').notNull().references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),        // Message content for embedding
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});
```

### Integration Point
- **Sidebar Location**: `components/app-sidebar.tsx:61-63` - Add ChatSearch before SidebarHistory
- **Existing Pattern**: Follows SidebarHistory pattern with SWR data fetching

## Implementation Plan

### Phase 1: Database Extensions

#### 1.1 Vector Search Schema
Create new database tables for search functionality:

```sql
-- Message embeddings table
CREATE TABLE message_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES "Message_v2"(id) ON DELETE CASCADE,
  embedding VECTOR(1536), -- OpenAI text-embedding-3-small dimensions
  content_hash VARCHAR(64) NOT NULL, -- SHA-256 of processed content
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(message_id)
);

-- Create HNSW index for vector similarity search
CREATE INDEX ON message_embeddings USING hnsw (embedding vector_cosine_ops);

-- Search sessions table for caching and analytics
CREATE TABLE search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "User"(id),
  query TEXT NOT NULL,
  query_embedding VECTOR(1536),
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 1.2 Database Schema Extensions (lib/db/schema.ts)
Add new table definitions following existing patterns:

```typescript
export const messageEmbedding = pgTable('message_embeddings', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => message.id),
  embedding: vector('embedding', { dimensions: 1536 }),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const searchSession = pgTable('search_sessions', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => user.id),
  query: text('query').notNull(),
  queryEmbedding: vector('query_embedding', { dimensions: 1536 }),
  resultCount: integer('result_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

#### 1.3 Migration Strategy
- Create migration to add pgvector extension
- Add new tables with proper indexes
- Background job to populate embeddings for existing messages

### Phase 2: Backend Infrastructure

#### 2.1 Embedding Service (lib/ai/embeddings.ts)
```typescript
import { embed } from 'ai';
import { myProvider } from './providers';

export interface EmbeddingService {
  generateEmbedding(content: string): Promise<number[]>;
  generateBatchEmbeddings(contents: string[]): Promise<number[][]>;
  extractSearchableContent(messageParts: any[]): string;
}

export class OpenAIEmbeddingService implements EmbeddingService {
  private model = myProvider.textEmbedding('text-embedding-3-small');
  
  async generateEmbedding(content: string): Promise<number[]> {
    const { embedding } = await embed({
      model: this.model,
      value: content,
    });
    return embedding;
  }
  
  async generateBatchEmbeddings(contents: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: this.model,
      values: contents,
    });
    return embeddings;
  }
  
  extractSearchableContent(messageParts: any[]): string {
    // Extract text content from message parts JSON
    return messageParts
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join(' ')
      .trim();
  }
}
```

#### 2.2 Search Queries (lib/db/search-queries.ts)
```typescript
import { cosineDistance, desc, sql } from 'drizzle-orm';
import type { EmbeddingVector } from './schema';

export interface SearchResult {
  messageId: string;
  chatId: string;
  chatTitle: string;
  content: string;
  similarity: number;
  createdAt: Date;
  role: 'user' | 'assistant';
}

export async function searchMessages({
  userId,
  queryEmbedding,
  limit = 20,
  similarityThreshold = 0.7,
}: {
  userId: string;
  queryEmbedding: number[];
  limit?: number;
  similarityThreshold?: number;
}): Promise<SearchResult[]> {
  return await db
    .select({
      messageId: message.id,
      chatId: message.chatId,
      chatTitle: chat.title,
      content: message.parts,
      similarity: sql<number>`1 - (${messageEmbedding.embedding} <=> ${queryEmbedding})`,
      createdAt: message.createdAt,
      role: message.role,
    })
    .from(messageEmbedding)
    .innerJoin(message, eq(messageEmbedding.messageId, message.id))
    .innerJoin(chat, eq(message.chatId, chat.id))
    .where(
      and(
        eq(chat.userId, userId),
        sql`1 - (${messageEmbedding.embedding} <=> ${queryEmbedding}) > ${similarityThreshold}`
      )
    )
    .orderBy(desc(sql`1 - (${messageEmbedding.embedding} <=> ${queryEmbedding})`))
    .limit(limit);
}

export async function ensureMessageEmbedding(messageId: string): Promise<void> {
  // Check if embedding exists, create if missing
  const existing = await db
    .select()
    .from(messageEmbedding)
    .where(eq(messageEmbedding.messageId, messageId))
    .limit(1);
    
  if (existing.length === 0) {
    const messageData = await getMessageById(messageId);
    if (messageData) {
      await createMessageEmbedding(messageData);
    }
  }
}
```

#### 2.3 Background Jobs (lib/jobs/embedding-processor.ts)
```typescript
export class EmbeddingProcessor {
  private embeddingService = new OpenAIEmbeddingService();
  
  async processMessageEmbedding(messageId: string): Promise<void> {
    const message = await getMessageById(messageId);
    if (!message) return;
    
    const content = this.embeddingService.extractSearchableContent(message.parts);
    if (!content.trim()) return;
    
    const contentHash = createHash('sha256').update(content).digest('hex');
    
    // Check if embedding already exists with same content
    const existing = await db
      .select()
      .from(messageEmbedding)
      .where(
        and(
          eq(messageEmbedding.messageId, messageId),
          eq(messageEmbedding.contentHash, contentHash)
        )
      );
      
    if (existing.length > 0) return;
    
    const embedding = await this.embeddingService.generateEmbedding(content);
    
    await db
      .insert(messageEmbedding)
      .values({
        messageId,
        embedding,
        contentHash,
      })
      .onConflictDoUpdate({
        target: messageEmbedding.messageId,
        set: {
          embedding,
          contentHash,
          updatedAt: new Date(),
        },
      });
  }
  
  async batchProcessMissingEmbeddings(batchSize: number = 50): Promise<void> {
    // Process messages without embeddings in batches
    // Run as background job or API endpoint
  }
}
```

### Phase 3: API Endpoints

#### 3.1 Search API (app/(chat)/api/search/route.ts)
```typescript
import { auth } from '@/app/(auth)/auth';
import { NextRequest } from 'next/server';
import { searchMessages } from '@/lib/db/search-queries';
import { OpenAIEmbeddingService } from '@/lib/ai/embeddings';
import { ChatSDKError } from '@/lib/errors';

const embeddingService = new OpenAIEmbeddingService();

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError('unauthorized:search').toResponse();
  }
  
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('q');
  const limit = Math.min(Number(searchParams.get('limit') || '20'), 50);
  const threshold = Number(searchParams.get('threshold') || '0.7');
  
  if (!query || query.trim().length < 2) {
    return new ChatSDKError(
      'bad_request:search',
      'Query must be at least 2 characters long'
    ).toResponse();
  }
  
  try {
    // Generate embedding for search query
    const queryEmbedding = await embeddingService.generateEmbedding(query.trim());
    
    // Perform vector search
    const results = await searchMessages({
      userId: session.user.id,
      queryEmbedding,
      limit,
      similarityThreshold: threshold,
    });
    
    // Store search session for analytics
    await db.insert(searchSession).values({
      userId: session.user.id,
      query: query.trim(),
      queryEmbedding,
      resultCount: results.length,
    });
    
    return Response.json({
      query: query.trim(),
      results: results.map(result => ({
        messageId: result.messageId,
        chatId: result.chatId,
        chatTitle: result.chatTitle,
        content: embeddingService.extractSearchableContent(result.content),
        similarity: result.similarity,
        createdAt: result.createdAt,
        role: result.role,
      })),
      total: results.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    return new ChatSDKError(
      'internal_server_error:search',
      'Failed to perform search'
    ).toResponse();
  }
}
```

#### 3.2 Embedding Sync API (app/(chat)/api/search/sync/route.ts)
```typescript
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError('unauthorized:search').toResponse();
  }
  
  const { messageIds } = await request.json();
  const processor = new EmbeddingProcessor();
  
  try {
    if (messageIds && Array.isArray(messageIds)) {
      // Process specific messages
      await Promise.all(
        messageIds.map(id => processor.processMessageEmbedding(id))
      );
    } else {
      // Process missing embeddings for user
      await processor.batchProcessMissingEmbeddings();
    }
    
    return Response.json({ success: true });
  } catch (error) {
    return new ChatSDKError(
      'internal_server_error:search',
      'Failed to sync embeddings'
    ).toResponse();
  }
}
```

### Phase 4: Frontend Components

#### 4.1 ChatSearch Component (components/chat-search.tsx)
```typescript
'use client';

import { useState, useCallback, useMemo } from 'react';
import { Search, X, Loader2, MessageSquare } from 'lucide-react';
import { useDebounce } from 'usehooks-ts';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarGroupLabel,
  useSidebar 
} from '@/components/ui/sidebar';
import { fetcher } from '@/lib/utils';

interface SearchResult {
  messageId: string;
  chatId: string;
  chatTitle: string;
  content: string;
  similarity: number;
  createdAt: string;
  role: 'user' | 'assistant';
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

export function ChatSearch() {
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const { setOpenMobile } = useSidebar();
  
  const debouncedQuery = useDebounce(query.trim(), 300);
  const shouldSearch = debouncedQuery.length >= 2;
  
  const { data, isLoading } = useSWR<SearchResponse>(
    shouldSearch ? `/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=10` : null,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  );
  
  const handleClear = useCallback(() => {
    setQuery('');
    setIsExpanded(false);
  }, []);
  
  const handleResultClick = useCallback(() => {
    setOpenMobile(false);
  }, [setOpenMobile]);
  
  const highlightedResults = useMemo(() => {
    if (!data?.results || !debouncedQuery) return data?.results || [];
    
    return data.results.map(result => ({
      ...result,
      highlightedContent: highlightSearchTerms(result.content, debouncedQuery),
    }));
  }, [data?.results, debouncedQuery]);
  
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Search Conversations</SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="space-y-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim()) {
                  setIsExpanded(true);
                } else {
                  setIsExpanded(false);
                }
              }}
              className="pl-8 pr-8"
              onFocus={() => query.trim() && setIsExpanded(true)}
            />
            {query && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          
          {/* Search Results */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="max-h-96 overflow-y-auto space-y-2 border rounded-md p-2">
                  {/* Loading State */}
                  {isLoading && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2 text-sm text-muted-foreground">
                        Searching...
                      </span>
                    </div>
                  )}
                  
                  {/* No Query */}
                  {!shouldSearch && !isLoading && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      Enter at least 2 characters to search
                    </div>
                  )}
                  
                  {/* No Results */}
                  {shouldSearch && !isLoading && (!data || data.results.length === 0) && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      No messages found for "{debouncedQuery}"
                    </div>
                  )}
                  
                  {/* Results */}
                  {highlightedResults.length > 0 && (
                    <div className="space-y-2">
                      {highlightedResults.map((result) => (
                        <SearchResultItem
                          key={result.messageId}
                          result={result}
                          onClick={handleResultClick}
                        />
                      ))}
                      
                      {data && data.total > 10 && (
                        <div className="text-center pt-2 text-xs text-muted-foreground">
                          Showing top 10 of {data.total} results
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface SearchResultItemProps {
  result: SearchResult & { highlightedContent?: string };
  onClick: () => void;
}

function SearchResultItem({ result, onClick }: SearchResultItemProps) {
  return (
    <Link
      href={`/chat/${result.chatId}#${result.messageId}`}
      onClick={onClick}
      className="block p-2 rounded hover:bg-muted/50 transition-colors border"
    >
      <div className="space-y-1">
        {/* Chat Title */}
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium truncate">
            {result.chatTitle}
          </span>
        </div>
        
        {/* Message Content */}
        <div 
          className="text-xs text-muted-foreground line-clamp-2"
          dangerouslySetInnerHTML={{ 
            __html: result.highlightedContent || result.content 
          }}
        />
        
        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="capitalize">{result.role}</span>
          <span>{formatDistanceToNow(new Date(result.createdAt), { addSuffix: true })}</span>
        </div>
        
        {/* Similarity Score */}
        <div className="w-full bg-muted rounded-full h-1">
          <div 
            className="bg-primary h-1 rounded-full transition-all"
            style={{ width: `${result.similarity * 100}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

function highlightSearchTerms(content: string, query: string): string {
  if (!query.trim()) return content;
  
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let highlighted = content;
  
  terms.forEach(term => {
    const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    highlighted = highlighted.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
  });
  
  return highlighted;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

#### 4.2 Integration Hook (hooks/use-search.ts)
```typescript
import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useDebounce } from 'usehooks-ts';
import { fetcher } from '@/lib/utils';

interface UseSearchOptions {
  minQueryLength?: number;
  debounceMs?: number;
  limit?: number;
  threshold?: number;
}

export function useSearch(options: UseSearchOptions = {}) {
  const {
    minQueryLength = 2,
    debounceMs = 300,
    limit = 20,
    threshold = 0.7,
  } = options;
  
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), debounceMs);
  
  const shouldSearch = debouncedQuery.length >= minQueryLength;
  const searchUrl = shouldSearch 
    ? `/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=${limit}&threshold=${threshold}`
    : null;
  
  const { data, error, isLoading, mutate } = useSWR(searchUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    errorRetryCount: 2,
  });
  
  const clearSearch = useCallback(() => {
    setQuery('');
  }, []);
  
  return {
    query,
    setQuery,
    debouncedQuery,
    results: data?.results || [],
    total: data?.total || 0,
    isLoading: shouldSearch && isLoading,
    error,
    clearSearch,
    refetch: mutate,
  };
}
```

### Phase 5: Integration & Deployment

#### 5.1 Sidebar Integration
Modify `components/app-sidebar.tsx:61-63` to include ChatSearch:

```typescript
<SidebarContent>
  <ChatSearch />
  <Separator className="my-2" />
  <SidebarHistory user={user} />
</SidebarContent>
```

#### 5.2 Environment Variables
Add to `.env.example`:

```bash
# Vector Search Configuration
EMBEDDINGS_PROVIDER=openai
OPENAI_API_KEY=your_openai_key_here
VECTOR_SEARCH_SIMILARITY_THRESHOLD=0.7
VECTOR_SEARCH_MAX_RESULTS=50
```

#### 5.3 Package Dependencies
Add to `package.json`:

```json
{
  "dependencies": {
    "pgvector": "^0.1.8",
    "@types/crypto": "^1.0.1"
  }
}
```

#### 5.4 Database Setup Script
Create `scripts/setup-vector-search.ts`:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

async function setupVectorSearch() {
  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);
  
  // Enable pgvector extension
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  
  // Run migrations
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS message_embeddings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      message_id UUID NOT NULL REFERENCES "Message_v2"(id) ON DELETE CASCADE,
      embedding VECTOR(1536),
      content_hash VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(message_id)
    );
  `);
  
  // Create indexes
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS message_embeddings_vector_idx 
    ON message_embeddings USING hnsw (embedding vector_cosine_ops);
  `);
  
  console.log('Vector search setup complete');
  await client.end();
}

setupVectorSearch().catch(console.error);
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Database schema design and migration
- [ ] pgvector extension setup
- [ ] Basic embedding service implementation
- [ ] Search queries development

### Week 2: Backend APIs
- [ ] Search API endpoint
- [ ] Embedding sync API
- [ ] Background job processor
- [ ] Error handling and validation

### Week 3: Frontend Components
- [ ] ChatSearch component development
- [ ] Search hook implementation
- [ ] UI polish and animations
- [ ] Integration testing

### Week 4: Integration & Optimization
- [ ] Sidebar integration
- [ ] Performance optimization
- [ ] E2E testing
- [ ] Documentation and deployment

## Performance Considerations

### Embedding Generation
- **Batch Processing**: Process multiple messages simultaneously
- **Caching**: Avoid regenerating embeddings for unchanged content
- **Rate Limiting**: Respect AI provider API limits
- **Background Jobs**: Generate embeddings asynchronously

### Search Performance
- **HNSW Indexing**: Use approximate nearest neighbor search for speed
- **Result Limiting**: Cap results at reasonable numbers (20-50)
- **Similarity Threshold**: Filter out low-relevance results
- **Query Debouncing**: Reduce API calls with user input debouncing

### Database Optimization
- **Connection Pooling**: Efficient database connection management
- **Index Strategy**: Optimize for vector similarity operations
- **Partitioning**: Consider partitioning by user for large datasets
- **Archival**: Archive old embeddings for inactive chats

## Security & Privacy

### Data Protection
- **User Isolation**: Ensure users can only search their own messages
- **Embedding Security**: Hash content to detect changes
- **API Authentication**: Require valid user sessions
- **Rate Limiting**: Prevent abuse of search endpoints

### Content Handling
- **Sanitization**: Clean user input before processing
- **PII Detection**: Avoid embedding sensitive information
- **Content Filtering**: Skip system messages and metadata
- **Audit Logging**: Track search queries for debugging

## Monitoring & Analytics

### Search Metrics
- **Query Performance**: Track search response times
- **Result Quality**: Monitor similarity scores and user engagement
- **Error Rates**: Track failed searches and embedding generation
- **Usage Patterns**: Analyze search frequency and popular queries

### System Health
- **Embedding Coverage**: Monitor percentage of messages with embeddings
- **Database Performance**: Track vector search query performance
- **API Response Times**: Monitor search endpoint latency
- **Resource Usage**: Track CPU and memory usage for embedding generation

## Future Enhancements

### Advanced Features
- **Multi-language Support**: Support for non-English content
- **Hybrid Search**: Combine vector search with keyword search
- **Search Filters**: Filter by date, chat, message type
- **Search Suggestions**: Auto-complete based on search history

### UI/UX Improvements
- **Search History**: Save and recall previous searches
- **Advanced Filters**: Date ranges, similarity thresholds
- **Keyboard Shortcuts**: Quick search activation
- **Mobile Optimization**: Touch-friendly search interface

### Performance Optimizations
- **Incremental Updates**: Real-time embedding generation
- **Smart Indexing**: Adaptive indexing based on usage patterns
- **Caching Layer**: Redis cache for popular searches
- **CDN Integration**: Edge caching for search results

## Success Metrics

### Technical Metrics
- **Search Latency**: < 500ms for 95% of queries
- **Embedding Coverage**: > 99% of messages indexed
- **Search Accuracy**: > 80% relevant results in top 10
- **System Uptime**: > 99.9% availability

### User Experience Metrics
- **Search Adoption**: % of users using search feature
- **Query Success Rate**: % of searches returning results
- **User Engagement**: Click-through rate on search results
- **Feature Satisfaction**: User feedback scores

This comprehensive plan provides a complete roadmap for implementing vector-based semantic search in the Yupp Chat application while maintaining isolation and minimizing integration complexity.