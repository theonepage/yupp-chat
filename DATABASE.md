# Database Schema Documentation

## Overview

This chat application uses PostgreSQL with Drizzle ORM and includes vector search capabilities via pgvector extension. The database supports user management, chat functionality, document handling with suggestions, and semantic search through embeddings.

## Core Tables

### User Table
- **Table**: `User`
- **Primary Key**: `id` (UUID)
- **Fields**:
  - `id`: Auto-generated UUID primary key
  - `email`: User email (VARCHAR 64, NOT NULL)
  - `password`: Hashed password (VARCHAR 64, NULLABLE)

### Chat Table
- **Table**: `Chat`
- **Primary Key**: `id` (UUID)
- **Fields**:
  - `id`: Auto-generated UUID primary key
  - `createdAt`: Timestamp when chat was created
  - `title`: Chat title (TEXT, NOT NULL)
  - `userId`: Foreign key to User table
  - `visibility`: Enum ('public', 'private') - defaults to 'private'

## Message System

### Current Message Table (v2)
- **Table**: `Message_v2`
- **Primary Key**: `id` (UUID)
- **Fields**:
  - `id`: Auto-generated UUID primary key
  - `chatId`: Foreign key to Chat table
  - `role`: Message role (VARCHAR)
  - `parts`: JSON field for message parts
  - `attachments`: JSON field for attachments
  - `createdAt`: Timestamp

### Legacy Message Table (DEPRECATED)
- **Table**: `Message`
- **Status**: Deprecated - will be removed
- **Migration Guide**: Available at https://chat-sdk.dev/docs/migration-guides/message-parts
- **Fields**: Similar to v2 but with `content` JSON field instead of `parts`/`attachments`

## Voting System

### Current Vote Table (v2)
- **Table**: `Vote_v2`
- **Primary Key**: Composite (`chatId`, `messageId`)
- **Fields**:
  - `chatId`: Foreign key to Chat table
  - `messageId`: Foreign key to Message_v2 table
  - `isUpvoted`: Boolean flag

### Legacy Vote Table (DEPRECATED)
- **Table**: `Vote`
- **Status**: Deprecated - references old Message table

## Document Management

### Document Table
- **Table**: `Document`
- **Primary Key**: Composite (`id`, `createdAt`)
- **Fields**:
  - `id`: Auto-generated UUID
  - `createdAt`: Timestamp (part of composite key)
  - `title`: Document title (TEXT, NOT NULL)
  - `content`: Document content (TEXT, NULLABLE)
  - `kind`: Document type enum ('text', 'code', 'image', 'sheet') - defaults to 'text'
  - `userId`: Foreign key to User table

### Suggestion Table
- **Table**: `Suggestion`
- **Primary Key**: `id` (UUID)
- **Fields**:
  - `id`: Auto-generated UUID primary key
  - `documentId`: References Document.id
  - `documentCreatedAt`: References Document.createdAt
  - `originalText`: Original text content
  - `suggestedText`: Suggested replacement text
  - `description`: Optional description of the suggestion
  - `isResolved`: Boolean flag (defaults to false)
  - `userId`: Foreign key to User table
  - `createdAt`: Timestamp

## Streaming

### Stream Table
- **Table**: `Stream`
- **Primary Key**: `id` (UUID)
- **Fields**:
  - `id`: Auto-generated UUID primary key
  - `chatId`: Foreign key to Chat table
  - `createdAt`: Timestamp

## Vector Search & Embeddings

### Message Embeddings Table
- **Table**: `message_embeddings`
- **Primary Key**: `id` (UUID)
- **Extensions Required**: pgvector
- **Fields**:
  - `id`: Auto-generated UUID primary key
  - `message_id`: Foreign key to Message_v2 (CASCADE DELETE)
  - `embedding`: Vector(1536) for OpenAI embeddings
  - `content_hash`: SHA hash of content (VARCHAR 64)
  - `created_at`: Timestamp with default now()
  - `updated_at`: Timestamp with default now()
- **Indexes**:
  - HNSW vector similarity index using cosine distance
  - Unique constraint on message_id

### Search Sessions Table
- **Table**: `search_sessions`
- **Primary Key**: `id` (UUID)
- **Fields**:
  - `id`: Auto-generated UUID primary key
  - `user_id`: Foreign key to User table
  - `query`: Search query text
  - `query_embedding`: Vector(1536) for query embeddings
  - `result_count`: Number of results returned (defaults to 0)
  - `created_at`: Timestamp with default now()

## Key Features

### 1. Chat Management
- User-owned chat sessions with titles
- Public/private visibility controls
- Message history with parts and attachments

### 2. Document Collaboration
- Multi-format document support (text, code, image, sheet)
- Suggestion system for collaborative editing
- Composite primary keys for temporal document versions

### 3. Vector Search
- Semantic search using OpenAI 1536-dimension embeddings
- HNSW indexing for efficient similarity search
- Search session tracking and analytics
- Content hash-based deduplication

### 4. Voting & Feedback
- Message-level voting system
- Chat-scoped vote tracking

### 5. Real-time Features
- Stream tracking for real-time communication
- Timestamp tracking across all entities

## Migration History

1. **0000**: Initial User and Chat tables with embedded messages
2. **0001**: Document and Suggestion system
3. **0002**: Separate Message and Vote tables, added chat titles
4. **0003**: Chat visibility controls
5. **0004**: Document kind/type field
6. **0005**: Message v2 and Vote v2 with improved structure
7. **0006**: Stream table for real-time features
8. **0007**: Vector search with pgvector extension and embedding tables

## Relationships

- Users own Chats (1:N)
- Chats contain Messages (1:N)
- Messages have Votes (1:N)
- Messages have Embeddings (1:1)
- Users own Documents (1:N)
- Documents have Suggestions (1:N)
- Users create SearchSessions (1:N)
- Chats have Streams (1:N)