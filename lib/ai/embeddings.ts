import { embed, embedMany } from 'ai';
import { createHash } from 'crypto';
import { openai } from '@ai-sdk/openai';

export interface EmbeddingService {
  generateEmbedding(content: string): Promise<number[]>;
  generateBatchEmbeddings(contents: string[]): Promise<number[][]>;
  extractSearchableContent(messageParts: any[]): string;
  generateContentHash(content: string): string;
}

export class OpenAIEmbeddingService implements EmbeddingService {
  private model = openai.textEmbeddingModel('text-embedding-3-small');

  async generateEmbedding(content: string): Promise<number[]> {
    if (!content.trim()) {
      throw new Error('Content cannot be empty');
    }

    const { embedding } = await embed({
      model: this.model as any,
      value: content,
    });
    return Array.from(embedding);
  }

  async generateBatchEmbeddings(contents: string[]): Promise<number[][]> {
    if (contents.length === 0) {
      return [];
    }

    const filteredContents = contents.filter(content => content.trim());
    if (filteredContents.length === 0) {
      return [];
    }

    const { embeddings } = await embedMany({
      model: this.model as any,
      values: filteredContents,
    });
    return embeddings.map(embedding => Array.from(embedding));
  }

  extractSearchableContent(messageParts: any[]): string {
    if (!Array.isArray(messageParts)) {
      return '';
    }

    // Extract text content from message parts JSON
    return messageParts
      .filter(part => part && typeof part === 'object' && part.type === 'text')
      .map(part => (part.text || '').trim())
      .filter(text => text.length > 0)
      .join(' ')
      .trim();
  }

  generateContentHash(content: string): string {
    return createHash('sha256').update(content.trim()).digest('hex');
  }
}

// Export a singleton instance
export const embeddingService = new OpenAIEmbeddingService();
