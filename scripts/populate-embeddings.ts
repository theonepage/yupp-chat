#!/usr/bin/env tsx

// Load environment variables first
import { config } from 'dotenv';
config({ path: '.env.local' });


import { embeddingProcessor } from '../lib/jobs/embedding-processor';

async function main() {
  console.log('Starting embedding population...');
  
  try {
    // Get current stats
    const initialStats = await embeddingProcessor.getEmbeddingStats();
    console.log('Initial stats:', initialStats);
    
    if (initialStats.totalMessages === 0) {
      console.log('No messages found in database. Create some chats first.');
      return;
    }
    
    // Process all missing embeddings in batches
    let totalProcessed = 0;
    let batchCount = 0;
    
    while (true) {
      batchCount++;
      console.log(`\nProcessing batch ${batchCount}...`);
      
      const processed = await embeddingProcessor.batchProcessMissingEmbeddings(10);
      totalProcessed += processed;
      
      console.log(`Batch ${batchCount}: Processed ${processed} messages`);
      
      if (processed === 0) {
        console.log('No more messages to process.');
        break;
      }
      
      // Small delay between batches to avoid overwhelming OpenAI API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Get final stats
    const finalStats = await embeddingProcessor.getEmbeddingStats();
    console.log('\n=== Final Results ===');
    console.log(`Total messages processed: ${totalProcessed}`);
    console.log('Final stats:', finalStats);
    console.log(`Coverage: ${finalStats.coverage}%`);
    
  } catch (error) {
    console.error('Error populating embeddings:', error);
    process.exit(1);
  }
}

main().then(() => {
  console.log('Embedding population completed successfully!');
  process.exit(0);
}).catch((error) => {
  console.error('Failed to populate embeddings:', error);
  process.exit(1);
});