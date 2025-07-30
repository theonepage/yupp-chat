import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { embeddingService } from '@/lib/ai/embeddings';
import { createMessageEmbedding } from '@/lib/db/search-queries';
import { embeddingProcessor } from '@/lib/jobs/embedding-processor';
import { messageEmbedding } from '@/lib/db/schema';
import { mockDb } from '../mocks/database';
import '../mocks/setup';

describe('Embedding Creation', () => {
  let testUser: any;
  let testChat: any;

  beforeEach(async () => {
    await mockDb.cleanup();
    testUser = await mockDb.createTestUser();
    testChat = await mockDb.createTestChat(testUser.id);
  });

  afterEach(async () => {
    await mockDb.cleanup();
  });

  describe('EmbeddingService', () => {
    it('should generate embedding for text content', async () => {
      const content = 'Hello, this is a test message for embedding generation';
      const embedding = await embeddingService.generateEmbedding(content);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding).toHaveLength(1536);
      expect(embedding.every(val => typeof val === 'number')).toBe(true);
    });

    it('should generate batch embeddings', async () => {
      const contents = [
        'First test message',
        'Second test message',
        'Third test message'
      ];
      const embeddings = await embeddingService.generateBatchEmbeddings(contents);

      expect(embeddings).toBeDefined();
      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings).toHaveLength(3);
      expect(embeddings.every(emb => emb.length === 1536)).toBe(true);
    });

    it('should extract searchable content from message parts', () => {
      const messageParts = [
        { type: 'text', text: 'Hello world' },
        { type: 'image', url: 'image.jpg' },
        { type: 'text', text: 'This is more text' }
      ];

      const content = embeddingService.extractSearchableContent(messageParts);
      expect(content).toBe('Hello world This is more text');
    });

    it('should generate content hash', () => {
      const content = 'Test content for hashing';
      const hash = embeddingService.generateContentHash(content);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // SHA-256 hex string
    });

    it('should handle empty content gracefully', async () => {
      await expect(embeddingService.generateEmbedding('')).rejects.toThrow('Content cannot be empty');
    });
  });

  describe('Message Embedding Creation', () => {
    it('should create embedding for message with text content', async () => {
      const testMessage = await mockDb.createTestMessage(
        testChat.id,
        'This is a test message for embedding creation'
      );

      await createMessageEmbedding(testMessage);

      // Verify embedding was created
      const embeddings = await mockDb.database
        .select()
        .from(messageEmbedding)
        .where(eq(messageEmbedding.messageId, testMessage.id));

      expect(embeddings).toHaveLength(1);
      expect(embeddings[0].embedding).toBeDefined();
      expect(embeddings[0].contentHash).toBeDefined();
    });

    it('should skip empty message content', async () => {
      const testMessage = await mockDb.createTestMessage(testChat.id, '');

      await createMessageEmbedding(testMessage);

      // Verify no embedding was created
      const embeddings = await mockDb.database
        .select()
        .from(messageEmbedding)
        .where(eq(messageEmbedding.messageId, testMessage.id));

      expect(embeddings).toHaveLength(0);
    });

    it('should not duplicate embeddings for same content', async () => {
      const content = 'This is duplicate content';
      const testMessage = await mockDb.createTestMessage(testChat.id, content);

      // Create embedding twice
      await createMessageEmbedding(testMessage);
      await createMessageEmbedding(testMessage);

      // Verify only one embedding exists
      const embeddings = await mockDb.database
        .select()
        .from(messageEmbedding)
        .where(eq(messageEmbedding.messageId, testMessage.id));

      expect(embeddings).toHaveLength(1);
    });
  });

  describe('Embedding Processor', () => {
    it('should process single message embedding', async () => {
      const testMessage = await mockDb.createTestMessage(
        testChat.id,
        'Process this message for embedding'
      );

      await embeddingProcessor.processMessageEmbedding(testMessage.id);

      // Verify embedding was processed
      const embeddings = await mockDb.database
        .select()
        .from(messageEmbedding)
        .where(eq(messageEmbedding.messageId, testMessage.id));

      expect(embeddings).toHaveLength(1);
    });

    it('should batch process missing embeddings', async () => {
      // Create multiple messages without embeddings
      const messages = await Promise.all([
        mockDb.createTestMessage(testChat.id, 'First message'),
        mockDb.createTestMessage(testChat.id, 'Second message'),
        mockDb.createTestMessage(testChat.id, 'Third message')
      ]);

      const processed = await embeddingProcessor.batchProcessMissingEmbeddings(10);

      expect(processed).toBe(3);

      // Verify all embeddings were created
      for (const message of messages) {
        const embeddings = await mockDb.database
          .select()
          .from(messageEmbedding)
          .where(eq(messageEmbedding.messageId, message.id));

        expect(embeddings).toHaveLength(1);
      }
    });

    it('should get embedding statistics', async () => {
      // Create messages with and without embeddings
      const message1 = await mockDb.createTestMessage(testChat.id, 'Message with embedding');
      const message2 = await mockDb.createTestMessage(testChat.id, 'Message without embedding');

      // Create embedding for first message only
      await createMessageEmbedding(message1);

      const stats = await embeddingProcessor.getEmbeddingStats();

      expect(stats.totalMessages).toBe(2);
      expect(stats.messagesWithEmbeddings).toBe(1);
      expect(stats.coverage).toBe(50);
    });
  });
});