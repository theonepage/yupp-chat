import { auth } from '@/app/(auth)/auth';
import { searchMessages } from '@/lib/db/search-queries';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extract search parameters
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const limit = Number(searchParams.get('limit')) || 20;
    const threshold = Number(searchParams.get('threshold')) || 0.7;

    // Validate query parameter
    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters long' },
        { status: 400 }
      );
    }

    // Perform search
    const searchResults = await searchMessages({
      userId: session.user.id,
      query: query.trim(),
      limit: Math.min(limit, 50), // Cap at 50 results
      similarityThreshold: Math.max(0.1, Math.min(threshold, 1.0)), // Clamp between 0.1 and 1.0
    });

    return NextResponse.json(searchResults);
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
