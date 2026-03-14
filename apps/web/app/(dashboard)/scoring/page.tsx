'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, TrendingUp } from 'lucide-react';
import { SCORING_WEIGHTS } from '@lka/shared';

const FACTOR_LABELS: Record<string, string> = {
  target_households: 'Target Households',
  competitor_landscape: 'Competitor Landscape',
  school_quality: 'School Quality & Montessori',
  population_growth: 'Population Growth Trend',
  community_density: 'Community & Partner Density',
  commercial_real_estate: 'Commercial Real Estate',
};

export default function ScoringPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Site Eligibility Score</h1>
          <p className="text-muted-foreground mt-1">
            Weighted scoring across 6 factors
          </p>
        </div>
        <Button disabled>
          <Star className="h-4 w-4 mr-2" />
          Score This Location
        </Button>
      </div>

      {/* Score display */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="text-8xl font-bold text-muted-foreground/30">—</div>
            <p className="text-muted-foreground">Select a location and click Score to begin</p>
          </div>
        </CardContent>
      </Card>

      {/* Scoring factors */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Scoring Factors</h2>
        <div className="space-y-3">
          {Object.entries(SCORING_WEIGHTS).map(([key, weight]) => (
            <Card key={key}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{FACTOR_LABELS[key] ?? key}</p>
                    <p className="text-sm text-muted-foreground">
                      Weight: {Math.round(weight * 100)}%
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Progress bar placeholder */}
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/30 rounded-full"
                        style={{ width: `${weight * 100}%` }}
                      />
                    </div>
                    <Badge variant="outline">—</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
