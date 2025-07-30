# Personas Feature Documentation

## Overview

Yupp Chat implements a comprehensive personas system that allows users to create, manage, and use custom AI personalities with specific behaviors, expertise, and communication styles. Each persona has a unique system prompt that guides the AI's responses and interactions.

## Architecture

### Core Components

#### 1. Database Schema (`lib/db/schema.ts:24-37`)

**Personas Table**
```sql
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  avatar VARCHAR(10) NOT NULL DEFAULT '🤖',
  color VARCHAR(50) NOT NULL DEFAULT 'bg-blue-500',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES "User"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Chat-Persona Integration**
```sql
-- Chats can be linked to personas
ALTER TABLE "Chat" ADD COLUMN persona_id UUID REFERENCES personas(id);
```

#### 2. Database Operations (`lib/db/queries.ts`)

**Core Functions:**
- `getAllActivePersonas()` - Retrieves all active personas ordered by name
- `createPersona(data)` - Creates a new persona with validation
- `getPersonaById(id)` - Fetches a specific persona
- `updatePersona(data)` - Updates persona with ownership validation
- `deletePersona(data)` - Soft deletes persona (sets isActive = false)

**User Ownership Model:**
- Personas are owned by the user who created them (`createdBy` field)
- Users can only edit/delete their own personas
- Community personas are read-only for non-owners

#### 3. API Endpoints

**GET /api/personas** (`app/(chat)/api/personas/route.ts`)
- Returns all active personas
- Requires authentication
- No filtering by ownership (shows both user's and community personas)

**POST /api/personas** (`app/(chat)/api/personas/route.ts`)
- Creates new persona
- Validates input with Zod schema
- Associates with authenticated user

**GET/PUT/DELETE /api/personas/[id]** (`app/(chat)/api/personas/[id]/route.ts`)
- Individual persona management
- Ownership validation for modifications
- GET is public, PUT/DELETE require ownership

#### 4. Frontend Components

**PersonasClient Component (`components/personas/personas-client.tsx`)**
- Main management interface with tabs for "My Personas" and "Community Personas"
- Handles CRUD operations through API calls
- Separates user-owned personas from community personas
- Provides empty states and loading states

**PersonaCard Component (`components/personas/persona-card.tsx`)**
- Displays persona information with avatar, name, and description
- Expandable system prompt viewer
- Edit/delete actions for owned personas
- "Start Chat" functionality that navigates to chat with persona parameter

**PersonaForm Component (`components/personas/persona-form.tsx`)**
- Modal form for creating/editing personas
- Customizable avatars (20 emoji options)
- Color themes (8 predefined colors)
- Rich textarea for system prompt editing
- Form validation and submission handling

#### 5. AI Integration (`lib/ai/prompts.ts:54-72`)

**System Prompt Integration**
```typescript
export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  persona,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  persona?: Persona | null;
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);
  
  // Use persona's system prompt if available, fallback to regular prompt
  const basePrompt = persona?.systemPrompt || regularPrompt;
  
  return `${basePrompt}\n\n${requestPrompt}`;
};
```

**Chat Integration (`app/(chat)/api/chat/route.ts:166`)**
- Personas are passed to the AI model's system prompt
- Overrides default behavior with persona-specific instructions
- Maintains context throughout the conversation

## Data Flow

### 1. Persona Creation
```
User Input → PersonaForm → Validation → API POST → Database → UI Update
```

### 2. Chat with Persona
```
Select Persona → Navigate to Chat → Load Persona → Apply System Prompt → AI Response
```

### 3. Persona Management
```
Load Personas → Separate by Ownership → Display in Tabs → Enable Actions
```

## User Interface

### Personas Page (`/personas`)
- **My Personas Tab**: Shows user-created personas with edit/delete capabilities
- **Community Personas Tab**: Shows personas created by other users (read-only)
- **Create Button**: Opens persona creation form
- **Empty States**: Helpful prompts when no personas exist

### Persona Cards
- **Visual Identity**: Customizable emoji avatar and color theme
- **Information**: Name, description, and creation date
- **Actions**: View system prompt, start chat, edit (if owned), delete (if owned)
- **Community Badge**: Indicates personas created by other users

### Persona Form
- **Basic Info**: Name and description fields
- **Customization**: Avatar selector (20 emoji options) and color picker (8 themes)
- **System Prompt**: Large textarea with monospace font for detailed instructions
- **Validation**: Required fields and character limits

## Configuration

### Form Validation Schema
```typescript
const createPersonaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(10).max(2000),
  avatar: z.string().optional(),
  color: z.string().optional(),
});
```

### Available Customizations
- **Avatars**: 20 emoji options (🤖, 👩‍💻, 👨‍💻, 🧠, 📚, 🎨, 🔬, 💡, 🎭, 🌟, etc.)
- **Colors**: 8 theme options (Blue, Green, Purple, Red, Orange, Pink, Indigo, Teal)
- **System Prompt**: 10-2000 character limit for detailed behavior instructions

## Security Features

### Authentication & Authorization
- All persona operations require valid user session
- Ownership validation for edit/delete operations
- Users can only modify their own personas
- Public read access for community personas

### Input Validation
- Zod schema validation on API routes
- Client-side form validation
- Character limits on all text fields
- Required field enforcement

### Data Integrity
- Foreign key constraints between users and personas
- Soft deletion (isActive flag) preserves data integrity
- Automatic timestamps for audit trail

## Usage Examples

### Creating a Code Expert Persona
```typescript
const codeExpertPersona = {
  name: "Code Expert",
  description: "Specialized in programming languages and software development",
  systemPrompt: `You are a senior software engineer with expertise in multiple programming languages. 
  Provide clear, well-commented code examples and explain complex concepts in simple terms. 
  Always consider best practices, performance, and maintainability in your suggestions.`,
  avatar: "👨‍💻",
  color: "bg-blue-500"
};
```

### Starting a Chat with Persona
```typescript
// Navigate to chat with persona parameter
window.location.href = `/?persona=${personaId}`;

