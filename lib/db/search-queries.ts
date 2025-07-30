// Load environment variables if not already loaded
if (!process.env.POSTGRES_URL) {
  try {
    const { config } = require('dotenv');
    config({ path: '.env.local' });
  } catch (e) {
    // dotenv not available, continue
  }
}

import { desc, sql, eq, and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { message, chat, messageEmbedding, searchSession } from './schema';
import { embeddingService } from '../ai/embeddings';

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export interface SearchResult {
  messageId: string;
  chatId: string;
  chatTitle: string;
  content: string;
  similarity: number;
  createdAt: Date;
  role: string;
}

export interface SearchOptions {
  userId: string;
  query: string;
  limit?: number;
  similarityThreshold?: number;
}

export async function searchMessages({
  userId,
  query,
  limit = 20,
  similarityThreshold = 0.7,
}: SearchOptions): Promise<{ results: SearchResult[]; total: number }> {
  try {
    console.log(`\n--- DEBUG: Starting search for user ${userId} ---`);
    console.log(`Query: "${query}"`);
    console.log(`Limit: ${limit}, Threshold: ${similarityThreshold}`);
    
    // Check if user has any chats
    const userChats = await db
      .select({ count: sql<number>`count(*)` })
      .from(chat)
      .where(eq(chat.userId, userId));
    console.log(`DEBUG: User has ${userChats[0]?.count || 0} chats`);
    
    // Check if user has any messages
    const userMessages = await db
      .select({ count: sql<number>`count(*)` })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(eq(chat.userId, userId));
    console.log(`DEBUG: User has ${userMessages[0]?.count || 0} messages`);
    
    // Check if user has any embeddings
    const userEmbeddings = await db
      .select({ count: sql<number>`count(*)` })
      .from(messageEmbedding)
      .innerJoin(message, eq(messageEmbedding.messageId, message.id))
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(eq(chat.userId, userId));
    console.log(`DEBUG: User has ${userEmbeddings[0]?.count || 0} message embeddings`);

    // Generate embedding for the search query
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    console.log(`DEBUG: Generated query embedding with ${queryEmbedding.length} dimensions`);
    console.log(`DEBUG: First 5 embedding values: [${queryEmbedding.slice(0, 5).join(', ')}...]`);
    
    // Store search session
    const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;
    console.log(`DEBUG: Query embedding string length: ${queryEmbeddingStr.length}`);
    
    const [session] = await db.insert(searchSession).values({
      userId,
      query,
      queryEmbedding: sql`${queryEmbeddingStr}::vector`,
      resultCount: 0, // Will be updated after search
    }).returning({ id: searchSession.id });
    console.log(`DEBUG: Search session created with ID: ${session.id}`);
    
    // Check table structure and data first
    console.log(`DEBUG: Checking messageEmbedding table structure...`);
    const embeddingTableCheck = await db
      .select({
        id: messageEmbedding.id,
        messageId: messageEmbedding.messageId,
        hasEmbedding: sql<boolean>`${messageEmbedding.embedding} IS NOT NULL`,
      })
      .from(messageEmbedding)
      .limit(3);
    console.log(`DEBUG: messageEmbedding table has ${embeddingTableCheck.length} rows`);
    embeddingTableCheck.forEach((row, i) => {
      console.log(`  ${i + 1}. ID: ${row.id}, MessageID: ${row.messageId}, HasEmbedding: ${row.hasEmbedding}`);
    });

    // Check message table
    console.log(`DEBUG: Checking Message_v2 table...`);
    const messageTableCheck = await db
      .select({
        id: message.id,
        chatId: message.chatId,
        role: message.role,
      })
      .from(message)
      .limit(3);
    console.log(`DEBUG: Message_v2 table has ${messageTableCheck.length} rows`);
    messageTableCheck.forEach((row, i) => {
      console.log(`  ${i + 1}. ID: ${row.id}, ChatID: ${row.chatId}, Role: ${row.role}`);
    });

    // Test the join between messageEmbedding and message
    console.log(`DEBUG: Testing messageEmbedding <-> message join...`);
    const joinTest = await db
      .select({
        embeddingId: messageEmbedding.id,
        messageId: message.id,
        messageRole: message.role,
        chatId: message.chatId,
      })
      .from(messageEmbedding)
      .innerJoin(message, eq(messageEmbedding.messageId, message.id))
      .limit(3);
    console.log(`DEBUG: messageEmbedding <-> message join returned ${joinTest.length} rows`);
    
    // Check which users own these chats with embeddings
    console.log(`DEBUG: Checking which users own the chats with embeddings...`);
    const chatIds = joinTest.map(j => j.chatId);
    const chatOwnership = await db
      .select({
        chatId: chat.id,
        userId: chat.userId,
        title: chat.title,
      })
      .from(chat)
      .where(inArray(chat.id, chatIds));
    console.log(`DEBUG: Chat ownership for embedding chats:`);
    chatOwnership.forEach((row, i) => {
      const isCurrentUser = row.userId === userId;
      console.log(`  ${i + 1}. Chat: ${row.title}, UserID: ${row.userId}, IsCurrentUser: ${isCurrentUser}`);
    });

    // Test similarity calculation without threshold first
    console.log(`DEBUG: Testing similarity calculation without threshold...`);
    const allResults = await db
      .select({
        messageId: message.id,
        chatId: message.chatId,
        chatTitle: chat.title,
        content: message.parts,
        similarity: sql<number>`1 - (${messageEmbedding.embedding} <=> ${queryEmbeddingStr})`,
        createdAt: message.createdAt,
        role: message.role,
      })
      .from(messageEmbedding)
      .innerJoin(message, eq(messageEmbedding.messageId, message.id))
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(eq(chat.userId, userId))
      .orderBy(desc(sql`1 - (${messageEmbedding.embedding} <=> ${queryEmbeddingStr})`))
      .limit(5);
    
    console.log(`DEBUG: Found ${allResults.length} total results (no threshold)`);
    allResults.forEach((result, index) => {
      console.log(`  ${index + 1}. Similarity: ${(result.similarity * 100).toFixed(2)}%, Role: ${result.role}`);
    });
    
    // Now perform the actual search with threshold
    console.log(`DEBUG: Performing search with threshold ${similarityThreshold}...`);
    const results = await db
      .select({
        messageId: message.id,
        chatId: message.chatId,
        chatTitle: chat.title,
        content: message.parts,
        similarity: sql<number>`1 - (${messageEmbedding.embedding} <=> ${queryEmbeddingStr})`,
        createdAt: message.createdAt,
        role: message.role,
      })
      .from(messageEmbedding)
      .innerJoin(message, eq(messageEmbedding.messageId, message.id))
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, userId),
          sql`1 - (${messageEmbedding.embedding} <=> ${queryEmbeddingStr}) > ${similarityThreshold}`
        )
      )
      .orderBy(desc(sql`1 - (${messageEmbedding.embedding} <=> ${queryEmbeddingStr})`))
      .limit(limit);
    
    console.log(`DEBUG: Found ${results.length} results above threshold ${similarityThreshold}`);
    
    // Process results to extract readable content
    const processedResults: SearchResult[] = results.map(result => ({
      ...result,
      content: embeddingService.extractSearchableContent(result.content as any[]),
    }));

    console.log(`DEBUG: Processed ${processedResults.length} results`);
    processedResults.forEach((result, index) => {
      const truncatedContent = result.content.length > 80 ? result.content.substring(0, 80) + '...' : result.content;
      console.log(`  ${index + 1}. [${(result.similarity * 100).toFixed(1)}%] ${result.role}: ${truncatedContent}`);
    });

    // Update search session with result count
    await db
      .update(searchSession)
      .set({ resultCount: processedResults.length })
      .where(eq(searchSession.id, session.id));

    console.log(`DEBUG: Search completed. Returning ${processedResults.length} results.`);

    return {
      results: processedResults,
      total: processedResults.length,
    };
  } catch (error) {
    console.error('ERROR in searchMessages:', error);
    return { results: [], total: 0 };
  }
}

