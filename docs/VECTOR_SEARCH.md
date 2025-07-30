# Vector Search Feature Documentation

## Overview

Yupp Chat implements semantic vector search functionality that allows users to search through their chat conversations using natural language queries. The system uses OpenAI embeddings to create vector representations of chat messages and performs similarity searches to find relevant content.

## Architecture

### Core Components

#### 1. Database Schema (`lib/db/schema.ts:191-212`)

**Message Embeddings Table**
```sql
CREATE TABLE message_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE REFERENCES "Message_v2"(id) ON DELETE CASCADE,
  embedding VECTOR(1536), -- OpenAI text-embedding-3-small dimensions
  content_hash VARCHAR(64) NOT NULL, -- SHA-256 of processed content
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Search Sessions Table**
```sql
CREATE TABLE search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "User"(id),
  query TEXT NOT NULL,
  query_embedding VECTOR(1536),
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 2. Embedding Service (`lib/ai/embeddings.ts`)

**OpenAIEmbeddingService Class**
- Generates vector embeddings using OpenAI's `text-embedding-3-small` model
- Extracts searchable content from message parts (filters text content only)
- Creates SHA-256 content hashes to avoid duplicate embeddings
- Supports both single and batch embedding generation

**Key Methods:**
- `generateEmbedding(content: string)` - Creates a 1536-dimensional vector
- `generateBatchEmbeddings(contents: string[])` - Batch processing for efficiency
- `extractSearchableContent(messageParts: any[])` - Extracts text from message JSON
- `generateContentHash(content: string)` - Creates content fingerprint

#### 3. Search Queries (`lib/db/search-queries.ts`)

**Core Search Function**
```typescript
searchMessages({
  userId: string,
  query: string,
  limit?: number,
  similarityThreshold?: number
})
```

**Search Process:**
1. Generates query embedding using OpenAI
2. Performs cosine similarity search using pgvector
3. Filters results by user ownership and similarity threshold
4. Returns ranked results with similarity scores
5. Logs detailed debugging information

**Supporting Functions:**
- `ensureMessageEmbedding(messageId)` - Creates missing embeddings
- `createMessageEmbedding(messageData)` - Generates and stores embeddings
- `batchCreateEmbeddings(messageIds)` - Batch embedding creation

#### 4. API Endpoint (`app/(chat)/api/search/route.ts`)

**GET /api/search**
- Requires authentication via NextAuth session
- Accepts query parameters: `q` (query), `limit` (max 50), `threshold` (0.1-1.0)
- Returns JSON response with results and total count
- Includes comprehensive error handling

#### 5. Frontend Components

**ChatSearch Component (`components/chat-search.tsx`)**
- Collapsible search interface in sidebar
- Real-time search with 300ms debounce
- Animated results display with similarity scores
- Highlights matching terms in search results
- Click-to-navigate functionality

**useSearch Hook (`hooks/use-search.ts`)**
- Manages search state and API calls
- Uses SWR for caching and data fetching
- Configurable debounce, thresholds, and limits
- Provides loading states and error handling

## Data Flow

### 1. Embedding Creation
```
Message Created → extractSearchableContent() → generateEmbedding() → Store in DB
```

### 2. Search Process
```
User Query → debounce → generateEmbedding() → Vector Similarity Search → Format Results → Display
```

### 3. Database Integration
```
pgvector Extension → HNSW Index → Cosine Distance Calculation → Ranked Results
```

## Configuration

### Environment Variables
-  `OPENAI_API_KEY` - For embedding generation
- `POSTGRES_URL` - Database connection with pgvector support

### Search Parameters
- **Minimum Query Length**: 2 characters
- **Debounce Delay**: 300ms
- **Default Limit**: 20 results
- **Default Threshold**: 0.7 (70% similarity)
- **Maximum Limit**: 50 results

## Performance Characteristics

### Embedding Generation
- Uses OpenAI `text-embedding-3-small` model (1536 dimensions)
- Batch processing for efficiency
- Content hashing prevents duplicate embeddings
- Asynchronous background processing

### Search Performance
- pgvector HNSW index for fast approximate nearest neighbor search
- Cosine similarity for semantic matching
- User-scoped queries for security and performance
- Result limiting and similarity thresholds

### Caching Strategy
- SWR client-side caching with 1-second deduplication
- Search session logging for analytics
- Content hash-based embedding deduplication

## Security Features

### User Isolation
- All searches scoped to authenticated user's messages only
- Chat ownership validation in database queries
- Session-based authentication required

### Input Validation
- Query length requirements (2+ characters)
- Parameter sanitization and bounds checking
- SQL injection prevention via parameterized queries

## Usage Examples

### Basic Search
```typescript
// In React component
const { results, isLoading } = useSearch({
  minQueryLength: 2,
  threshold: 0.7,
  limit: 20
});
```

### Programmatic Search
```typescript
// Direct API call
const results = await searchMessages({
  userId: 'user-id',
  query: 'machine learning discussion',
  limit: 10,
  similarityThreshold: 0.8
});
```

### Batch Embedding Creation
```typescript
// For existing messages
await batchCreateEmbeddings(messageIds, 10);
```

## Database Setup

### Prerequisites
1. PostgreSQL with pgvector extension
2. Drizzle ORM migrations

### Setup Commands
```bash
# Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

# Run migrations
pnpm db:migrate

# Create vector index (handled by migration)
CREATE INDEX ON message_embeddings USING hnsw (embedding vector_cosine_ops);
```

## Monitoring and Debugging

### Logging
- Comprehensive debug logging in `searchMessages()`
- Query performance tracking
- Embedding generation metrics
- Error tracking and reporting

### Key Metrics
- Search response times
- Embedding coverage percentage
- Similarity score distributions
- User search patterns

## Future Enhancements

### Planned Features
- Hybrid search (vector + keyword)
- Multi-language support
- Advanced filtering options
- Search suggestions and autocomplete

### Performance Optimizations
- Incremental embedding updates
- Smart indexing strategies
- Result caching improvements
- Background embedding processing

## Technical Dependencies

### Core Libraries
- `ai` - AI SDK for embeddings
- `pgvector` - PostgreSQL vector extension
- `drizzle-orm` - Database ORM
- `swr` - Data fetching and caching
- `use-debounce` - Input debouncing

### AI Services
- OpenAI text-embedding-3-small model
- 1536-dimensional vector space
- Cosine similarity matching

This vector search implementation provides powerful semantic search capabilities while maintaining good performance, security, and user experience standards.