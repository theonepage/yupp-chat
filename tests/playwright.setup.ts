import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

// Setup MSW server for Playwright tests
export const server = setupServer(...handlers);

// Start server before all tests
export default async function globalSetup() {
  console.log('Starting MSW server for Playwright tests...');
  server.listen({ 
    onUnhandledRequest: 'bypass' // Allow unhandled requests to pass through
  });
  
  return async () => {
    console.log('Stopping MSW server...');
    server.close();
  };
}