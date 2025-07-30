# Authentication & Chat Storage

This document explains how authentication works in the chat application, including Guest login, User login, and how chat data is stored for each type of user.

## Authentication Overview

The application uses NextAuth.js for authentication with two distinct user types:

- **Guest users**: Temporary users with automatic anonymous access
- **Regular users**: Authenticated users with email/password credentials

## User Types

### Guest Users (`type: 'guest'`)

**Login Process:**
1. When a user visits the application without authentication, middleware (`middleware.ts:30`) automatically redirects them to `/api/auth/guest`
2. The guest auth endpoint (`app/(auth)/api/auth/guest/route.ts`) creates a temporary guest user
3. Guest users are created with:
   - Email format: `guest-{timestamp}` (e.g., `guest-1643723400000`)
   - Random UUID password (hashed)
   - User type: `'guest'`

**Implementation Details:**
- Guest detection uses regex pattern: `/^guest-\d+$/` (`lib/constants.ts:11`)
- Created via `createGuestUser()` function (`lib/db/queries.ts:66-81`)
- No user input required - fully automatic

### Regular Users (`type: 'regular'`)

**Login Process:**
1. Users provide email and password via auth form (`components/auth-form.tsx`)
2. Credentials are validated against the database using bcrypt
3. Authentication handled by NextAuth.js Credentials provider (`app/(auth)/auth.ts:41-64`)

**Implementation Details:**
- Email/password stored in User table (`lib/db/schema.ts:16-20`)
- Password hashing using bcrypt-ts
- Authenticated via `getUser()` function (`lib/db/queries.ts:45-54`)

## Authentication Flow

### Session Management

```typescript
// Session structure (app/(auth)/auth.ts:11-31)
interface Session {
  user: {
    id: string;
    type: 'guest' | 'regular';
    email?: string;
    name?: string;
  }
}
```

### Middleware Protection

The middleware (`middleware.ts`) handles:
- **Unauthenticated users**: Automatically redirect to guest auth
- **Guest users**: Allow access to all chat features
- **Regular users**: Full access, blocked from login/register pages
- **Auth routes**: Bypass middleware protection

## Chat Storage

### Database Schema

Both guest and regular users use the same database tables for chat storage:

```sql
-- Users table (lib/db/schema.ts:16-20)
User {
  id: uuid (primary key)
  email: varchar(64)
  password: varchar(64)
}

-- Chats table (lib/db/schema.ts:24-34)  
Chat {
  id: uuid (primary key)
  createdAt: timestamp
  title: text
  userId: uuid (foreign key -> User.id)
  visibility: 'public' | 'private' (default: 'private')
}

-- Messages table (lib/db/schema.ts:52-61)
Message_v2 {
  id: uuid (primary key)
  chatId: uuid (foreign key -> Chat.id)
  role: varchar
  parts: json
  attachments: json
  createdAt: timestamp
}
```

### Storage Behavior

**For Guest Users:**
- ✅ Chats are saved to database with guest user ID
- ✅ Full message history persisted
- ✅ Chat titles and metadata stored
- ✅ Attachments and message parts supported
- ⚠️ **Temporary**: Guest accounts are ephemeral - data may be cleaned up
- ⚠️ **Session-dependent**: No way to recover data if session is lost

**For Regular Users:**
- ✅ Chats permanently associated with user account
- ✅ Data persists across sessions and devices
- ✅ Full chat history accessible after re-login
- ✅ Supports visibility settings (public/private)

### Chat Operations

Both user types have access to identical chat functionality:

- **Create Chat**: `saveChat()` - Creates new chat with user ID
- **List Chats**: `getChatsByUserId()` - Retrieves user's chat history
- **Delete Chat**: `deleteChatById()` - Removes chat and associated data
- **Save Messages**: `saveMessages()` - Persists conversation messages
- **Message Voting**: `voteMessage()` - Upvote/downvote messages

### Client-Side Storage

Limited client-side storage is used for:
- **Attachments**: Temporary local storage via `getLocalStorage()` (`lib/utils.ts:51-56`)
- **UI State**: React state and hooks like `useLocalStorage`

**Note**: Primary chat data is always stored server-side in PostgreSQL, not in browser storage.

## Key Files

### Authentication
- `app/(auth)/auth.ts` - NextAuth configuration and providers
- `app/(auth)/auth.config.ts` - NextAuth configuration
- `app/(auth)/api/auth/guest/route.ts` - Guest user creation endpoint
- `components/auth-form.tsx` - Login/register form component
- `middleware.ts` - Route protection and guest redirection

### Database
- `lib/db/schema.ts` - Database table definitions
- `lib/db/queries.ts` - Database operations (CRUD)
- `lib/constants.ts` - Guest user regex and constants

### Storage Utilities
- `lib/utils.ts` - Helper functions including localStorage access
- `components/multimodal-input.tsx` - Message input with local storage for attachments

## Security Considerations

1. **Guest Users**: 
   - Temporary by design
   - No persistent authentication
   - Data cleanup may occur
   - Limited session security

2. **Regular Users**:
   - Bcrypt password hashing
   - Secure session management via NextAuth.js
   - CSRF protection built-in
   - Environment-based cookie security

3. **Data Access**:
   - All chat operations require valid user session
   - User ID validation on all database operations
   - Chat visibility controls for public/private access