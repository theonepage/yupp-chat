#!/usr/bin/env tsx

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { 
  user, 
  chat, 
  message, 
  messageDeprecated, 
  vote, 
  voteDeprecated, 
  document, 
  suggestion, 
  stream, 
  messageEmbedding, 
  searchSession 
} from '../lib/db/schema';
import { sql } from 'drizzle-orm';

config({ path: '.env.local' });

const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

async function cleanupDatabase() {
  console.log('🧹 Starting Neon database cleanup...');

  try {
    // Delete old search sessions (older than 30 days)
    console.log('🔍 Cleaning up old search sessions...');
    const oldSearchSessions = await db
      .delete(searchSession)
      .where(sql`${searchSession.createdAt} < NOW() - INTERVAL '30 days'`)
      .returning({ id: searchSession.id });
    console.log(`✅ Deleted ${oldSearchSessions.length} old search sessions`);

    // Delete orphaned message embeddings
    console.log('🔗 Cleaning up orphaned message embeddings...');
    const orphanedEmbeddings = await db
      .delete(messageEmbedding)
      .where(sql`NOT EXISTS (
        SELECT 1 FROM ${message} WHERE ${message.id} = ${messageEmbedding.messageId}
      )`)
      .returning({ id: messageEmbedding.id });
    console.log(`✅ Deleted ${orphanedEmbeddings.length} orphaned embeddings`);

    // Delete deprecated messages and their votes (if any exist)
    console.log('🗑️  Cleaning up deprecated message tables...');
    const deprecatedVotes = await db
      .delete(voteDeprecated)
      .returning({ chatId: voteDeprecated.chatId });
    console.log(`✅ Deleted ${deprecatedVotes.length} deprecated votes`);

    const deprecatedMessages = await db
      .delete(messageDeprecated)
      .returning({ id: messageDeprecated.id });
    console.log(`✅ Deleted ${deprecatedMessages.length} deprecated messages`);

    // Delete resolved suggestions older than 90 days
    console.log('💡 Cleaning up old resolved suggestions...');
    const oldSuggestions = await db
      .delete(suggestion)
      .where(sql`${suggestion.isResolved} = true AND ${suggestion.createdAt} < NOW() - INTERVAL '90 days'`)
      .returning({ id: suggestion.id });
    console.log(`✅ Deleted ${oldSuggestions.length} old resolved suggestions`);

    // Clean up streams from empty chats first (to avoid FK constraint issues)
    console.log('🌊 Cleaning up streams from empty chats...');
    const streamsFromEmptyChats = await db
      .delete(stream)
      .where(sql`${stream.chatId} IN (
        SELECT ${chat.id} FROM ${chat}
        WHERE NOT EXISTS (
          SELECT 1 FROM ${message} WHERE ${message.chatId} = ${chat.id}
        )
      )`)
      .returning({ id: stream.id });
    console.log(`✅ Deleted ${streamsFromEmptyChats.length} streams from empty chats`);

    // Delete empty chats (chats with no messages) - now safe to delete
    console.log('💬 Cleaning up empty chats...');
    const emptyChats = await db
      .delete(chat)
      .where(sql`NOT EXISTS (
        SELECT 1 FROM ${message} WHERE ${message.chatId} = ${chat.id}
      )`)
      .returning({ id: chat.id });
    console.log(`✅ Deleted ${emptyChats.length} empty chats`);

    // Clean up any remaining orphaned streams
    console.log('🌊 Cleaning up remaining orphaned streams...');
    const orphanedStreams = await db
      .delete(stream)
      .where(sql`NOT EXISTS (
        SELECT 1 FROM ${chat} WHERE ${chat.id} = ${stream.chatId}
      )`)
      .returning({ id: stream.id });
    console.log(`✅ Deleted ${orphanedStreams.length} remaining orphaned streams`);

    // Clean up orphaned documents (optional - if user is deleted)
    console.log('📄 Cleaning up orphaned documents...');
    const orphanedDocuments = await db
      .delete(document)
      .where(sql`NOT EXISTS (
        SELECT 1 FROM ${user} WHERE ${user.id} = ${document.userId}
      )`)
      .returning({ id: document.id });
    console.log(`✅ Deleted ${orphanedDocuments.length} orphaned documents`);

    // Vacuum analyze for performance (only on user tables to avoid system table warnings)
    console.log('🔧 Running VACUUM ANALYZE for optimization...');
    const userTables = ['User', 'Chat', 'Message_v2', 'Vote_v2', 'Document', 'Suggestion', 'Stream', 'message_embeddings', 'search_sessions'];
    for (const table of userTables) {
      await db.execute(sql.raw(`VACUUM ANALYZE "${table}"`));
    }
    console.log('✅ Database optimization complete');

    console.log('\n🎉 Database cleanup completed successfully!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Add dry run option
async function dryRun() {
  console.log('🔍 Running dry run - no changes will be made...\n');
  
  try {
    // Count old search sessions
    const oldSearchSessionsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(searchSession)
      .where(sql`${searchSession.createdAt} < NOW() - INTERVAL '30 days'`);
    console.log(`🔍 Would delete ${oldSearchSessionsCount[0].count} old search sessions`);

    // Count orphaned embeddings
    const orphanedEmbeddingsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(messageEmbedding)
      .where(sql`NOT EXISTS (
        SELECT 1 FROM ${message} WHERE ${message.id} = ${messageEmbedding.messageId}
      )`);
    console.log(`🔗 Would delete ${orphanedEmbeddingsCount[0].count} orphaned embeddings`);

    // Count deprecated data
    const deprecatedVotesCount = await db.select({ count: sql<number>`count(*)` }).from(voteDeprecated);
    const deprecatedMessagesCount = await db.select({ count: sql<number>`count(*)` }).from(messageDeprecated);
    console.log(`🗑️  Would delete ${deprecatedVotesCount[0].count} deprecated votes and ${deprecatedMessagesCount[0].count} deprecated messages`);

    // Count old suggestions
    const oldSuggestionsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(suggestion)
      .where(sql`${suggestion.isResolved} = true AND ${suggestion.createdAt} < NOW() - INTERVAL '90 days'`);
    console.log(`💡 Would delete ${oldSuggestionsCount[0].count} old resolved suggestions`);

    // Count empty chats
    const emptyChatsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(chat)
      .where(sql`NOT EXISTS (
        SELECT 1 FROM ${message} WHERE ${message.chatId} = ${chat.id}
      )`);
    console.log(`💬 Would delete ${emptyChatsCount[0].count} empty chats`);

    console.log('\n🔍 Dry run completed - run with --execute to perform cleanup');

  } catch (error) {
    console.error('❌ Error during dry run:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function aggressiveCleanup() {
  console.log('🧨 Starting AGGRESSIVE database cleanup - ALL DATA will be removed!');
  console.log('⚠️  This will delete ALL chats, messages, documents, and related data.');
  
  try {
    // Delete all search sessions
    console.log('🔍 Deleting ALL search sessions...');
    const allSearchSessions = await db.delete(searchSession).returning({ id: searchSession.id });
    console.log(`✅ Deleted ${allSearchSessions.length} search sessions`);

    // Delete all message embeddings
    console.log('🔗 Deleting ALL message embeddings...');
    const allEmbeddings = await db.delete(messageEmbedding).returning({ id: messageEmbedding.id });
    console.log(`✅ Deleted ${allEmbeddings.length} message embeddings`);

    // Delete all votes (both current and deprecated)
    console.log('🗳️  Deleting ALL votes...');
    const allVotes = await db.delete(vote).returning({ chatId: vote.chatId });
    const allDeprecatedVotes = await db.delete(voteDeprecated).returning({ chatId: voteDeprecated.chatId });
    console.log(`✅ Deleted ${allVotes.length} votes and ${allDeprecatedVotes.length} deprecated votes`);

    // Delete all suggestions
    console.log('💡 Deleting ALL suggestions...');
    const allSuggestions = await db.delete(suggestion).returning({ id: suggestion.id });
    console.log(`✅ Deleted ${allSuggestions.length} suggestions`);

    // Delete all streams
    console.log('🌊 Deleting ALL streams...');
    const allStreams = await db.delete(stream).returning({ id: stream.id });
    console.log(`✅ Deleted ${allStreams.length} streams`);

    // Delete all messages (both current and deprecated)
    console.log('💬 Deleting ALL messages...');
    const allMessages = await db.delete(message).returning({ id: message.id });
    const allDeprecatedMessages = await db.delete(messageDeprecated).returning({ id: messageDeprecated.id });
    console.log(`✅ Deleted ${allMessages.length} messages and ${allDeprecatedMessages.length} deprecated messages`);

    // Delete all chats
    console.log('💬 Deleting ALL chats...');
    const allChats = await db.delete(chat).returning({ id: chat.id });
    console.log(`✅ Deleted ${allChats.length} chats`);

    // Delete all documents
    console.log('📄 Deleting ALL documents...');
    const allDocuments = await db.delete(document).returning({ id: document.id });
    console.log(`✅ Deleted ${allDocuments.length} documents`);

    // Vacuum analyze for performance
    console.log('🔧 Running VACUUM ANALYZE for optimization...');
    const userTables = ['User', 'Chat', 'Message_v2', 'Vote_v2', 'Document', 'Suggestion', 'Stream', 'message_embeddings', 'search_sessions'];
    for (const table of userTables) {
      await db.execute(sql.raw(`VACUUM ANALYZE "${table}"`));
    }
    console.log('✅ Database optimization complete');

    console.log('\n🧨 AGGRESSIVE cleanup completed! Database is now empty (except users).');

  } catch (error) {
    console.error('❌ Error during aggressive cleanup:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const isAggressive = args.includes('--aggressive');
  const isDryRun = !args.includes('--execute');

  if (isAggressive && isDryRun) {
    console.log('🔍 Aggressive cleanup dry run - showing what would be deleted...\n');
    
    try {
      const searchSessionsCount = await db.select({ count: sql<number>`count(*)` }).from(searchSession);
      const embeddingsCount = await db.select({ count: sql<number>`count(*)` }).from(messageEmbedding);
      const votesCount = await db.select({ count: sql<number>`count(*)` }).from(vote);
      const deprecatedVotesCount = await db.select({ count: sql<number>`count(*)` }).from(voteDeprecated);
      const suggestionsCount = await db.select({ count: sql<number>`count(*)` }).from(suggestion);
      const streamsCount = await db.select({ count: sql<number>`count(*)` }).from(stream);
      const messagesCount = await db.select({ count: sql<number>`count(*)` }).from(message);
      const deprecatedMessagesCount = await db.select({ count: sql<number>`count(*)` }).from(messageDeprecated);
      const chatsCount = await db.select({ count: sql<number>`count(*)` }).from(chat);
      const documentsCount = await db.select({ count: sql<number>`count(*)` }).from(document);

      console.log(`🔍 Would delete ${searchSessionsCount[0].count} search sessions`);
      console.log(`🔗 Would delete ${embeddingsCount[0].count} message embeddings`);
      console.log(`🗳️  Would delete ${votesCount[0].count} votes and ${deprecatedVotesCount[0].count} deprecated votes`);
      console.log(`💡 Would delete ${suggestionsCount[0].count} suggestions`);
      console.log(`🌊 Would delete ${streamsCount[0].count} streams`);
      console.log(`💬 Would delete ${messagesCount[0].count} messages and ${deprecatedMessagesCount[0].count} deprecated messages`);
      console.log(`💬 Would delete ${chatsCount[0].count} chats`);
      console.log(`📄 Would delete ${documentsCount[0].count} documents`);

      console.log('\n🧨 AGGRESSIVE dry run completed - add --execute to perform cleanup');

    } catch (error) {
      console.error('❌ Error during aggressive dry run:', error);
      throw error;
    } finally {
      await client.end();
    }
  } else if (isAggressive) {
    await aggressiveCleanup();
  } else if (isDryRun) {
    await dryRun();
  } else {
    await cleanupDatabase();
  }
}

main().catch(console.error);
