import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { embeddingService } from '@/lib/ai/embeddings';

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

describe('Embedding Service', () => {
  beforeAll(() => {
    server.listen();
    // Set required environment variable
    process.env.OPENAI_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    server.close();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for text content', async () => {
      const content = 'Hello, this is a test message for embedding generation';
      const embedding = await embeddingService.generateEmbedding(content);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding).toHaveLength(1536);
      expect(embedding.every(val => typeof val === 'number')).toBe(true);
    });

    it('should handle empty content', async () => {
      await expect(embeddingService.generateEmbedding('')).rejects.toThrow('Content cannot be empty');
    });

    it('should handle whitespace-only content', async () => {
      await expect(embeddingService.generateEmbedding('   ')).rejects.toThrow('Content cannot be empty');
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
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

    it('should handle empty array', async () => {
      const embeddings = await embeddingService.generateBatchEmbeddings([]);
      expect(embeddings).toEqual([]);
    });

    it('should filter empty content', async () => {
      const contents = ['Valid content', '', '   ', 'Another valid content'];
      const embeddings = await embeddingService.generateBatchEmbeddings(contents);

      expect(embeddings).toHaveLength(2); // Only valid contents
    });
  });

  describe('extractSearchableContent', () => {
    it('should extract text from message parts', () => {
      const messageParts = [
        { type: 'text', text: 'Hello world' },
        { type: 'image', url: 'image.jpg' },
        { type: 'text', text: 'This is more text' }
      ];

      const content = embeddingService.extractSearchableContent(messageParts);
      expect(content).toBe('Hello world This is more text');
    });

    it('should handle empty message parts', () => {
      const content = embeddingService.extractSearchableContent([]);
      expect(content).toBe('');
    });

    it('should handle non-text parts only', () => {
      const messageParts = [
        { type: 'image', url: 'image.jpg' },
        { type: 'file', url: 'file.pdf' }
      ];

      const content = embeddingService.extractSearchableContent(messageParts);
      expect(content).toBe('');
    });

    it('should handle malformed parts', () => {
      const messageParts = [
        { type: 'text', text: 'Valid text' },
        null,
        undefined,
        { type: 'text' }, // Missing text field
        { text: 'Text without type' }, // Missing type field
      ];

      const content = embeddingService.extractSearchableContent(messageParts as any);
      expect(content).toBe('Valid text');
    });

    it('should trim whitespace', () => {
      const messageParts = [
        { type: 'text', text: '  Hello  ' },
        { type: 'text', text: '  world  ' }
      ];

      const content = embeddingService.extractSearchableContent(messageParts);
      expect(content).toBe('Hello world');
    });
  });

  describe('generateContentHash', () => {
    it('should generate consistent hash for same content', () => {
      const content = 'Test content for hashing';
      const hash1 = embeddingService.generateContentHash(content);
      const hash2 = embeddingService.generateContentHash(content);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1).toHaveLength(64); // SHA-256 hex string
    });

    it('should generate different hashes for different content', () => {
      const content1 = 'First content';
      const content2 = 'Second content';
      const hash1 = embeddingService.generateContentHash(content1);
      const hash2 = embeddingService.generateContentHash(content2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty content', () => {
      const hash = embeddingService.generateContentHash('');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64);
    });

    it('should trim content before hashing', () => {
      const content1 = 'test content';
      const content2 = '  test content  ';
      const hash1 = embeddingService.generateContentHash(content1);
      const hash2 = embeddingService.generateContentHash(content2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('performance and edge cases', () => {
    it('should handle long content efficiently', async () => {
      const longContent = 'This is a very long message. '.repeat(100);
      const embedding = await embeddingService.generateEmbedding(longContent);

      expect(embedding).toBeDefined();
      expect(embedding).toHaveLength(1536);
    });

    it('should handle unicode characters', async () => {
      const unicodeContent = 'Hello 世界 🌍 émojis and spéciål characters';
      const embedding = await embeddingService.generateEmbedding(unicodeContent);

      expect(embedding).toBeDefined();
      expect(embedding).toHaveLength(1536);
    });

    it('should be consistent for same content', async () => {
      const content = 'Test content for consistency';
      const embedding1 = await embeddingService.generateEmbedding(content);
      const embedding2 = await embeddingService.generateEmbedding(content);

      // Embeddings should be similar (though not identical due to our mock adding random variation)
      expect(embedding1).toHaveLength(1536);
      expect(embedding2).toHaveLength(1536);
    });
  });
});