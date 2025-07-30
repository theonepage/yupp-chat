
// Load environment variables if not already loaded
if (!process.env.POSTGRES_URL) {
  try {
    const { config } = require('dotenv');
    config({ path: '.env.local' });
  } catch (e) {
    // dotenv not available, continue
  }
}

import { sql, eq, and, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { message, messageEmbedding } from '../db/schema';
import { embeddingService } from '../ai/embeddings';
import { createMessageEmbedding } from '../db/search-queries';

// Use the same database connection as other parts of the app
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);


export class EmbeddingProcessor {
  async processMessageEmbedding(messageId: string): Promise<void> {
    try {
      // Get message data
      const messageData = await db
        .select()
        .from(message)
        .where(eq(message.id, messageId))
        .limit(1);

      if (messageData.length === 0) {
        console.warn(`Message not found: ${messageId}`);
        return;
      }

      await createMessageEmbedding(messageData[0]);
    } catch (error) {
      console.error(`Error processing embedding for message ${messageId}:`, error);
      throw error;
    }
  }

  async batchProcessMissingEmbeddings(batchSize: number = 10): Promise<number> {
    try {
      // Find messages without embeddings
      const messagesWithoutEmbeddings = await db
        .select({ 
          id: message.id,
          parts: message.parts,
          createdAt: message.createdAt
        })
        .from(message)
        .leftJoin(messageEmbedding, eq(message.id, messageEmbedding.messageId))
        .where(sql`${messageEmbedding.messageId} IS NULL`)
        .orderBy(desc(message.createdAt))
        .limit(batchSize);

      console.log(`Found ${messagesWithoutEmbeddings.length} messages without embeddings`);

      let processedCount = 0;

      // Process each message
      for (const msg of messagesWithoutEmbeddings) {
        try {
          const content = embeddingService.extractSearchableContent(msg.parts as any[]);
          
          // Skip messages with no extractable text content
          if (!content.trim()) {
            console.log(`Skipping message ${msg.id} - no text content`);
            continue;
          }

          await this.processMessageEmbedding(msg.id);
          processedCount++;

          // Add a small delay to avoid overwhelming the API
          if (processedCount < messagesWithoutEmbeddings.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`Failed to process embedding for message ${msg.id}:`, error);
          // Continue with other messages even if one fails
        }
      }

      console.log(`Successfully processed ${processedCount} message embeddings`);
      return processedCount;
    } catch (error) {
      console.error('Error in batch processing embeddings:', error);
      throw error;
    }
  }

  async ensureRecentMessagesHaveEmbeddings(limit: number = 50): Promise<void> {
    try {
      // Get recent messages and ensure they have embeddings
      const recentMessages = await db
        .select({ id: message.id })
        .from(message)
        .orderBy(desc(message.createdAt))
        .limit(limit);

      for (const msg of recentMessages) {
        const existing = await db
          .select()
          .from(messageEmbedding)
          .where(eq(messageEmbedding.messageId, msg.id))
          .limit(1);

        if (existing.length === 0) {
          await this.processMessageEmbedding(msg.id);
          // Small delay between processing
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      console.error('Error ensuring recent messages have embeddings:', error);
    }
  }

  async getEmbeddingStats(): Promise<{
    totalMessages: number;
    messagesWithEmbeddings: number;
    coverage: number;
  }> {
    try {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(message);

      const [embeddedResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(messageEmbedding);

      const total = totalResult.count;
      const embedded = embeddedResult.count;
      const coverage = total > 0 ? (embedded / total) * 100 : 0;

      return {
        totalMessages: total,
        messagesWithEmbeddings: embedded,
        coverage: Math.round(coverage * 100) / 100,
      };
    } catch (error) {
      console.error('Error getting embedding stats:', error);
      return {
        totalMessages: 0,
        messagesWithEmbeddings: 0,
        coverage: 0,
      };
    }
  }
}

// Export a singleton instance
export const embeddingProcessor = new EmbeddingProcessor();
