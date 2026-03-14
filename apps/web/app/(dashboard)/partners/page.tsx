'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Download } from 'lucide-react';
import type { PartnerStatus } from '@lka/shared';

const STATUS_COLORS: Record<PartnerStatus, 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'> = {
  not_contacted: 'outline',
  contacted: 'secondary',
  interested: 'warning',
  partnered: 'success',
  declined: 'destructive',
};

const STATUS_LABELS: Record<PartnerStatus, string> = {
  not_contacted: 'Not Contacted',
  contacted: 'Contacted',
  interested: 'Interested',
  partnered: 'Partnered',
  declined: 'Declined',
};

export default function PartnersPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partner Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            Manage community partners for franchise development
          </p>
        </div>
        <Button variant="outline" disabled>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.keys(STATUS_LABELS) as PartnerStatus[]).map((status) => (
          <Card key={status}>
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold">0</p>
              <Badge variant={STATUS_COLORS[status]} className="mt-1 text-xs">
                {STATUS_LABELS[status]}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Partners
          </CardTitle>
          <CardDescription>
            Partners are discovered when you score a location
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
            <Users className="h-12 w-12 mb-4 opacity-30" />
            <p>No partners yet. Score a location to discover nearby partners.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