export async function ensureMessageEmbedding(messageId: string): Promise<void> {
  try {
    // Check if embedding exists
    const existing = await db
      .select()
      .from(messageEmbedding)
      .where(eq(messageEmbedding.messageId, messageId))
      .limit(1);

    if (existing.length === 0) {
      // Get message data
      const messageData = await db
        .select()
        .from(message)
        .where(eq(message.id, messageId))
        .limit(1);

      if (messageData.length > 0) {
        await createMessageEmbedding(messageData[0]);
      }
    }
  } catch (error) {
    console.error('Error ensuring message embedding:', error);
  }
}

export async function createMessageEmbedding(messageData: any): Promise<void> {
  try {
    const content = embeddingService.extractSearchableContent(messageData.parts);
    
    if (!content.trim()) {
      return; // Skip empty content
    }

    const contentHash = embeddingService.generateContentHash(content);
    
    // Check if embedding already exists with same content hash
    const existing = await db
      .select()
      .from(messageEmbedding)
      .where(
        and(
          eq(messageEmbedding.messageId, messageData.id),
          eq(messageEmbedding.contentHash, contentHash)
        )
      );

    if (existing.length > 0) {
      return; // Already exists with same content
    }

    const embedding = await embeddingService.generateEmbedding(content);
    const embeddingStr = `[${embedding.join(',')}]`;

    await db
      .insert(messageEmbedding)
      .values({
        messageId: messageData.id,
        embedding: sql`${embeddingStr}::vector`,
        contentHash,
      })
      .onConflictDoUpdate({
        target: messageEmbedding.messageId,
        set: {
          embedding: sql`${embeddingStr}::vector`,
          contentHash,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Error creating message embedding:', error);
  }
}

export async function batchCreateEmbeddings(messageIds: string[], batchSize: number = 10): Promise<void> {
  try {
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      
      // Get messages that don't have embeddings
      const messages = await db
        .select()
        .from(message)
        .leftJoin(messageEmbedding, eq(message.id, messageEmbedding.messageId))
        .where(
          and(
            sql`${message.id} = ANY(${batch})`,
            sql`${messageEmbedding.messageId} IS NULL`
          )
        );

      // Create embeddings for messages without them
      for (const msg of messages) {
        if (msg.Message_v2) {
          await createMessageEmbedding(msg.Message_v2);
        }
      }

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < messageIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.error('Error batch creating embeddings:', error);
  }
}
