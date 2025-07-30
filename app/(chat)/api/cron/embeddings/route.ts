import { embeddingProcessor } from '@/lib/jobs/embedding-processor';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting scheduled embedding processing...');
    
    // Process a batch of messages without embeddings
    const processed = await embeddingProcessor.batchProcessMissingEmbeddings(20);
    
    // Get current stats
    const stats = await embeddingProcessor.getEmbeddingStats();
    
    console.log(`Processed ${processed} embeddings. Coverage: ${stats.coverage}%`);
    
    return NextResponse.json({
      success: true,
      processed,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Cron embedding processing failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Optionally support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}