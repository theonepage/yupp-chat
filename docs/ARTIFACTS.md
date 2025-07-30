# Artifacts Implementation

This document provides an overview of the artifacts system in the yupp-chat application, which allows users to create, edit, and interact with different types of content including text, code, images, and spreadsheets.

## Overview

Artifacts are interactive content components that can be created, updated, and versioned through AI assistance. The system supports four types of artifacts:

- **Text**: Markdown-based text documents
- **Code**: Executable Python code with console output
- **Image**: AI-generated images
- **Sheet**: Interactive spreadsheets

## Architecture

### Core Components

#### Database Schema (`lib/db/schema.ts`)

The artifacts system uses the `document` table to store artifact data:

```typescript
export const document = pgTable('Document', {
  id: uuid('id').notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  kind: varchar('text', { enum: ['text', 'code', 'image', 'sheet'] })
    .notNull()
    .default('text'),
  userId: uuid('userId').notNull().references(() => user.id),
});
```

#### Type Definitions (`lib/types.ts`)

Key types include:
- `ArtifactKind`: Union type for artifact types
- `CustomUIDataTypes`: Defines streaming data types for each artifact
- `ChatMessage`: Extended message type with artifact support

#### Server-Side Handlers (`lib/artifacts/server.ts`)

The `DocumentHandler` interface defines the contract for artifact operations:

```typescript
export interface DocumentHandler<T = ArtifactKind> {
  kind: T;
  onCreateDocument: (args: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (args: UpdateDocumentCallbackProps) => Promise<void>;
}
```

Each artifact type implements this interface in its respective server file.

### Artifact Types

#### 1. Text Artifacts (`artifacts/text/`)

**Purpose**: Create and edit markdown-based text documents

**Server Handler** (`artifacts/text/server.ts`):
- Uses streaming text generation for content creation
- Supports incremental updates with predictive content
- Streams deltas via `data-textDelta` events

**Client Component** (`artifacts/text/client.tsx`):
- Implements rich text editor with suggestion support
- Provides version history and diff viewing
- Actions: view changes, copy, navigation between versions
- Toolbar: polish text, request suggestions

#### 2. Code Artifacts (`artifacts/code/`)

**Purpose**: Generate and execute Python code with console output

**Server Handler** (`artifacts/code/server.ts`):
- Uses structured object streaming for code generation
- Validates code structure with Zod schema
- Streams code via `data-codeDelta` events

**Client Component** (`artifacts/code/client.tsx`):
- Features code editor with syntax highlighting
- Integrated Python execution via Pyodide
- Console output with support for matplotlib plots
- Actions: run code, copy, version navigation
- Toolbar: add comments, add logging

**Execution Features**:
- Browser-based Python execution using Pyodide
- Automatic package loading from imports
- Matplotlib plot rendering as base64 images
- Error handling and output capture

#### 3. Image Artifacts (`artifacts/image/`)

**Purpose**: AI-generated image creation and editing

**Server Handler** (`artifacts/image/server.ts`):
- Handles image generation requests
- Streams image data via `data-imageDelta` events

**Client Component** (`artifacts/image/client.tsx`):
- Image display and editing interface
- Version control for image iterations

#### 4. Sheet Artifacts (`artifacts/sheet/`)

**Purpose**: Interactive spreadsheet functionality

**Server Handler** (`artifacts/sheet/server.ts`):
- Manages spreadsheet data generation
- Streams updates via `data-sheetDelta` events

**Client Component** (`artifacts/sheet/client.tsx`):
- Full spreadsheet interface with data grid
- Cell editing and formula support

### UI Components

#### Main Artifact Component (`components/artifact.tsx`)

The central artifact display component that:
- Manages artifact state and metadata
- Handles version control and document mutations
- Provides split-pane UI with chat and artifact views
- Implements smooth animations and responsive design
- Supports inline and fullscreen modes

Key features:
- **Version Management**: Navigate between document versions
- **Real-time Updates**: Debounced content saving
- **Responsive Design**: Mobile-optimized layouts
- **Collaborative Chat**: Side-by-side chat interface

#### Supporting Components

- `artifact-actions.tsx`: Version control and action buttons
- `artifact-messages.tsx`: Chat interface within artifact view
- `create-artifact.tsx`: Base class for artifact definitions
- `toolbar.tsx`: Context-sensitive toolbar actions

### AI Integration

#### Tool Integration (`lib/ai/tools/`)

**Create Document Tool** (`create-document.ts`):
- Generates new artifacts based on user prompts
- Determines appropriate artifact type
- Initiates streaming content generation

**Update Document Tool** (`update-document.ts`):
- Modifies existing artifacts
- Preserves version history
- Supports incremental updates

#### Streaming Protocol

The system uses a custom streaming protocol with typed events:
- `data-kind`: Artifact type
- `data-id`: Document identifier
- `data-title`: Document title
- `data-textDelta`/`data-codeDelta`/etc.: Content updates
- `data-clear`: Clear current content
- `data-finish`: Mark completion

### Version Control

Each artifact maintains a complete version history:
- Documents are stored with creation timestamps
- Users can navigate between versions
- Diff viewing for text artifacts
- Version-specific actions and toolbar items

### Hooks and State Management

#### `use-artifact.ts`

Central hook for artifact state management:
- Artifact visibility and positioning
- Content and metadata state
- Streaming status tracking

## Usage Patterns

### Creating an Artifact

1. User requests content creation through chat
2. AI determines appropriate artifact type
3. `createDocument` tool is invoked
4. Server-side handler generates content
5. Client receives streaming updates
6. Artifact becomes visible when threshold is met

### Updating an Artifact

1. User requests modifications
2. `updateDocument` tool processes the request
3. New version is created in database
4. Client updates with new content
5. Version history is preserved

### Version Navigation

Users can:
- View previous/next versions
- Toggle between edit and diff modes
- Return to latest version
- See version timestamps and changes

## Testing

The artifacts system includes comprehensive testing:
- E2E tests in `tests/e2e/artifacts.test.ts`
- Unit tests for individual components
- Integration tests for streaming protocols

## Future Enhancements

Potential improvements include:
- Real-time collaboration features
- Advanced version branching
- Additional artifact types (diagrams, presentations)
- Enhanced mobile experience
- Integration with external tools