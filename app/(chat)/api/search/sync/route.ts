import { auth } from '@/app/(auth)/auth';
import { embeddingProcessor } from '@/lib/jobs/embedding-processor';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Check authentication - only allow for authenticated users
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const batchSize = Number(searchParams.get('batchSize')) || 10;

    // Process missing embeddings
    const processedCount = await embeddingProcessor.batchProcessMissingEmbeddings(
      Math.min(batchSize, 50) // Cap at 50 to prevent abuse
    );

    // Get stats
    const stats = await embeddingProcessor.getEmbeddingStats();

    return NextResponse.json({
      processedCount,
      stats,
      success: true,
    });
  } catch (error) {
    console.error('Embedding sync API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Just return stats
    const stats = await embeddingProcessor.getEmbeddingStats();

    return NextResponse.json({
      stats,
      success: true,
    });
  } catch (error) {
    console.error('Embedding stats API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
