import { auth } from '@/app/(auth)/auth';
import { getPersonaById, updatePersona, deletePersona } from '@/lib/db/queries';
import { z } from 'zod';
import { ChatSDKError } from '@/lib/errors';

const updatePersonaSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(10).max(2000).optional(),
  avatar: z.string().optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const foundPersona = await getPersonaById(id);

    if (!foundPersona) {
      return new ChatSDKError('not_found:database', 'Persona not found').toResponse();
    }

    return Response.json(foundPersona);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error('Failed to fetch persona:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const body = await request.json();
    const validatedData = updatePersonaSchema.parse(body);

    const updatedPersona = await updatePersona({
      id,
      ...validatedData,
      userId: session.user.id,
    });

    if (!updatedPersona) {
      return new ChatSDKError('not_found:database', 'Persona not found or unauthorized').toResponse();
    }

    return Response.json(updatedPersona);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error('Failed to update persona:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const success = await deletePersona({
      id,
      userId: session.user.id,
    });

    if (!success) {
      return new ChatSDKError('not_found:database', 'Persona not found or unauthorized').toResponse();
    }

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error('Failed to delete persona:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}