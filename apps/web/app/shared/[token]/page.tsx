'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Star, AlertCircle, Lock } from 'lucide-react';
import Link from 'next/link';

interface SharedAnalysis {
  address: string;
  score: number | null;
  letter_grade: string | null;
  score_breakdown: Record<string, unknown> | null;
  trade_area_miles: number;
  created_at: string;
  partners: Array<{
    id: string;
    name: string;
    category: string;
    distance_miles: number | null;
    status: string;
  }>;
}

function gradeColor(grade: string | null): string {
  if (!grade) return 'text-muted-foreground';
  if (grade.startsWith('A')) return 'text-green-600';
  if (grade.startsWith('B')) return 'text-blue-600';
  if (grade.startsWith('C')) return 'text-yellow-600';
  return 'text-red-600';
}

export default function SharedAnalysisPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<SharedAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
    fetch(`${apiUrl}/api/saved/shared/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Analysis not found or link expired');
        return res.json() as Promise<SharedAnalysis>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold mb-2">Analysis Not Found</h1>
        <p className="text-muted-foreground mb-4">{error ?? 'This shared link is invalid or expired.'}</p>
        <Link href="/login" className="text-primary hover:underline">
          Sign in to create your own analysis
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-primary">LKA SiteScope</h1>
            <p className="text-xs text-muted-foreground">Franchise Site Analysis — Shared Report</p>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Read Only
          </Badge>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Location */}
        <div>
          <h2 className="text-2xl font-bold">Site Analysis Report</h2>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {data.address}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generated {new Date(data.created_at).toLocaleDateString()} · {data.trade_area_miles}-mile trade area
          </p>
        </div>

        {/* Score */}
        {data.score !== null && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Eligibility Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className={`text-7xl font-bold ${gradeColor(data.letter_grade)}`}>
                    {data.score}
                  </div>
                  <div className={`text-2xl font-bold ${gradeColor(data.letter_grade)}`}>
                    {data.letter_grade}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                </div>
                <div className="flex-1">
                  <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        data.score >= 70 ? 'bg-green-500' : data.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${data.score}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Not Eligible (0)</span>
                    <span>Eligible (100)</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Score breakdown */}
        {data.score_breakdown && typeof data.score_breakdown === 'object' && 'factors' in data.score_breakdown && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data.score_breakdown.factors as Array<{
                name: string;
                normalized: number;
                weight: number;
                weightedScore: number;
              }>).map((factor) => (
                <div key={factor.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{factor.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{Math.round(factor.weight * 100)}% weight</span>
                      <Badge variant="outline" className="text-xs">{factor.normalized.toFixed(0)}/100</Badge>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${factor.normalized}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Partners */}
        {data.partners && data.partners.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Community Partners ({data.partners.length})</CardTitle>
              <CardDescription>Partners discovered near this site</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.partners.map((partner) => (
                  <div key={partner.id} className="flex items-center justify-between p-2 rounded border">
                    <div>
                      <p className="text-sm font-medium">{partner.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {partner.category}
                        {partner.distance_miles !== null && ` · ${partner.distance_miles.toFixed(1)} mi`}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {partner.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CTA */}
        <div className="text-center py-4 border-t">
          <p className="text-sm text-muted-foreground mb-2">
            Want to run your own site analysis?
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
          >
            Get Started with LKA SiteScope
          </Link>
        </div>
      </div>
    </div>
  );
}
