import { http, HttpResponse } from 'msw';

// Mock OpenAI embedding responses
const mockEmbedding = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.1);

// Mock chat responses based on user input
function getMockChatResponse(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('grass') && lowerMessage.includes('green')) {
    return "It's just green duh!";
  }
  if (lowerMessage.includes('sky') && lowerMessage.includes('blue')) {
    return "It's just blue duh!";
  }
  if (lowerMessage.includes('next.js') || lowerMessage.includes('nextjs')) {
    return 'With Next.js, you can ship fast!';
  }
  if (lowerMessage.includes('weather') && lowerMessage.includes('sf')) {
    return 'The current temperature in San Francisco is 17°C.';
  }
  if (lowerMessage.includes('monet') || lowerMessage.includes('painted')) {
    return 'This painting is by Monet!';
  }
  
  return 'Mock response';
}

export const handlers = [
  // Mock OpenAI chat completions API
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as any;
    
    // Get the last user message
    const userMessages = body.messages?.filter((msg: any) => msg.role === 'user') || [];
    const lastUserMessage = userMessages[userMessages.length - 1];
    const messageContent = lastUserMessage?.content || '';
    
    const mockResponse = getMockChatResponse(messageContent);
    
    // Simulate streaming response
    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Send data chunks
          controller.enqueue(encoder.encode('data: {"id":"mock","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"' + mockResponse + '"},"finish_reason":null}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"id":"mock","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    // Non-streaming response
    return HttpResponse.json({
      id: 'mock-completion',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: mockResponse,
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });
  }),

  // Mock local chat API
  http.post('http://localhost:3000/api/chat', async ({ request }) => {
    const body = await request.json() as any;
    const message = body.message;
    const messageContent = message?.content || message?.parts?.[0]?.text || '';
    
    const mockResponse = getMockChatResponse(messageContent);
    
    // Create mock SSE response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send UI message stream format
        controller.enqueue(encoder.encode(`data: {"type":"text-delta","textDelta":"${mockResponse}","id":"mock-message"}\n\n`));
        controller.enqueue(encoder.encode(`data: {"type":"finish","finishReason":"stop","usage":{"promptTokens":10,"completionTokens":5}}\n\n`));
        controller.close();
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }),

  // Mock OpenAI embeddings API
  http.post('https://api.openai.com/v1/embeddings', async ({ request }) => {
    const body = await request.json() as any;
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Mock response based on input
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const embeddings = inputs.map((input: string, index: number) => ({
      object: 'embedding',
      index,
      embedding: mockEmbedding.map(val => val + Math.random() * 0.01), // Add small variation
    }));
    
    return HttpResponse.json({
      object: 'list',
      data: embeddings,
      model: 'text-embedding-3-small',
      usage: {
        prompt_tokens: inputs.join(' ').length / 4,
        total_tokens: inputs.join(' ').length / 4,
      },
    });
  }),

  // Mock embedding generation failure
  http.post('https://api.openai.com/v1/embeddings', async ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('fail') === 'true') {
      return HttpResponse.json(
        { error: { message: 'Mock API failure', type: 'api_error' } },
        { status: 500 }
      );
    }
  }),
];