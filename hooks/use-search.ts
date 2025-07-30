import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { useDebounce } from 'use-debounce';

interface SearchResult {
  messageId: string;
  chatId: string;
  chatTitle: string;
  content: string;
  similarity: number;
  createdAt: Date;
  role: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
}

interface UseSearchOptions {
  minQueryLength?: number;
  debounceMs?: number;
  limit?: number;
  threshold?: number;
}

async function fetcher(url: string): Promise<SearchResponse> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }
  return response.json();
}

export function useSearch(options: UseSearchOptions = {}) {
  const {
    minQueryLength = 2,
    debounceMs = 300,
    limit = 20,
    threshold = 0.7,
  } = options;

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query.trim(), debounceMs);

  const shouldSearch = debouncedQuery.length >= minQueryLength;
  const searchUrl = shouldSearch
    ? `/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=${limit}&threshold=${threshold}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<SearchResponse>(
    searchUrl,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      errorRetryCount: 2,
      dedupingInterval: 1000, // Prevent duplicate requests within 1 second
    }
  );

  const clearSearch = useCallback(() => {
    setQuery('');
  }, []);

  const isSearching = shouldSearch && isLoading;
  const hasResults = data && data.results.length > 0;
  const isEmpty = !isSearching && shouldSearch && !hasResults;

  return {
    query,
    setQuery,
    debouncedQuery,
    results: data?.results || [],
    total: data?.total || 0,
    isLoading: isSearching,
    error,
    hasResults,
    isEmpty,
    shouldSearch,
    clearSearch,
    refetch: mutate,
  };
}

export type { SearchResult, SearchResponse };
