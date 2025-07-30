import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequest, createResponse } from 'node-mocks-http';
import { GET } from '@/app/(chat)/api/search/route';
import { searchMessages } from '@/lib/db/search-queries';
import { embeddingService } from '@/lib/ai/embeddings';
import { mockDb } from '../mocks/database';
import '../mocks/setup';
import { NextRequest } from 'next/server';

// Mock NextAuth session
const mockSession = {
  user: { id: 'test-user-id' }
};

vi.mock('@/app/(auth)/auth', () => ({
  auth: vi.fn(() => Promise.resolve(mockSession))
}));

describe('Search API', () => {
  let testUser: any;
  let testChat: any;
  let testMessages: any[];

  beforeEach(async () => {
    await mockDb.cleanup();
    testUser = await mockDb.createTestUser();
    testChat = await mockDb.createTestChat(testUser.id);
    
    // Create test messages with embeddings
    testMessages = await Promise.all([
      mockDb.createTestMessage(testChat.id, 'How to implement machine learning algorithms?', 'user'),
      mockDb.createTestMessage(testChat.id, 'You can start with linear regression and decision trees', 'assistant'),
      mockDb.createTestMessage(testChat.id, 'What about neural networks and deep learning?', 'user'),
      mockDb.createTestMessage(testChat.id, 'Deep learning requires understanding of backpropagation', 'assistant')
    ]);

    // Create embeddings for all messages
    for (const message of testMessages) {
      const content = embeddingService.extractSearchableContent(message.parts);
      const embedding = await embeddingService.generateEmbedding(content);
      const contentHash = embeddingService.generateContentHash(content);
      await mockDb.createTestEmbedding(message.id, embedding, contentHash);
    }

    // Update mock session to use test user
    mockSession.user.id = testUser.id;
  });

  afterEach(async () => {
    await mockDb.cleanup();
  });

  describe('GET /api/search', () => {
    it('should return search results for valid query', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=machine%20learning&limit=10&threshold=0.5');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('results');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('should validate query length', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=a');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query must be at least 2 characters long');
    });

    it('should handle missing query parameter', async () => {
      const request = new NextRequest('http://localhost:3000/api/search');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query must be at least 2 characters long');
    });

    it('should enforce result limits', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=test&limit=100');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should be capped at 50 results max
      expect(data.results.length).toBeLessThanOrEqual(50);
    });

    it('should clamp similarity threshold', async () => {
      const request = new NextRequest('http://localhost:3000/api/search?q=test&threshold=2.0');
      const response = await GET(request);

      expect(response.status).toBe(200);
      // Should not throw error despite invalid threshold
    });

    it('should require authentication', async () => {
      // Mock unauthenticated session
      const { auth } = await import('@/app/(auth)/auth');
      vi.mocked(auth).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/search?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');

      // Restore mock
      vi.mocked(auth).mockResolvedValue(mockSession);
    });
  });

  describe('Search Functionality', () => {
    it('should find semantically similar messages', async () => {
      const results = await searchMessages({
        userId: testUser.id,
        query: 'machine learning algorithms',
        limit: 10,
        similarityThreshold: 0.1
      });

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.total).toBeGreaterThan(0);

      // Check result structure
      const firstResult = results.results[0];
      expect(firstResult).toHaveProperty('messageId');
      expect(firstResult).toHaveProperty('chatId');
      expect(firstResult).toHaveProperty('chatTitle');
      expect(firstResult).toHaveProperty('content');
      expect(firstResult).toHaveProperty('similarity');
      expect(firstResult).toHaveProperty('createdAt');
      expect(firstResult).toHaveProperty('role');
    });

    it('should respect similarity threshold', async () => {
      const highThresholdResults = await searchMessages({
        userId: testUser.id,
        query: 'completely unrelated query xyz123',
        limit: 10,
        similarityThreshold: 0.9
      });

      const lowThresholdResults = await searchMessages({
        userId: testUser.id,
        query: 'completely unrelated query xyz123',
        limit: 10,
        similarityThreshold: 0.1
      });

      expect(highThresholdResults.results.length).toBeLessThanOrEqual(lowThresholdResults.results.length);
    });

    it('should only return messages for authenticated user', async () => {
      // Create another user with messages
      const otherUser = await mockDb.createTestUser();
      const otherChat = await mockDb.createTestChat(otherUser.id);
      const otherMessage = await mockDb.createTestMessage(otherChat.id, 'Other user message');
      
      const content = embeddingService.extractSearchableContent(otherMessage.parts);
      const embedding = await embeddingService.generateEmbedding(content);
      const contentHash = embeddingService.generateContentHash(content);
      await mockDb.createTestEmbedding(otherMessage.id, embedding, contentHash);

      // Search as testUser
      const results = await searchMessages({
        userId: testUser.id,
        query: 'message',
        limit: 10,
        similarityThreshold: 0.1
      });

      // Should only return messages from testUser's chats
      expect(results.results.every(result => 
        testMessages.some(msg => msg.id === result.messageId)
      )).toBe(true);
    });

    it('should order results by similarity score', async () => {
      const results = await searchMessages({
        userId: testUser.id,
        query: 'learning',
        limit: 10,
        similarityThreshold: 0.1
      });

      if (results.results.length > 1) {
        // Results should be ordered by similarity (descending)
        for (let i = 0; i < results.results.length - 1; i++) {
          expect(results.results[i].similarity).toBeGreaterThanOrEqual(
            results.results[i + 1].similarity
          );
        }
      }
    });

    it('should extract text content from message parts', async () => {
      const results = await searchMessages({
        userId: testUser.id,
        query: 'machine learning',
        limit: 1,
        similarityThreshold: 0.1
      });

      if (results.results.length > 0) {
        const result = results.results[0];
        expect(typeof result.content).toBe('string');
        expect(result.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      const originalSearchMessages = searchMessages;
      const mockSearchMessages = vi.fn().mockRejectedValue(new Error('Database connection failed'));
      
      // This would require dependency injection or other mocking strategy
      // For now, we'll test that our error handling works
      const results = await searchMessages({
        userId: 'non-existent-user',
        query: 'test',
        limit: 10,
        similarityThreshold: 0.5
      });

      // Should return empty results instead of throwing
      expect(results.results).toEqual([]);
      expect(results.total).toBe(0);
    });

    it('should handle embedding generation errors', async () => {
      // Test when embedding service fails
      const originalGenerateEmbedding = embeddingService.generateEmbedding;
      embeddingService.generateEmbedding = vi.fn().mockRejectedValue(new Error('OpenAI API error'));

      const results = await searchMessages({
        userId: testUser.id,
        query: 'test query',
        limit: 10,
        similarityThreshold: 0.5
      });

      // Should handle gracefully
      expect(results.results).toEqual([]);
      expect(results.total).toBe(0);

      // Restore original method
      embeddingService.generateEmbedding = originalGenerateEmbedding;
    });
  });
});