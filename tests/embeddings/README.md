# Embedding and Search Tests

This directory contains comprehensive tests for the embedding generation and search functionality.

## Test Structure

### Unit Tests (Vitest)
- `embedding-service.test.ts` - Core embedding service functionality
- `integration.test.ts` - End-to-end embedding workflows
- `embedding-creation.test.ts` - Database integration tests (requires setup)
- `search-api.test.ts` - API endpoint tests (requires setup)

### E2E Tests (Playwright)
- `embedding-search.test.ts` - Browser-based search UI tests
- `embedding-api.test.ts` - API integration tests with Next.js server
- `search-workflow.test.ts` - Complete workflow integration tests

## Running Tests

### Unit Tests
```bash
# Run all unit tests
pnpm test:unit

# Run specific embedding tests
pnpm test:unit tests/embeddings/embedding-service.test.ts
pnpm test:unit tests/embeddings/integration.test.ts

# Run all embedding unit tests
pnpm test:embeddings
```

### E2E Tests
```bash
# Run all e2e tests
pnpm test

# Run only embedding e2e tests
npx playwright test --project=embedding-tests

# Run specific embedding e2e test
npx playwright test tests/e2e/embedding-search.test.ts

# Run with UI
npx playwright test --project=embedding-tests --ui
```

## Test Features

### Unit Tests (MSW)
✅ **OpenAI API Mocking** - Complete mock of embedding generation  
✅ **Batch Processing** - Tests for 1-50 embeddings with performance metrics  
✅ **Content Processing** - Text extraction from complex message parts  
✅ **Error Handling** - Edge cases and validation  
✅ **Performance Benchmarks** - Automated timing measurements  
✅ **Data Quality** - Consistency and deduplication validation  

### E2E Tests (Playwright)
✅ **Full Browser Testing** - Real Next.js server integration  
✅ **User Authentication** - Multi-user scenarios  
✅ **Chat Creation** - Message sending and UI interaction  
✅ **Search Interface** - Sidebar search component testing  
✅ **API Integration** - Real API endpoint testing  
✅ **Navigation** - Search result click-through  
✅ **Performance** - Response time validation  
✅ **Data Isolation** - User-specific search results  

## Test Data

### Sample Messages
- Machine Learning: "What is machine learning and how does it work?"
- Neural Networks: "Can you explain neural networks?"  
- Programming: "How do I write a function in JavaScript?"
- Web Development: "How do I create a responsive website using CSS?"
- Data Science: "What tools are commonly used in data science?"

### Performance Benchmarks
```
Unit Test Results:
  1 items: 102ms total, 102.00ms avg per item
  5 items: 106ms total, 21.20ms avg per item  
  10 items: 109ms total, 10.90ms avg per item
  20 items: 112ms total, 5.60ms avg per item
  50 items: 119ms total, 2.40ms avg per item
```

## Environment Setup

### Required Environment Variables
```bash
# OpenAI API (mocked in tests)
OPENAI_API_KEY=test-api-key

# Database
POSTGRES_URL=your-test-database-url

# Embedding Configuration
AUTO_GENERATE_EMBEDDINGS=true
EMBEDDING_MODE=queue
```

### Mock OpenAI API
Tests use MSW to mock the OpenAI embedding API with realistic responses:
- 1536-dimensional vectors
- Simulated API delays
- Consistent responses for same input
- Error scenario testing

## Test Scenarios

### Search Functionality
1. **Basic Search** - Find messages by content
2. **Semantic Search** - Similar meaning matching
3. **Multi-language** - Unicode and special characters
4. **Performance** - Response time validation
5. **Pagination** - Result limits and thresholds
6. **User Isolation** - User-specific results

### Embedding Generation
1. **Automatic Generation** - On message creation
2. **Batch Processing** - Background queue processing
3. **Deduplication** - Content hash validation
4. **Error Recovery** - Failed embedding handling
5. **Statistics** - Coverage and metrics tracking

### UI Testing
1. **Search Input** - Typing and debouncing
2. **Results Display** - Search result formatting
3. **Navigation** - Click-through to chats
4. **Empty States** - No results handling
5. **Loading States** - Search in progress
6. **Error States** - Search failures

## Debugging

### Test Failures
```bash
# Run with debug output
DEBUG=1 pnpm test:unit tests/embeddings/

# Playwright debug mode
npx playwright test --debug tests/e2e/embedding-search.test.ts

# View test report
npx playwright show-report
```

### Common Issues
1. **Database Connection** - Ensure test database is available
2. **OpenAI API** - API key required (mocked in unit tests)
3. **Timing Issues** - Embedding generation is asynchronous
4. **Search Results** - May require populated embeddings

### Logs
Tests include extensive logging for debugging:
- Embedding generation progress
- Search performance metrics
- API response details
- UI interaction outcomes

## Contributing

When adding new tests:
1. Add unit tests for core functionality
2. Add E2E tests for user workflows
3. Include performance benchmarks
4. Add error scenario coverage
5. Update this README with new features