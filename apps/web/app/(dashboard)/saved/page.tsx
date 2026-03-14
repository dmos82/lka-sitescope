'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Trash2, Share2 } from 'lucide-react';

export default function SavedPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Saved Analyses</h1>
        <p className="text-muted-foreground mt-1">
          Your saved site evaluations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Analyses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mb-4 opacity-30" />
            <p>No saved analyses yet. Score a location and save it to see it here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
