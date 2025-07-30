'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Persona } from '@/lib/db/schema';

interface PersonaFormProps {
  persona?: Persona | null;
  onSubmit: (data: Partial<Persona>) => Promise<void>;
  onCancel: () => void;
}

const avatarOptions = [
  '🤖', '👩‍💻', '👨‍💻', '🧠', '📚', '🎨', '🔬', '💡', '🎭', '🌟',
  '🚀', '🎯', '📊', '💼', '🔍', '⚡', '🎪', '🏆', '🎲', '🎵'
];

const colorOptions = [
  { label: 'Blue', value: 'bg-blue-500' },
  { label: 'Green', value: 'bg-green-500' },
  { label: 'Purple', value: 'bg-purple-500' },
  { label: 'Red', value: 'bg-red-500' },
  { label: 'Orange', value: 'bg-orange-500' },
  { label: 'Pink', value: 'bg-pink-500' },
  { label: 'Indigo', value: 'bg-indigo-500' },
  { label: 'Teal', value: 'bg-teal-500' },
];

export function PersonaForm({ persona, onSubmit, onCancel }: PersonaFormProps) {
  const [formData, setFormData] = useState({
    name: persona?.name || '',
    description: persona?.description || '',
    systemPrompt: persona?.systemPrompt || '',
    avatar: persona?.avatar || '🤖',
    color: persona?.color || 'bg-blue-500',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditing = Boolean(persona);

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Persona' : 'Create New Persona'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Update your persona settings and system prompt.'
              : 'Create a custom AI persona with specific behaviors and expertise.'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Code Expert"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatar">Avatar</Label>
              <Select 
                value={formData.avatar} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, avatar: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <div className="grid grid-cols-5 gap-2 p-2">
                    {avatarOptions.map((emoji) => (
                      <SelectItem key={emoji} value={emoji} className="text-center">
                        <span className="text-xl">{emoji}</span>
                      </SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color Theme</Label>
            <Select 
              value={formData.color} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, color: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {colorOptions.map((color) => (
                  <SelectItem key={color.value} value={color.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full ${color.value}`} />
                      {color.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of what this persona specializes in..."
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={formData.systemPrompt}
              onChange={(e) => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
              placeholder="Define the persona's behavior, expertise, and communication style..."
              rows={8}
              className="font-mono text-sm"
              required
            />
            <p className="text-xs text-muted-foreground">
              This prompt will guide the AI&apos;s behavior when using this persona.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting 
                ? (isEditing ? 'Updating...' : 'Creating...') 
                : (isEditing ? 'Update Persona' : 'Create Persona')
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
