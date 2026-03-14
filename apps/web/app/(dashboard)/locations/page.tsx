'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Plus } from 'lucide-react';
import type { LocationStatus } from '@lka/shared';

const STATUS_COLORS: Record<LocationStatus, 'success' | 'warning' | 'destructive'> = {
  OPEN: 'success',
  COMING_SOON: 'warning',
  CLOSED: 'destructive',
};

export default function LocationsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LKA Locations</h1>
          <p className="text-muted-foreground mt-1">
            Existing franchise locations and territory management
          </p>
        </div>
        <Button disabled>
          <Plus className="h-4 w-4 mr-2" />
          Add Location
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Franchise Locations
          </CardTitle>
          <CardDescription>
            All LKA franchise locations with territory radii
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
            <MapPin className="h-12 w-12 mb-4 opacity-30" />
            <p>No locations loaded. Connect to the API to load LKA locations.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
