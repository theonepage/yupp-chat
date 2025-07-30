import { auth } from '@/app/(auth)/auth';
import { getAllActivePersonas, createPersona } from '@/lib/db/queries';
import { z } from 'zod';
import { ChatSDKError } from '@/lib/errors';

const createPersonaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(10).max(2000),
  avatar: z.string().optional(),
  color: z.string().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const personas = await getAllActivePersonas();
    return Response.json(personas);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error('Failed to fetch personas:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const body = await request.json();
    const validatedData = createPersonaSchema.parse(body);

    const newPersona = await createPersona({
      name: validatedData.name,
      description: validatedData.description,
      systemPrompt: validatedData.systemPrompt,
      avatar: validatedData.avatar,
      color: validatedData.color,
      createdBy: session.user.id,
    });

    return Response.json(newPersona);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error('Failed to create persona:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}