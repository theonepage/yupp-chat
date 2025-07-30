'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import { PersonaCard } from './persona-card';
import { PersonaForm } from './persona-form';
import type { Persona } from '@/lib/db/schema';

interface PersonasClientProps {
  userId: string;
}

export function PersonasClient({ userId }: PersonasClientProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

  useEffect(() => {
    fetchPersonas();
  }, []);

  const fetchPersonas = async () => {
    try {
      const response = await fetch('/api/personas');
      if (response.ok) {
        const data = await response.json();
        setPersonas(data);
      }
    } catch (error) {
      console.error('Failed to fetch personas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePersona = async (personaData: Partial<Persona>) => {
    try {
      const response = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personaData),
      });

      if (response.ok) {
        const newPersona = await response.json();
        setPersonas(prev => [...prev, newPersona]);
        setShowCreateForm(false);
      }
    } catch (error) {
      console.error('Failed to create persona:', error);
    }
  };

  const handleUpdatePersona = async (id: string, personaData: Partial<Persona>) => {
    try {
      const response = await fetch(`/api/personas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personaData),
      });

      if (response.ok) {
        const updatedPersona = await response.json();
        setPersonas(prev => prev.map(p => p.id === id ? updatedPersona : p));
        setEditingPersona(null);
      }
    } catch (error) {
      console.error('Failed to update persona:', error);
    }
  };

  const handleDeletePersona = async (id: string) => {
    try {
      const response = await fetch(`/api/personas/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setPersonas(prev => prev.filter(p => p.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete persona:', error);
    }
  };

  const myPersonas = personas.filter(p => p.createdBy === userId);
  const communityPersonas = personas.filter(p => p.createdBy !== userId);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Personas</h1>
          <p className="text-muted-foreground">Manage and browse AI personas for your chats</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Persona
        </Button>
      </div>

      <Tabs defaultValue="my-personas" className="py-4">
        <TabsList>
          <TabsTrigger value="my-personas">
            My Personas ({myPersonas.length})
          </TabsTrigger>
          <TabsTrigger value="community">
            Community Personas ({communityPersonas.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-personas" className="space-y-4">
          {myPersonas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="text-6xl mb-4">🤖</div>
                <CardTitle className="mb-2">No personas yet</CardTitle>
                <CardDescription className="text-center mb-4">
                  Create your first persona to get started with customized AI conversations
                </CardDescription>
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Persona
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPersonas.map((persona) => (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  canEdit={true}
                  onEdit={() => setEditingPersona(persona)}
                  onDelete={() => handleDeletePersona(persona.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="community" className="space-y-4">
          {communityPersonas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="text-6xl mb-4">🌟</div>
                <CardTitle className="mb-2">No community personas</CardTitle>
                <CardDescription className="text-center">
                  Community personas will appear here when other users share them
                </CardDescription>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {communityPersonas.map((persona) => (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  canEdit={false}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {(showCreateForm || editingPersona) && (
        <PersonaForm
          persona={editingPersona}
          onSubmit={editingPersona 
            ? (data) => handleUpdatePersona(editingPersona.id, data)
            : handleCreatePersona
          }
          onCancel={() => {
            setShowCreateForm(false);
            setEditingPersona(null);
          }}
        />
      )}
    </div>
  );
}
