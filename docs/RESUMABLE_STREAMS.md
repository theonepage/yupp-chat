# RESUMABLE_STREAMS.md - Resumable Streams Implementation

The app implements resumable streams using the `resumable-stream` package with Redis as the persistence layer. Here's how it works:

## Core Architecture

### 1. Stream Context Setup (`app/(chat)/api/chat/route.ts:43-63`)
```typescript
let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,  // Next.js after() for background tasks
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log('Resumable streams are disabled due to missing REDIS_URL');
      }
    }
  }
  return globalStreamContext;
}
```

**Key Points:**
- **Redis Dependency**: Requires `REDIS_URL` environment variable
- **Graceful Degradation**: Falls back to non-resumable streams if Redis unavailable
- **Singleton Pattern**: Global context shared across requests

### 2. Stream Creation (`app/(chat)/api/chat/route.ts:149-220`)
```typescript
// Generate unique stream ID and persist to database
const streamId = generateUUID();
await createStreamId({ streamId, chatId: id });

// Create UI message stream with tools and AI model
const stream = createUIMessageStream({
  execute: ({ writer: dataStream }) => {
    const result = streamText({
      model: myProvider.languageModel(selectedChatModel),
      // ... configuration
    });
    dataStream.merge(result.toUIMessageStream());
  },
  onFinish: async ({ messages }) => {
    await saveMessages({ messages });
  },
});

// Wrap stream with resumable context if available
const streamContext = getStreamContext();
if (streamContext) {
  return new Response(
    await streamContext.resumableStream(streamId, () =>
      stream.pipeThrough(new JsonToSseTransformStream())
    )
  );
} else {
  return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
}
```

**Process:**
1. **Generate Stream ID**: UUID for tracking specific stream
2. **Persist Stream ID**: Store in database (`lib/db/schema.ts:154-170`)
3. **Create Stream**: AI SDK stream with tools and model
4. **Wrap with Resumable Context**: Redis-backed resumable wrapper

## 3. Stream Resumption (`app/(chat)/api/chat/[id]/stream/route.ts`)

### Resume Logic Flow:
```typescript
export async function GET(_, { params }: { params: Promise<{ id: string }> }) {
  const { id: chatId } = await params;
  const streamContext = getStreamContext();
  
  // 1. Get most recent stream ID for chat
  const streamIds = await getStreamIdsByChatId({ chatId });
  const recentStreamId = streamIds.at(-1);
  
  // 2. Attempt to resume stream from Redis
  const stream = await streamContext.resumableStream(recentStreamId, () =>
    emptyDataStream.pipeThrough(new JsonToSseTransformStream())
  );
  
  // 3. Fallback: Restore from database if stream expired
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);
    
    // Only restore if message is recent (< 15 seconds)
    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) <= 15) {
      const restoredStream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({
            type: 'data-appendMessage',
            data: JSON.stringify(mostRecentMessage),
            transient: true,
          });
        },
      });
      return new Response(restoredStream.pipeThrough(new JsonToSseTransformStream()));
    }
  }
  
  return new Response(stream);
}
```

## 4. Client-Side Auto-Resume (`hooks/use-auto-resume.ts`)

```typescript
export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
}: UseAutoResumeParams) {
  // Auto-resume if last message is from user
  useEffect(() => {
    if (!autoResume) return;
    
    const mostRecentMessage = initialMessages.at(-1);
    if (mostRecentMessage?.role === 'user') {
      resumeStream();  // Calls GET /api/chat/[id]/stream
    }
  }, []);
  
  // Handle restored messages from stream
  const { dataStream } = useDataStream();
  useEffect(() => {
    const dataPart = dataStream[0];
    if (dataPart.type === 'data-appendMessage') {
      const message = JSON.parse(dataPart.data);
      setMessages([...initialMessages, message]);
    }
  }, [dataStream, initialMessages, setMessages]);
}
```

## 5. Database Schema (`lib/db/schema.ts:154-170`)

```typescript
export const stream = pgTable('Stream', {
  id: uuid('id').notNull().defaultRandom(),
  chatId: uuid('chatId').notNull(),
  createdAt: timestamp('createdAt').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.id] }),
  chatRef: foreignKey({
    columns: [table.chatId],
    foreignColumns: [chat.id],
  }),
}));
```

**Database Operations:**
- **`createStreamId`**: Insert new stream record linked to chat
- **`getStreamIdsByChatId`**: Retrieve all stream IDs for a chat (ordered by creation time)

## How Resumable Streams Work

### 1. **Stream Persistence**
- **Redis Storage**: Active streams stored in Redis with TTL
- **Stream ID Mapping**: Database maps chat → stream IDs
- **Content Buffering**: Redis buffers partial responses

### 2. **Resume Process**
1. **Client Requests Resume**: `GET /api/chat/[chatId]/stream`
2. **Lookup Stream ID**: Find most recent stream for chat
3. **Redis Check**: Query Redis for active stream data
4. **Stream Reconstruction**: Resume from last known state
5. **Fallback Recovery**: Restore from database if Redis expired

### 3. **Failure Scenarios**
- **Redis Unavailable**: Falls back to standard streaming
- **Stream Expired**: Reconstructs from database (15-second window)
- **No Stream Data**: Returns empty stream
- **Invalid Chat**: Returns 404/403 errors

### 4. **Benefits**
- **Connection Recovery**: Handle network interruptions gracefully
- **Server Restarts**: Survive temporary outages
- **Mobile Networks**: Resume on cellular connection changes
- **Battery Optimization**: Reduce redundant AI generation

## Integration Points

### Frontend Components:
- **`DataStreamHandler`**: Processes streaming data parts for artifacts
- **`useAutoResume`**: Automatically resumes interrupted streams
- **`DataStreamProvider`**: Provides stream context to components

### Backend Infrastructure:
- **Redis**: Stream persistence and state management
- **PostgreSQL**: Stream metadata and message storage
- **AI SDK**: Stream creation and transformation
- **Next.js**: Server-side streaming and background tasks

The implementation provides robust stream resumption with multiple fallback layers while maintaining optimal performance and user experience.

## Key Files Reference

- **Main Chat API**: `app/(chat)/api/chat/route.ts:43-220`
- **Stream Resume API**: `app/(chat)/api/chat/[id]/stream/route.ts:14-112`
- **Auto-Resume Hook**: `hooks/use-auto-resume.ts:15-47`
- **Data Stream Handler**: `components/data-stream-handler.tsx:8-81`
- **Database Queries**: `lib/db/queries.ts` - `createStreamId` and `getStreamIdsByChatId`
- **Database Schema**: `lib/db/schema.ts:154-170`

## Environment Requirements

```bash
# Required for resumable streams
REDIS_URL=redis://localhost:6379

# Optional: Redis connection options
REDIS_PASSWORD=your_password
REDIS_TLS=true
```

## Dependencies

```json
{
  "dependencies": {
    "resumable-stream": "^2.0.0",
    "redis": "^5.0.0"
  }
}
```