import { auth } from '@/app/(auth)/auth';
import { embeddingProcessor } from '@/lib/jobs/embedding-processor';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Check authentication (admin only - you might want to add role checking)
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { batchSize = 10 } = await request.json().catch(() => ({}));

    // Get initial stats
    const initialStats = await embeddingProcessor.getEmbeddingStats();
    
    if (initialStats.totalMessages === 0) {
      return NextResponse.json({ 
        error: 'No messages found in database',
        stats: initialStats 
      }, { status: 400 });
    }

    // Process a batch
    const processed = await embeddingProcessor.batchProcessMissingEmbeddings(batchSize);
    
    // Get updated stats
    const finalStats = await embeddingProcessor.getEmbeddingStats();

    return NextResponse.json({
      processed,
      initialStats,
      finalStats,
      remaining: finalStats.totalMessages - finalStats.messagesWithEmbeddings
    });

  } catch (error) {
    console.error('Embedding population API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await embeddingProcessor.getEmbeddingStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Embedding stats API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}