import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { embeddingService } from '@/lib/ai/embeddings';
import { embeddingQueue } from '@/lib/jobs/embedding-queue';

// Mock OpenAI API responses
const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.1);

const server = setupServer(
  http.post('https://api.openai.com/v1/embeddings', async ({ request }) => {
    const body = await request.json() as any;
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Mock response based on input
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const embeddings = inputs.map((_: string, index: number) => ({
      object: 'embedding',
      index,
      embedding: mockEmbedding.map(val => val + Math.random() * 0.01), // Add small variation
    }));
    
    return HttpResponse.json({
      object: 'list',
      data: embeddings,
      model: 'text-embedding-3-small',
      usage: {
        prompt_tokens: inputs.join(' ').length / 4,
        total_tokens: inputs.join(' ').length / 4,
      },
    });
  })
);

describe('Embedding Integration Tests', () => {
  beforeAll(() => {
    server.listen();
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    server.close();
  });

  describe('End-to-End Workflow', () => {
    it('should demonstrate complete embedding workflow', async () => {
      // 1. Test basic embedding generation
      const testMessages = [
        'What is machine learning?',
        'Machine learning is a subset of artificial intelligence.',
        'How do neural networks work?',
        'Neural networks process information through interconnected nodes.'
      ];

      // 2. Generate embeddings for all messages
      const embeddings = await embeddingService.generateBatchEmbeddings(testMessages);
      
      expect(embeddings).toHaveLength(4);
      expect(embeddings.every(emb => emb.length === 1536)).toBe(true);

      // 3. Test content extraction from complex message parts
      const complexMessageParts = [
        { type: 'text', text: 'Here is some explanatory text.' },
        { type: 'code', code: 'const x = 42;', language: 'javascript' },
        { type: 'text', text: 'And here is more explanation.' },
        { type: 'image', url: 'https://example.com/diagram.png', alt: 'Diagram' },
        { type: 'text', text: 'Final thoughts on the topic.' }
      ];

      const extractedContent = embeddingService.extractSearchableContent(complexMessageParts);
      expect(extractedContent).toBe('Here is some explanatory text. And here is more explanation. Final thoughts on the topic.');

      // 4. Generate embedding for extracted content
      const complexEmbedding = await embeddingService.generateEmbedding(extractedContent);
      expect(complexEmbedding).toHaveLength(1536);

      // 5. Test content hashing for deduplication
      const hash1 = embeddingService.generateContentHash(extractedContent);
      const hash2 = embeddingService.generateContentHash(extractedContent);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hash

      // 6. Test queue functionality (without actual processing to avoid DB errors)
      embeddingQueue.clear();
      
      // Add a small delay to ensure queue is fully cleared
      await new Promise(resolve => setTimeout(resolve, 50));
      
      embeddingQueue.enqueue('test-message-1', 'high');
      embeddingQueue.enqueue('test-message-2', 'normal');
      
      // Check queue status immediately after enqueueing
      const queueStatus = embeddingQueue.getStatus();
      expect(queueStatus.queueLength).toBeGreaterThanOrEqual(1);
      
      // Clear queue again to prevent background processing
      embeddingQueue.clear();
    });

    it('should handle mixed content types and languages', async () => {
      const multilingualMessages = [
        'Hello world in English',
        'Hola mundo en español',
        '世界你好 in Chinese',
        'Bonjour le monde en français',
        'مرحبا بالعالم in Arabic'
      ];

      const embeddings = await embeddingService.generateBatchEmbeddings(multilingualMessages);
      
      expect(embeddings).toHaveLength(5);
      expect(embeddings.every(emb => emb.length === 1536)).toBe(true);
      
      // Each embedding should be different
      const uniqueEmbeddings = new Set(embeddings.map(emb => JSON.stringify(emb)));
      expect(uniqueEmbeddings.size).toBe(5);
    });

    it('should efficiently process large batches', async () => {
      const largeMessageBatch = Array.from({ length: 50 }, (_, i) => 
        `Test message number ${i + 1} with different content to ensure uniqueness.`
      );

      const startTime = Date.now();
      const embeddings = await embeddingService.generateBatchEmbeddings(largeMessageBatch);
      const processingTime = Date.now() - startTime;

      expect(embeddings).toHaveLength(50);
      expect(embeddings.every(emb => emb.length === 1536)).toBe(true);
      
      // Should process reasonably quickly (mocked API is fast)
      expect(processingTime).toBeLessThan(2000); // 2 seconds max
      
      console.log(`Processed ${largeMessageBatch.length} embeddings in ${processingTime}ms`);
    });

    it('should handle edge cases gracefully', async () => {
      const edgeCases = [
        '', // Empty string (should be filtered out)
        '   ', // Whitespace only (should be filtered out)
        'A', // Single character
        'A'.repeat(10000), // Very long string
        '🚀🌟⭐️🎯🔥', // Emoji only
        '123 456 789', // Numbers
        'Mixed content: text, 123, emojis 🎉, and symbols !@#$%'
      ];

      // Filter out empty content first
      const validContent = edgeCases.filter(content => content.trim().length > 0);
      const embeddings = await embeddingService.generateBatchEmbeddings(validContent);
      
      expect(embeddings).toHaveLength(validContent.length);
      expect(embeddings.every(emb => emb.length === 1536)).toBe(true);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should measure embedding generation performance', async () => {
      const testSizes = [1, 5, 10, 20];
      const results: { size: number; time: number; avgPerItem: number }[] = [];

      for (const size of testSizes) {
        const messages = Array.from({ length: size }, (_, i) => 
          `Performance test message ${i + 1} with enough content to be meaningful for embedding generation.`
        );

        const startTime = Date.now();
        const embeddings = await embeddingService.generateBatchEmbeddings(messages);
        const endTime = Date.now();
        
        const totalTime = endTime - startTime;
        const avgPerItem = totalTime / size;
        
        results.push({ size, time: totalTime, avgPerItem });
        
        expect(embeddings).toHaveLength(size);
        expect(embeddings.every(emb => emb.length === 1536)).toBe(true);
      }

      console.log('Performance Results:');
      results.forEach(result => {
        console.log(`  ${result.size} items: ${result.time}ms total, ${result.avgPerItem.toFixed(2)}ms avg per item`);
      });

      // Performance should scale reasonably
      expect(results[results.length - 1].avgPerItem).toBeLessThan(100); // Less than 100ms per item on average
    });
  });

  describe('Data Quality Tests', () => {
    it('should produce consistent embeddings for similar content', async () => {
      const similarMessages = [
        'The quick brown fox jumps over the lazy dog',
        'A quick brown fox jumps over the lazy dog',
        'The fast brown fox leaps over the sleepy dog'
      ];

      const embeddings = await embeddingService.generateBatchEmbeddings(similarMessages);
      
      // All embeddings should be valid
      expect(embeddings).toHaveLength(3);
      expect(embeddings.every(emb => emb.length === 1536)).toBe(true);
      
      // Calculate simple similarity (dot product approximation)
      const similarity01 = embeddings[0].reduce((sum, val, i) => sum + val * embeddings[1][i], 0);
      const similarity02 = embeddings[0].reduce((sum, val, i) => sum + val * embeddings[2][i], 0);
      
      // Similar content should have positive similarity
      expect(similarity01).toBeGreaterThan(0);
      expect(similarity02).toBeGreaterThan(0);
    });

    it('should handle content deduplication correctly', async () => {
      const duplicateContent = 'This is duplicate content for testing';
      const uniqueContent = 'This is unique content for comparison';
      
      const hash1 = embeddingService.generateContentHash(duplicateContent);
      const hash2 = embeddingService.generateContentHash(duplicateContent);
      const hash3 = embeddingService.generateContentHash(uniqueContent);
      
      // Same content should produce same hash
      expect(hash1).toBe(hash2);
      // Different content should produce different hash
      expect(hash1).not.toBe(hash3);
      
      // All hashes should be valid SHA-256
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
      expect(hash3).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});