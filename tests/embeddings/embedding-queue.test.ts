import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { embeddingQueue } from '@/lib/jobs/embedding-queue';
import { saveMessages } from '@/lib/db/queries';
import { mockDb } from '../mocks/database';
import '../mocks/setup';

describe('Embedding Queue and Automation', () => {
  let testUser: any;
  let testChat: any;

  beforeEach(async () => {
    await mockDb.cleanup();
    testUser = await mockDb.createTestUser();
    testChat = await mockDb.createTestChat(testUser.id);
    embeddingQueue.clear(); // Clear queue before each test
  });

  afterEach(async () => {
    await mockDb.cleanup();
    embeddingQueue.clear();
  });

  describe('EmbeddingQueue', () => {
    it('should enqueue messages for processing', async () => {
      const messageId = 'test-message-id';
      
      embeddingQueue.enqueue(messageId, 'normal');
      
      const status = embeddingQueue.getStatus();
      expect(status.queueLength).toBe(1);
      expect(status.nextJob).toBe(messageId);
    });

    it('should prioritize high priority messages', async () => {
      embeddingQueue.enqueue('normal-message', 'normal');
      embeddingQueue.enqueue('high-message', 'high');
      embeddingQueue.enqueue('low-message', 'low');
      
      const status = embeddingQueue.getStatus();
      expect(status.nextJob).toBe('high-message');
    });

    it('should process queue automatically', async () => {
      // Create a real message for processing
      const testMessage = await mockDb.createTestMessage(testChat.id, 'Test message for queue processing');
      
      embeddingQueue.enqueue(testMessage.id, 'high');
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if embedding was created
      const embeddings = await mockDb.database
        .select()
        .from(mockDb.database.schema.messageEmbedding)
        .where(eq(mockDb.database.schema.messageEmbedding.messageId, testMessage.id));
      
      expect(embeddings.length).toBeGreaterThan(0);
    });

    it('should handle processing errors gracefully', async () => {
      const nonExistentMessageId = 'non-existent-message';
      
      embeddingQueue.enqueue(nonExistentMessageId, 'normal');
      
      // Wait for processing attempt
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Queue should continue processing despite error
      const status = embeddingQueue.getStatus();
      expect(status.processing).toBe(false);
    });

    it('should retry failed jobs', async () => {
      const spy = vi.spyOn(console, 'log');
      const nonExistentMessageId = 'non-existent-message';
      
      embeddingQueue.enqueue(nonExistentMessageId, 'normal');
      
      // Wait for multiple retry attempts
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Should see retry messages in logs
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Retrying'));
      spy.mockRestore();
    });

    it('should stop retrying after max attempts', async () => {
      const spy = vi.spyOn(console, 'error');
      const nonExistentMessageId = 'non-existent-message';
      
      embeddingQueue.enqueue(nonExistentMessageId, 'normal');
      
      // Wait for all retry attempts
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Should see max retries exceeded message
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Max retries exceeded'));
      spy.mockRestore();
    });
  });

  describe('Automated Message Embedding', () => {
    it('should automatically queue embeddings when messages are saved', async () => {
      const spy = vi.spyOn(embeddingQueue, 'enqueue');
      
      const testMessages = [
        {
          id: 'test-msg-1',
          chatId: testChat.id,
          role: 'user' as const,
          parts: [{ type: 'text', text: 'First test message' }],
          attachments: [],
          createdAt: new Date(),
        },
        {
          id: 'test-msg-2',
          chatId: testChat.id,
          role: 'assistant' as const,
          parts: [{ type: 'text', text: 'Second test message' }],
          attachments: [],
          createdAt: new Date(),
        }
      ];

      await saveMessages({ messages: testMessages });

      // Should have enqueued both messages
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('test-msg-1', 'normal');
      expect(spy).toHaveBeenCalledWith('test-msg-2', 'normal');
      
      spy.mockRestore();
    });

    it('should respect embedding configuration', async () => {
      // Mock configuration to disable auto-generation
      const originalConfig = require('@/lib/config/embeddings').embeddingConfig;
      const mockConfig = { ...originalConfig, autoGenerate: false };
      vi.doMock('@/lib/config/embeddings', () => ({ embeddingConfig: mockConfig }));
      
      const spy = vi.spyOn(embeddingQueue, 'enqueue');
      
      const testMessage = {
        id: 'test-msg-disabled',
        chatId: testChat.id,
        role: 'user' as const,
        parts: [{ type: 'text', text: 'This should not be queued' }],
        attachments: [],
        createdAt: new Date(),
      };

      await saveMessages({ messages: [testMessage] });

      // Should not have enqueued when disabled
      expect(spy).not.toHaveBeenCalled();
      
      spy.mockRestore();
      vi.doUnmock('@/lib/config/embeddings');
    });
  });

  describe('Integration Tests', () => {
    it('should complete full embedding workflow', async () => {
      // 1. Create and save messages
      const testMessages = [
        {
          id: 'integration-msg-1',
          chatId: testChat.id,
          role: 'user' as const,
          parts: [{ type: 'text', text: 'What is machine learning?' }],
          attachments: [],
          createdAt: new Date(),
        },
        {
          id: 'integration-msg-2',
          chatId: testChat.id,
          role: 'assistant' as const,
          parts: [{ type: 'text', text: 'Machine learning is a subset of AI' }],
          attachments: [],
          createdAt: new Date(),
        }
      ];

      await saveMessages({ messages: testMessages });

      // 2. Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 3. Verify embeddings were created
      for (const message of testMessages) {
        const embeddings = await mockDb.database
          .select()
          .from(mockDb.database.schema.messageEmbedding)
          .where(eq(mockDb.database.schema.messageEmbedding.messageId, message.id));
        
        expect(embeddings).toHaveLength(1);
        expect(embeddings[0].embedding).toBeDefined();
      }

      // 4. Test search functionality
      const { searchMessages } = await import('@/lib/db/search-queries');
      const searchResults = await searchMessages({
        userId: testUser.id,
        query: 'machine learning',
        limit: 10,
        similarityThreshold: 0.1
      });

      expect(searchResults.results.length).toBeGreaterThan(0);
      expect(searchResults.results.some(r => r.messageId === 'integration-msg-1')).toBe(true);
    });

    it('should handle mixed content types', async () => {
      const mixedMessage = {
        id: 'mixed-content-msg',
        chatId: testChat.id,
        role: 'user' as const,
        parts: [
          { type: 'text', text: 'Here is some text' },
          { type: 'image', url: 'https://example.com/image.jpg' },
          { type: 'text', text: 'and more text after image' }
        ],
        attachments: [],
        createdAt: new Date(),
      };

      await saveMessages({ messages: [mixedMessage] });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should extract only text content for embedding
      const embeddings = await mockDb.database
        .select()
        .from(mockDb.database.schema.messageEmbedding)
        .where(eq(mockDb.database.schema.messageEmbedding.messageId, mixedMessage.id));

      expect(embeddings).toHaveLength(1);

      // Search should find the text content
      const { searchMessages } = await import('@/lib/db/search-queries');
      const searchResults = await searchMessages({
        userId: testUser.id,
        query: 'text after image',
        limit: 10,
        similarityThreshold: 0.1
      });

      expect(searchResults.results.some(r => r.messageId === 'mixed-content-msg')).toBe(true);
    });
  });
});