// Persona is automatically loaded and applied to the chat session
```

### API Usage
```typescript
// Fetch all personas
const response = await fetch('/api/personas');
const personas = await response.json();

// Create new persona
const newPersona = await fetch('/api/personas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(personaData)
});
```

## Database Setup

### Migration
Personas are included in the main database migration:
```sql
-- Migration: 0009_spicy_living_mummy.sql
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  avatar VARCHAR(10) NOT NULL DEFAULT '🤖',
  color VARCHAR(50) NOT NULL DEFAULT 'bg-blue-500',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES "User"(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add persona reference to chats
ALTER TABLE "Chat" ADD COLUMN persona_id UUID REFERENCES personas(id);
```

## Performance Considerations

### Data Loading
- Personas are loaded once per page visit
- Cached in component state for quick access
- Minimal data transfer (only active personas)

### UI Performance
- Lazy loading of system prompts (expandable sections)
- Optimistic UI updates for better perceived performance
- Debounced form inputs to prevent excessive API calls

## Future Enhancements

### Planned Features
- **Persona Templates**: Pre-built personas for common use cases
- **Persona Sharing**: Public marketplace for community personas
- **Advanced Customization**: Custom avatars, more color options
- **Persona Analytics**: Usage statistics and performance metrics

### Potential Improvements
- **Version Control**: Track changes to persona system prompts
- **Import/Export**: Backup and share persona configurations
- **Collaborative Editing**: Multiple users can contribute to personas
- **AI-Assisted Creation**: Help generate system prompts based on descriptions

## Integration Points

### Chat System
- Personas modify the system prompt passed to AI models
- Chat history maintains persona context
- Seamless switching between personas in conversations

### User Management
- Personas are tied to user accounts
- User preferences can include default personas
- Permission system for persona management

### Search Integration
- Personas can be searched and filtered
- Chat search can filter by persona used
- System prompts are searchable content

This personas system provides a powerful way for users to customize their AI interactions while maintaining a clean, intuitive interface and robust security model.