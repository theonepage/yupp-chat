'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  ChevronDown, 
  ChevronUp, 
  Edit, 
  MoreVertical, 
  Trash2, 
  MessageSquare 
} from 'lucide-react';
import type { Persona } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface PersonaCardProps {
  persona: Persona;
  canEdit?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function PersonaCard({ persona, canEdit = false, onEdit, onDelete }: PersonaCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleStartChat = () => {
    // Navigate to chat with this persona
    window.location.href = `/?persona=${persona.id}`;
  };

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between min-h-16">
          <div className="flex items-center gap-3">
            <div 
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-xl",
                persona.color
              )}
            >
              {persona.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg truncate">{persona.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {persona.description}
              </CardDescription>
            </div>
          </div>
          
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="gap-2"
          >
            View System Prompt
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          <Button onClick={handleStartChat} size="sm">
            <MessageSquare className="mr-2 h-4 w-4" />
            Start Chat
          </Button>
        </div>

        {isExpanded && (
          <div className="space-y-2">
            <div className="text-sm font-medium">System Prompt:</div>
            <div className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap max-h-32 overflow-y-auto">
              {persona.systemPrompt || 'No system prompt defined.'}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Created {new Date(persona.createdAt).toLocaleDateString()}
          </span>
          {!canEdit && (
            <Badge variant="secondary" className="text-xs">
              Community
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
