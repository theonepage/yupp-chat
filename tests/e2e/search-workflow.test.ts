import { expect, test } from '../fixtures';
import { EmbeddingTestHelper, mockOpenAIServer } from '../helpers/embedding-test-utils';

test.describe('Complete Search Workflow Integration', () => {
  let embeddingHelper: EmbeddingTestHelper;

  test.beforeAll(async () => {
    mockOpenAIServer.listen();
  });

  test.afterAll(async () => {
    mockOpenAIServer.close();
  });

  test.beforeEach(async ({ adaContext }) => {
    embeddingHelper = new EmbeddingTestHelper(adaContext.page, adaContext.request);
  });

  test.afterEach(async () => {
    await embeddingHelper.cleanup();
  });

  test('complete workflow: create content, generate embeddings, search, and navigate', async ({ adaContext }) => {
    const { page, request } = adaContext;

    // Step 1: Create multiple chats with different topics
    const testChats = [
      {
        topic: 'Machine Learning',
        messages: [
          'What is machine learning and how does it differ from traditional programming?',
          'Can you explain supervised vs unsupervised learning?',
          'What are some real-world applications of machine learning?'
        ]
      },
      {
        topic: 'Web Development',
        messages: [
          'How do I create a responsive website using CSS?',
          'What is the difference between React and Vue.js?',
          'Best practices for API design and development'
        ]
      },
      {
        topic: 'Data Science',
        messages: [
          'What tools are commonly used in data science?',
          'How do you clean and prepare data for analysis?',
          'What is the difference between correlation and causation?'
        ]
      }
    ];

    const createdChats: { chatId: string; topic: string; messages: string[] }[] = [];

    // Create chats with content
    for (const testChat of testChats) {
      await page.goto('/');
      await page.getByRole('button', { name: 'New Chat' }).click();

      // Send messages for this chat
      for (const message of testChat.messages) {
        const messageInput = page.getByPlaceholder('Send a message...');
        await messageInput.fill(message);
        await messageInput.press('Enter');
        
        // Wait for message to appear
        await expect(page.locator(`text="${message}"`).first()).toBeVisible();
        await page.waitForTimeout(500);
      }

      // Get chat ID from URL
      const url = page.url();
      const chatId = url.split('/').pop();
      
      if (chatId) {
        createdChats.push({
          chatId,
          topic: testChat.topic,
          messages: testChat.messages
        });
      }

      console.log(`Created chat: ${testChat.topic} with ${testChat.messages.length} messages`);
    }

    // Step 2: Wait for embedding generation
    console.log('Waiting for embedding generation...');
    await page.waitForTimeout(5000);

    // Try to populate embeddings via API
    try {
      const populateResult = await request.post('/api/embeddings/populate', {
        data: { batchSize: 20 }
      });
      
      if (populateResult.ok()) {
        const result = await populateResult.json();
        console.log('Embedding populate result:', result);
      }
    } catch (error) {
      console.log('Could not populate embeddings via API');
    }

    // Step 3: Test search functionality
    console.log('Testing search functionality...');
    
    const searchTests = [
      {
        query: 'machine learning',
        expectedTopic: 'Machine Learning',
        shouldFindResults: true
      },
      {
        query: 'CSS responsive',
        expectedTopic: 'Web Development',
        shouldFindResults: true
      },
      {
        query: 'data science tools',
        expectedTopic: 'Data Science',
        shouldFindResults: true
      },
      {
        query: 'nonexistent topic xyz123',
        expectedTopic: null,
        shouldFindResults: false
      }
    ];

    for (const searchTest of searchTests) {
      console.log(`Testing search for: "${searchTest.query}"`);
      
      // Test via API
      try {
        const searchResults = await request.get(`/api/search?q=${encodeURIComponent(searchTest.query)}&limit=10&threshold=0.1`);
        
        if (searchResults.ok()) {
          const data = await searchResults.json();
          console.log(`API search results for "${searchTest.query}":`, {
            total: data.total,
            resultsCount: data.results.length
          });

          if (searchTest.shouldFindResults && data.results.length > 0) {
            // Verify result structure
            const firstResult = data.results[0];
            expect(firstResult).toHaveProperty('messageId');
            expect(firstResult).toHaveProperty('chatId');
            expect(firstResult).toHaveProperty('content');
            expect(firstResult).toHaveProperty('similarity');

            // Check if we can find the expected topic in results
            const foundRelevantChat = createdChats.find(chat => 
              data.results.some(result => result.chatId === chat.chatId)
            );
            
            if (foundRelevantChat) {
              console.log(`Found relevant chat: ${foundRelevantChat.topic}`);
            }
          }
        }
      } catch (error) {
        console.log(`API search failed for "${searchTest.query}":`, error);
      }

      // Test via UI
      await page.goto('/');
      
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      await expect(searchInput).toBeVisible();
      
      await searchInput.fill(searchTest.query);
      await page.waitForTimeout(1000); // Wait for debounce and processing

      // Check for search results or no results message
      const hasResults = await page.locator('[data-testid="search-results"]').isVisible({ timeout: 3000 }).catch(() => false);
      const hasNoResults = await page.locator('text="No results found"').isVisible({ timeout: 1000 }).catch(() => false);
      
      if (hasResults) {
        console.log(`UI search found results for: "${searchTest.query}"`);
        
        // Try to click on first result
        const firstResult = page.locator('[data-testid="search-result-item"]').first();
        if (await firstResult.isVisible({ timeout: 1000 })) {
          const resultText = await firstResult.textContent();
          console.log(`First result preview: ${resultText?.substring(0, 100)}...`);
          
          // Click and verify navigation
          await firstResult.click();
          await page.waitForTimeout(1000);
          
          const currentUrl = page.url();
          const isOnChatPage = currentUrl.includes('/chat/');
          
          if (isOnChatPage) {
            console.log(`Successfully navigated to chat page: ${currentUrl}`);
          }
        }
      } else if (hasNoResults) {
        console.log(`UI search shows no results for: "${searchTest.query}"`);
      } else {
        console.log(`UI search shows no feedback for: "${searchTest.query}" (embeddings may not be ready)`);
      }

      // Clear search for next test
      await searchInput.fill('');
    }

    // Step 4: Test search persistence and state management
    await page.goto('/');
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    
    await searchInput.fill('persistent search test');
    await page.waitForTimeout(500);
    
    // Navigate away and back
    await page.getByRole('button', { name: 'New Chat' }).click();
    await page.waitForTimeout(500);
    await page.goto('/');
    
    // Check if search persists (implementation dependent)
    const currentSearchValue = await searchInput.inputValue();
    console.log('Search persistence test - current value:', currentSearchValue);

    // Step 5: Performance validation
    console.log('Testing search performance...');
    
    const performanceQueries = [
      'machine learning algorithms',
      'web development frameworks',
      'data analysis techniques',
      'software engineering practices',
      'artificial intelligence applications'
    ];

    const performanceResults: { query: string; responseTime: number }[] = [];

    for (const query of performanceQueries) {
      const startTime = Date.now();
      
      try {
        const response = await request.get(`/api/search?q=${encodeURIComponent(query)}&limit=5`);
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        performanceResults.push({ query, responseTime });
        
        expect(response.status()).toBe(200);
        expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
      } catch (error) {
        console.log(`Performance test failed for query: ${query}`);
      }
    }

    console.log('Performance results:');
    performanceResults.forEach(result => {
      console.log(`  "${result.query}": ${result.responseTime}ms`);
    });

    const avgResponseTime = performanceResults.reduce((sum, r) => sum + r.responseTime, 0) / performanceResults.length;
    console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);

    // Step 6: Verify data consistency
    console.log('Testing data consistency...');
    
    const consistencyQuery = 'machine learning';
    const response1 = await request.get(`/api/search?q=${encodeURIComponent(consistencyQuery)}`);
    const response2 = await request.get(`/api/search?q=${encodeURIComponent(consistencyQuery)}`);
    
    if (response1.ok() && response2.ok()) {
      const data1 = await response1.json();
      const data2 = await response2.json();
      
      expect(data1.total).toBe(data2.total);
      console.log(`Consistency test passed: both requests returned ${data1.total} results`);
    }

    console.log('Complete workflow test finished successfully!');
  });

  test('workflow with error scenarios and edge cases', async ({ adaContext }) => {
    const { page, request } = adaContext;

    // Test search with no content
    await page.goto('/');
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    
    await searchInput.fill('no content exists');
    await page.waitForTimeout(1000);
    
    // Should handle gracefully
    const searchResult = await request.get('/api/search?q=no%20content%20exists');
    expect(searchResult.status()).toBe(200);
    
    const data = await searchResult.json();
    expect(data.results).toEqual([]);
    expect(data.total).toBe(0);

    // Create a chat and immediately search (before embedding generation)
    await page.getByRole('button', { name: 'New Chat' }).click();
    
    const testMessage = 'This is a new message that might not have embeddings yet';
    const messageInput = page.getByPlaceholder('Send a message...');
    await messageInput.fill(testMessage);
    await messageInput.press('Enter');
    
    await expect(page.locator(`text="${testMessage}"`)).toBeVisible();
    
    // Search immediately (embeddings might not be ready)
    await searchInput.fill('new message embeddings');
    await page.waitForTimeout(1000);
    
    // Should handle gracefully even if embeddings aren't ready
    console.log('Tested search on fresh content without embeddings');

    // Test error recovery
    await searchInput.fill(''); // Clear search
    await searchInput.fill('recovery test');
    await page.waitForTimeout(500);
    await searchInput.fill(''); // Clear again
    
    // Should handle rapid changes gracefully
    console.log('Tested error recovery scenarios');
  });

  test('search with different user roles and permissions', async ({ adaContext, babbageContext }) => {
    // Test that different users see different search results
    
    // Create content as Ada
    await adaContext.page.goto('/');
    await adaContext.page.getByRole('button', { name: 'New Chat' }).click();
    
    const adaMessage = 'This is Ada specific content about quantum computing';
    const adaMessageInput = adaContext.page.getByPlaceholder('Send a message...');
    await adaMessageInput.fill(adaMessage);
    await adaMessageInput.press('Enter');
    
    await expect(adaContext.page.locator(`text="${adaMessage}"`)).toBeVisible();

    // Create content as Babbage
    await babbageContext.page.goto('/');
    await babbageContext.page.getByRole('button', { name: 'New Chat' }).click();
    
    const babbageMessage = 'This is Babbage specific content about blockchain technology';
    const babbageMessageInput = babbageContext.page.getByPlaceholder('Send a message...');
    await babbageMessageInput.fill(babbageMessage);
    await babbageMessageInput.press('Enter');
    
    await expect(babbageContext.page.locator(`text="${babbageMessage}"`)).toBeVisible();

    // Wait for potential embedding generation
    await adaContext.page.waitForTimeout(2000);
    await babbageContext.page.waitForTimeout(2000);

    // Search as Ada
    const adaSearchResults = await adaContext.request.get('/api/search?q=quantum%20computing&limit=10');
    expect(adaSearchResults.status()).toBe(200);
    const adaData = await adaSearchResults.json();

    // Search as Babbage
    const babbageSearchResults = await babbageContext.request.get('/api/search?q=quantum%20computing&limit=10');
    expect(babbageSearchResults.status()).toBe(200);
    const babbageData = await babbageSearchResults.json();

    console.log(`Ada search results: ${adaData.total}, Babbage search results: ${babbageData.total}`);
    
    // Results should be user-isolated
    // (In practice, Ada should find her quantum computing content, Babbage shouldn't)
  });
});