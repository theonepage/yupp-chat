import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { user, chat, message, messageEmbedding, searchSession, vote, stream, voteDeprecated, messageDeprecated, document, suggestion } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';

// Mock database setup for tests
export class MockDatabase {
  private client: postgres.Sql;
  private db: ReturnType<typeof drizzle>;

  constructor() {
    // Use a test database or in-memory database
    this.client = postgres(process.env.TEST_POSTGRES_URL || process.env.POSTGRES_URL!);
    this.db = drizzle(this.client);
  }

  async cleanup() {
    // Clean up test data in correct order to avoid foreign key constraint violations
    await this.db.delete(suggestion); // Delete suggestions before documents
    await this.db.delete(document); // Delete documents before users
    await this.db.delete(searchSession); // Delete search sessions before users
    await this.db.delete(vote); // Delete votes first before messages
    await this.db.delete(voteDeprecated); // Delete deprecated votes
    await this.db.delete(messageEmbedding);
    await this.db.delete(message);
    await this.db.delete(messageDeprecated); // Delete deprecated messages
    await this.db.delete(stream); // Delete streams before chats
    await this.db.delete(chat);
    await this.db.delete(user);
  }

  async createTestUser() {
    const userId = generateUUID();
    const [testUser] = await this.db.insert(user).values({
      id: userId,
      email: `test-${Date.now()}@example.com`,
      password: 'hashed-password',
    }).returning();

    return testUser;
  }

  async createTestChat(userId: string) {
    const chatId = generateUUID();
    const [testChat] = await this.db.insert(chat).values({
      id: chatId,
      userId,
      title: 'Test Chat',
      createdAt: new Date(),
      visibility: 'private',
    }).returning();

    return testChat;
  }

  async createTestMessage(chatId: string, content: string, role: 'user' | 'assistant' = 'user') {
    const messageId = generateUUID();
    const [testMessage] = await this.db.insert(message).values({
      id: messageId,
      chatId,
      role,
      parts: [{ type: 'text', text: content }],
      attachments: [],
      createdAt: new Date(),
    }).returning();

    return testMessage;
  }

  async createTestEmbedding(messageId: string, embedding: number[], contentHash: string) {
    const [testEmbedding] = await this.db.insert(messageEmbedding).values({
      messageId,
      embedding,
      contentHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return testEmbedding;
  }

  get database() {
    return this.db;
  }

  async close() {
    await this.client.end();
  }
}

export const mockDb = new MockDatabase();