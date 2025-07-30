'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { LoaderIcon } from '@/components/icons';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearch, type SearchResult } from '@/hooks/use-search';
import { formatDistanceToNow } from 'date-fns';

function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return text;
  
  const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 1);
  let highlighted = text;
  
  words.forEach(word => {
    const regex = new RegExp(`(${escapeRegExp(word)})`, 'gi');
    highlighted = highlighted.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
  });
  
  return highlighted;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface SearchResultItemProps {
  result: SearchResult;
  query: string;
  onClick: () => void;
}

function SearchResultItem({ result, query, onClick }: SearchResultItemProps) {
  const highlightedContent = highlightMatches(result.content, query);
  const truncatedContent = result.content.length > 120 
    ? result.content.slice(0, 120) + '...' 
    : result.content;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton 
        onClick={onClick}
        className="flex-col items-start h-auto p-3 hover:bg-accent/50"
        data-testid="search-result-item"
      >
        <div className="flex items-center justify-between w-full mb-1">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {result.chatTitle}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            {Math.round(result.similarity * 100)}%
          </span>
        </div>
        
        <p 
          className="text-sm text-left leading-relaxed line-clamp-3"
          dangerouslySetInnerHTML={{ 
            __html: highlightMatches(truncatedContent, query) 
          }}
        />
        
        <div className="flex items-center justify-between w-full mt-2">
          <span className="text-xs text-muted-foreground capitalize">
            {result.role}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(result.createdAt), { addSuffix: true })}
          </span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function ChatSearch() {
  const [isExpanded, setIsExpanded] = useState(false);
  const router = useRouter();
  
  const {
    query,
    setQuery,
    results,
    total,
    isLoading,
    error,
    hasResults,
    isEmpty,
    shouldSearch,
    clearSearch,
  } = useSearch({
    minQueryLength: 2,
    debounceMs: 300,
    limit: 20,
    threshold: 0.1,
  });

  const handleResultClick = (result: SearchResult) => {
    router.push(`/chat/${result.chatId}`);
    setIsExpanded(false);
    clearSearch();
  };

  const handleClearSearch = () => {
    clearSearch();
    setIsExpanded(false);
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="relative">
              <Input
                type="text"
                placeholder="Search conversations..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!isExpanded && e.target.value.length > 0) {
                    setIsExpanded(true);
                  }
                }}
                onFocus={() => {
                  if (query.length > 0) {
                    setIsExpanded(true);
                  }
                }}
                className="px-9 h-9"
              />
              
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              
              {(query.length > 0 || isLoading) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSearch}
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-7 p-0"
                >
                  {isLoading ? (
                    <div className="animate-spin">
                      <LoaderIcon size={12} />
                    </div>
                  ) : (
                    <X className="size-3" />
                  )}
                </Button>
              )}
            </div>
          </SidebarMenuItem>
          
          <AnimatePresence>
            {isExpanded && shouldSearch && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
                data-testid="search-results"
              >
                <div className="mt-2 max-h-80 overflow-y-auto">
                  {isLoading && (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin mr-2">
                        <LoaderIcon size={16} />
                      </div>
                      <span className="text-sm text-muted-foreground">Searching...</span>
                    </div>
                  )}
                  
                  {error && (
                    <div className="px-3 py-2 text-sm text-red-500">
                      Error: {error.message}
                    </div>
                  )}
                  
                  {isEmpty && (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No results found for &quot;{query}&quot;
                    </div>
                  )}
                  
                  {hasResults && (
                    <>
                      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                        {total} result{total !== 1 ? 's' : ''}
                      </div>
                      
                      {results.map((result) => (
                        <SearchResultItem
                          key={result.messageId}
                          result={result}
                          query={query}
                          onClick={() => handleResultClick(result)}
                        />
                      ))}
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
