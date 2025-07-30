import { type Page, type APIRequestContext, expect } from '@playwright/test';

// For Playwright E2E tests, we don't use MSW since we're testing against the real server
// MSW is only used for unit tests with vitest

// Mock OpenAI API for consistent test results (only used in unit tests)
const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.1);

// Create a stub server object for compatibility with existing test code
export const mockOpenAIServer = {
  listen: () => {
    console.log('MSW server stub - not starting for Playwright tests');
  },
  close: () => {
    console.log('MSW server stub - not stopping for Playwright tests');
  },
  resetHandlers: () => {
    console.log('MSW server stub - not resetting handlers for Playwright tests');
  }
};

export class EmbeddingTestHelper {
  constructor(private page: Page, private request: APIRequestContext) {}

  /**
   * Create a new chat with specific messages that will generate embeddings
   */
  async createChatWithMessages(messages: { role: 'user' | 'assistant', content: string }[]) {
    // Navigate to new chat
    await this.page.goto('/');
    await this.page.getByRole('button', { name: 'New Chat' }).click();
    
    const chatMessages: string[] = [];
    
    for (const message of messages) {
      if (message.role === 'user') {
        // Send user message
        await this.page.getByPlaceholder('Send a message...').fill(message.content);
        await this.page.getByPlaceholder('Send a message...').press('Enter');
        
        // Wait for message to appear
        await expect(this.page.locator(`text="${message.content}"`)).toBeVisible();
        chatMessages.push(message.content);
        
        // Wait a bit for the message to be processed
        await this.page.waitForTimeout(500);
      } else {
        // For assistant messages, we'll need to mock the API response
        // This would require more complex setup with API mocking
        chatMessages.push(message.content);
      }
    }
    
    // Get the current chat ID from URL
    const url = this.page.url();
    const chatId = url.split('/').pop();
    
    return { chatId, messages: chatMessages };
  }

  /**
   * Wait for embeddings to be generated for recent messages
   */
  async waitForEmbeddingGeneration(timeoutMs: number = 10000) {
    // Poll the embedding stats API to check if embeddings are being generated
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await this.request.get('/api/embeddings/populate');
        if (response.ok()) {
          const stats = await response.json();
          if (stats.messagesWithEmbeddings > 0) {
            return true;
          }
        }
      } catch (error) {
        // API might not be available, continue polling
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Embeddings were not generated within ${timeoutMs}ms`);
  }

  /**
   * Perform a search and return results
   */
  async performSearch(query: string): Promise<any> {
    const response = await this.request.get(`/api/search?q=${encodeURIComponent(query)}&limit=10&threshold=0.1`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  /**
   * Test the search UI component
   */
  async testSearchUI(query: string, expectedResultsCount?: number) {
    // Look for search input in sidebar
    const searchInput = this.page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible();
    
    // Enter search query
    await searchInput.fill(query);
    
    // Wait for search results to appear
    await this.page.waitForTimeout(1000); // Wait for debounce
    
    if (expectedResultsCount !== undefined) {
      // Check if results appear
      if (expectedResultsCount > 0) {
        await expect(this.page.locator('[data-testid="search-results"]').first()).toBeVisible({ timeout: 5000 });
      } else {
        await expect(this.page.locator('text="No results found"')).toBeVisible({ timeout: 5000 });
      }
    }
    
    return searchInput;
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    try {
      // Call cleanup API if available
      await this.request.delete('/api/test/cleanup');
    } catch (error) {
      // Cleanup API might not exist, ignore
      console.log('Cleanup API not available');
    }
  }

  /**
   * Populate embeddings via API
   */
  async populateEmbeddings() {
    try {
      const response = await this.request.post('/api/embeddings/populate', {
        data: { batchSize: 10 }
      });
      
      if (response.ok()) {
        const result = await response.json();
        return result;
      }
    } catch (error) {
      console.log('Could not populate embeddings via API:', error);
    }
    return null;
  }

  /**
   * Get embedding statistics
   */
  async getEmbeddingStats() {
    try {
      const response = await this.request.get('/api/embeddings/populate');
      if (response.ok()) {
        return response.json();
      }
    } catch (error) {
      console.log('Could not get embedding stats:', error);
    }
    return null;
  }
}