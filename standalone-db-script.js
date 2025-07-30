const { config } = require('dotenv');
const postgres = require('postgres');
const { openai } = require('@ai-sdk/openai');
const { embed } = require('ai');
const { createHash } = require('crypto');

config({ path: '.env.local' });

const sql = postgres(process.env.POSTGRES_URL);

// Helper function to generate embedding
async function generateEmbedding(content) {
  if (!content.trim()) {
    throw new Error('Content cannot be empty');
  }

  const model = openai.textEmbedding('text-embedding-3-small');
  const { embedding } = await embed({
    model: model,
    value: content,
  });
  return `[${Array.from(embedding).join(',')}]`;
}

// Helper function to extract searchable content from message parts
function extractSearchableContent(messageParts) {
  if (!Array.isArray(messageParts)) {
    return '';
  }

  return messageParts
    .filter(part => part && typeof part === 'object' && part.type === 'text')
    .map(part => (part.text || '').trim())
    .filter(text => text.length > 0)
    .join(' ')
    .trim();
}

// Helper function to generate content hash
function generateContentHash(content) {
  return createHash('sha256').update(content.trim()).digest('hex');
}

// Implementation of searchMessages function
async function searchMessages({ userId, query, limit = 20, similarityThreshold = 0.7 }) {
  try {
    console.log(`\n--- Searching for: "${query}" ---`);
    console.log(`User: ${userId}, Limit: ${limit}, Threshold: ${similarityThreshold}`);
    
    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query);
    
    // Store search session
    await sql`
      INSERT INTO search_sessions (user_id, query, query_embedding, result_count)
      VALUES (${userId}, ${query}, ${queryEmbedding}, 0)
    `;
    
    // Perform vector similarity search
    const results = await sql`
      SELECT 
        m.id as message_id,
        m."chatId" as chat_id,
        c.title as chat_title,
        m.parts as content,
        m.role,
        m."createdAt",
        1 - (me.embedding <=> ${queryEmbedding}) as similarity
      FROM message_embeddings me
      INNER JOIN "Message_v2" m ON me.message_id = m.id
      INNER JOIN "Chat" c ON m."chatId" = c.id
      WHERE c."userId" = ${userId}
        AND 1 - (me.embedding <=> ${queryEmbedding}) > ${similarityThreshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;

    // Process results to extract readable content
    const processedResults = results.map(result => ({
      messageId: result.message_id,
      chatId: result.chat_id,
      chatTitle: result.chat_title,
      content: extractSearchableContent(result.content),
      similarity: result.similarity,
      createdAt: result.createdAt,
      role: result.role,
    }));

    // Update search session with result count
    await sql`
      UPDATE search_sessions 
      SET result_count = ${processedResults.length}
      WHERE id = (
        SELECT id FROM search_sessions 
        WHERE user_id = ${userId} AND query = ${query}
        ORDER BY created_at DESC
        LIMIT 1
      )
    `;

    console.log(`Found ${processedResults.length} results:`);
    processedResults.forEach((result, index) => {
      const truncatedContent = result.content.length > 120 ? result.content.substring(0, 120) + '...' : result.content;
      console.log(`  ${index + 1}. [${(result.similarity * 100).toFixed(1)}%] ${result.role} in "${result.chatTitle}"`);
      console.log(`     Content: ${truncatedContent}`);
      console.log(`     Created: ${new Date(result.createdAt).toLocaleDateString()}`);
    });

    if (processedResults.length === 0) {
      console.log('  No results found above similarity threshold');
      
      // Show top 3 results regardless of threshold for analysis
      const topResults = await sql`
        SELECT 
          c.title as chat_title,
          m.role,
          1 - (me.embedding <=> ${queryEmbedding}) as similarity
        FROM message_embeddings me
        INNER JOIN "Message_v2" m ON me.message_id = m.id
        INNER JOIN "Chat" c ON m."chatId" = c.id
        WHERE c."userId" = ${userId}
        ORDER BY similarity DESC
        LIMIT 3
      `;
      
      console.log('  Top 3 closest matches:');
      topResults.forEach((result, index) => {
        console.log(`    ${index + 1}. [${(result.similarity * 100).toFixed(1)}%] ${result.role} in "${result.chat_title}"`);
      });
    }

    return {
      results: processedResults,
      total: processedResults.length,
    };
  } catch (error) {
    console.error(`Error searching for "${query}":`, error.message);
    return { results: [], total: 0 };
  }
}

async function executeQueries() {
  try {
    console.log('Connected to Neon database');
    console.log('Executing queries in order...\n');

    // 1. Search for all users
    console.log('1. Searching for all users:');
    const users = await sql`SELECT * FROM "User"`;
    console.log(`Found ${users.length} users:`);
    users.forEach(user => {
      console.log(`  ID: ${user.id}, Email: ${user.email}`);
    });
    console.log('');

    // 2. Pick 1 user who has chats and get all chats for them
    console.log('2. Finding a user with chats and getting all their chats:');
    if (users.length > 0) {
      // Find a user who actually has chats and messages
      const userWithChats = await sql`
        SELECT u.id, u.email, COUNT(c.id) as chat_count, COUNT(m.id) as message_count
        FROM "User" u
        LEFT JOIN "Chat" c ON u.id = c."userId"
        LEFT JOIN "Message_v2" m ON c.id = m."chatId"
        GROUP BY u.id, u.email
        HAVING COUNT(c.id) > 0 AND COUNT(m.id) > 0
        ORDER BY COUNT(m.id) DESC
        LIMIT 1
      `;
      
      if (userWithChats.length > 0) {
        const selectedUser = userWithChats[0];
        console.log(`Selected user: ${selectedUser.email} (${selectedUser.id})`);
        console.log(`  Has ${selectedUser.chat_count} chats and ${selectedUser.message_count} messages`);
        
        const userChats = await sql`
          SELECT id, title, "createdAt", visibility
          FROM "Chat"
          WHERE "userId" = ${selectedUser.id}
          ORDER BY "createdAt" DESC
        `;
        
        console.log(`Found ${userChats.length} chats for this user:`);
        userChats.forEach(chat => {
          console.log(`  Chat: ${chat.title} (${chat.id}) - Created: ${chat.createdAt} - Visibility: ${chat.visibility}`);
        });
      } else {
        console.log('No users found with chats and messages');
      }
    } else {
      console.log('No users found in database');
    }
    console.log('');

    // 3. Get message count per chat
    console.log('3. Getting message count per chat:');
    const messageCounts = await sql`
      SELECT c.title, COUNT(m.id) as message_count
      FROM "Chat" c
      LEFT JOIN "Message_v2" m ON c.id = m."chatId"
      GROUP BY c.id, c.title
      ORDER BY message_count DESC
    `;
    console.log('Message counts by chat:');
    messageCounts.forEach(count => {
      console.log(`  ${count.title}: ${count.message_count} messages`);
    });
    console.log('');

    // 4. Get embedding statistics
    console.log('4. Getting embedding statistics:');
    const embeddingStats = await sql`
      SELECT 
        COUNT(*) as total_embeddings,
        COUNT(DISTINCT "message_id") as unique_messages_with_embeddings
      FROM message_embeddings
    `;
    console.log('Embedding statistics:');
    embeddingStats.forEach(stat => {
      console.log(`  Total embeddings: ${stat.total_embeddings}`);
      console.log(`  Unique messages with embeddings: ${stat.unique_messages_with_embeddings}`);
    });
    console.log('');

    // 5. Get search session statistics
    console.log('5. Getting search session statistics:');
    const searchStats = await sql`
      SELECT 
        COUNT(*) as total_searches,
        COUNT(DISTINCT "user_id") as unique_users_searched,
        AVG("result_count") as avg_results_per_search
      FROM search_sessions
    `;
    console.log('Search statistics:');
    searchStats.forEach(stat => {
      console.log(`  Total searches: ${stat.total_searches}`);
      console.log(`  Unique users who searched: ${stat.unique_users_searched}`);
      console.log(`  Average results per search: ${parseFloat(stat.avg_results_per_search).toFixed(2)}`);
    });
    console.log('');

    // 6. Test searchMessages function with 5 sample queries
    console.log('6. Testing searchMessages function with 5 sample queries:');
    
    // Find a user with actual data for meaningful search testing
    const testUserQuery = await sql`
      SELECT u.id, u.email, COUNT(c.id) as chat_count, COUNT(m.id) as message_count
      FROM "User" u
      LEFT JOIN "Chat" c ON u.id = c."userId"
      LEFT JOIN "Message_v2" m ON c.id = m."chatId"
      GROUP BY u.id, u.email
      HAVING COUNT(c.id) > 0 AND COUNT(m.id) > 0
      ORDER BY COUNT(m.id) DESC
      LIMIT 1
    `;
    
    if (testUserQuery.length > 0) {
      const testUser = testUserQuery[0];
      console.log(`\n=== SEARCH ANALYSIS FOR USER: ${testUser.email} ===`);
      console.log(`User has ${testUser.chat_count} chats and ${testUser.message_count} messages`);
      
      // Debug: Check what embeddings exist for this user
      console.log('\n--- DEBUGGING EMBEDDING DATA ---');
      const userMessages = await sql`
        SELECT COUNT(*) as message_count
        FROM "Message_v2" m
        INNER JOIN "Chat" c ON m."chatId" = c.id
        WHERE c."userId" = ${testUser.id}
      `;
      console.log(`Total messages for user: ${userMessages[0].message_count}`);
      
      const userEmbeddings = await sql`
        SELECT COUNT(*) as embedding_count
        FROM message_embeddings me
        INNER JOIN "Message_v2" m ON me.message_id = m.id
        INNER JOIN "Chat" c ON m."chatId" = c.id
        WHERE c."userId" = ${testUser.id}
      `;
      console.log(`Messages with embeddings for user: ${userEmbeddings[0].embedding_count}`);
      
      if (userEmbeddings[0].embedding_count > 0) {
        // Show sample messages and their embeddings
        const sampleEmbeddings = await sql`
          SELECT 
            m.id as message_id,
            m.parts as content,
            m.role,
            c.title as chat_title,
            me.embedding IS NOT NULL as has_embedding
          FROM "Message_v2" m
          INNER JOIN "Chat" c ON m."chatId" = c.id
          LEFT JOIN message_embeddings me ON me.message_id = m.id
          WHERE c."userId" = ${testUser.id}
          LIMIT 5
        `;
        
        console.log('\nSample messages and embedding status:');
        sampleEmbeddings.forEach((msg, index) => {
          const content = extractSearchableContent(msg.content);
          const truncatedContent = content.length > 80 ? content.substring(0, 80) + '...' : content;
          console.log(`  ${index + 1}. [${msg.has_embedding ? 'HAS EMBEDDING' : 'NO EMBEDDING'}] ${msg.role}: ${truncatedContent}`);
        });
      } else {
        console.log('⚠️  No embeddings found for this user. Search will return 0 results.');
        console.log('   You may need to run the embedding population script first.');
        console.log('   Command: npm run embeddings:populate');
        
        // Offer to create a few sample embeddings
        console.log('\n--- CREATING SAMPLE EMBEDDINGS ---');
        console.log('Creating embeddings for first 3 messages to test search...');
        
        const messagesToEmbed = await sql`
          SELECT m.id, m.parts, m.role
          FROM "Message_v2" m
          INNER JOIN "Chat" c ON m."chatId" = c.id
          WHERE c."userId" = ${testUser.id}
          LIMIT 3
        `;
        
        for (const msg of messagesToEmbed) {
          try {
            const content = extractSearchableContent(msg.parts);
            if (content.trim()) {
              console.log(`Creating embedding for ${msg.role} message: ${content.substring(0, 50)}...`);
              const embedding = await generateEmbedding(content);
              const contentHash = generateContentHash(content);
              
              await sql`
                INSERT INTO message_embeddings (message_id, embedding, content_hash)
                VALUES (${msg.id}, ${embedding}, ${contentHash})
                ON CONFLICT (message_id) DO UPDATE SET
                  embedding = EXCLUDED.embedding,
                  content_hash = EXCLUDED.content_hash,
                  updated_at = NOW()
              `;
              console.log('✅ Embedding created successfully');
            }
          } catch (error) {
            console.log(`❌ Failed to create embedding: ${error.message}`);
          }
        }
        
        // Update embedding count
        const updatedEmbeddings = await sql`
          SELECT COUNT(*) as embedding_count
          FROM message_embeddings me
          INNER JOIN "Message_v2" m ON me.message_id = m.id
          INNER JOIN "Chat" c ON m."chatId" = c.id
          WHERE c."userId" = ${testUser.id}
        `;
        console.log(`Now have ${updatedEmbeddings[0].embedding_count} embeddings for this user`);
      }
      
      // 5 diverse sample queries to test different search scenarios
      const sampleQueries = [
        { query: "How to use AI chatbot features?", threshold: 0.7 },
        { query: "JavaScript programming help", threshold: 0.6 },
        { query: "error handling and debugging", threshold: 0.65 },
        { query: "machine learning and artificial intelligence", threshold: 0.7 },
        { query: "web development best practices", threshold: 0.6 }
      ];
      
      const searchResults = [];
      
      // Only run embedding searches if embeddings exist
      if (userEmbeddings[0].embedding_count > 0) {
        console.log('\n--- RUNNING EMBEDDING SEARCHES ---');
        
        for (const { query, threshold } of sampleQueries) {
          try {
            const result = await searchMessages({
              userId: testUser.id,
              query: query,
              limit: 5,
              similarityThreshold: threshold
            });
            
            searchResults.push({
              query,
              threshold,
              resultCount: result.total,
              results: result.results
            });
            
            // Add a small delay between searches
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`Failed to search for "${query}":`, error.message);
            searchResults.push({
              query,
              threshold,
              resultCount: 0,
              results: [],
              error: error.message
            });
          }
        }
      } else {
        console.log('\n--- FALLBACK: TEXT-BASED SEARCH ---');
        console.log('Since no embeddings exist, running basic text searches instead...');
        
        for (const { query } of sampleQueries) {
          try {
            // Simple text-based search as fallback
            const textResults = await sql`
              SELECT 
                m.id as message_id,
                m."chatId" as chat_id,
                c.title as chat_title,
                m.parts as content,
                m.role,
                m."createdAt"
              FROM "Message_v2" m
              INNER JOIN "Chat" c ON m."chatId" = c.id
              WHERE c."userId" = ${testUser.id}
                AND (
                  LOWER(m.parts::text) LIKE LOWER(${'%' + query + '%'})
                  OR LOWER(c.title) LIKE LOWER(${'%' + query + '%'})
                )
              ORDER BY m."createdAt" DESC
              LIMIT 3
            `;
            
            const processedResults = textResults.map(result => ({
              messageId: result.message_id,
              chatId: result.chat_id,
              chatTitle: result.chat_title,
              content: extractSearchableContent(result.content),
              similarity: 0.5, // Mock similarity for text search
              createdAt: result.createdAt,
              role: result.role,
            }));
            
            console.log(`\n--- Text search for: "${query}" ---`);
            console.log(`Found ${processedResults.length} text matches:`);
            processedResults.forEach((result, index) => {
              const truncatedContent = result.content.length > 100 ? result.content.substring(0, 100) + '...' : result.content;
              console.log(`  ${index + 1}. ${result.role} in "${result.chatTitle}"`);
              console.log(`     Content: ${truncatedContent}`);
            });
            
            searchResults.push({
              query,
              threshold: 'text-search',
              resultCount: processedResults.length,
              results: processedResults,
              searchType: 'text'
            });
            
          } catch (error) {
            console.error(`Failed text search for "${query}":`, error.message);
            searchResults.push({
              query,
              threshold: 'text-search',
              resultCount: 0,
              results: [],
              error: error.message,
              searchType: 'text'
            });
          }
        }
      }
      
      // Analysis of search results
      console.log('\n=== SEARCH RESULTS ANALYSIS ===');
      let totalResults = 0;
      let successfulSearches = 0;
      const queryPerformance = [];
      
      searchResults.forEach((result, index) => {
        console.log(`\nQuery ${index + 1}: "${result.query}"`);
        console.log(`  Threshold: ${result.threshold}`);
        console.log(`  Results: ${result.resultCount}`);
        
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        } else {
          totalResults += result.resultCount;
          if (result.resultCount > 0) {
            successfulSearches++;
            
            // Calculate average similarity for this query
            const avgSimilarity = result.results.length > 0 
              ? result.results.reduce((sum, r) => sum + r.similarity, 0) / result.results.length
              : 0;
            
            queryPerformance.push({
              query: result.query,
              count: result.resultCount,
              avgSimilarity: avgSimilarity
            });
            
            console.log(`  Avg Similarity: ${(avgSimilarity * 100).toFixed(1)}%`);
            console.log(`  Top Result: ${result.results[0]?.role} - ${(result.results[0]?.similarity * 100).toFixed(1)}%`);
          }
        }
      });
      
      console.log('\n=== OVERALL ANALYSIS ===');
      console.log(`Total searches performed: ${sampleQueries.length}`);
      console.log(`Successful searches (>0 results): ${successfulSearches}`);
      console.log(`Total results found: ${totalResults}`);
      console.log(`Average results per search: ${(totalResults / sampleQueries.length).toFixed(1)}`);
      
      if (queryPerformance.length > 0) {
        const bestQuery = queryPerformance.reduce((best, current) => 
          current.avgSimilarity > best.avgSimilarity ? current : best
        );
        console.log(`Best performing query: "${bestQuery.query}" (${(bestQuery.avgSimilarity * 100).toFixed(1)}% avg similarity)`);
        
        const mostResults = queryPerformance.reduce((best, current) => 
          current.count > best.count ? current : best
        );
        console.log(`Query with most results: "${mostResults.query}" (${mostResults.count} results)`);
      }
      
    } else {
      console.log('No users found to perform search analysis');
    }

  } catch (error) {
    console.error('Error executing queries:', error);
  } finally {
    await sql.end();
    console.log('\nDatabase connection closed');
  }
}

executeQueries();