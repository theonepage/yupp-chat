import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';
import { PersonasClient } from '@/components/personas/personas-client';

export default async function PersonasPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  return <PersonasClient userId={session.user.id as string} />;
}
