'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Trash2, Share2, MapPin, Star, RefreshCw, AlertCircle, Copy, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';

interface SavedAnalysisSummary {
  id: string;
  address: string;
  lat: number;
  lng: number;
  country: string;
  score: number | null;
  letter_grade: string | null;
  trade_area_miles: number;
  share_token: string | null;
  created_at: string;
}

interface ShareInfo {
  share_token: string;
  url: string;
}

function gradeColor(grade: string | null): string {
  if (!grade) return 'bg-muted text-muted-foreground';
  if (grade.startsWith('A')) return 'bg-green-100 text-green-800';
  if (grade.startsWith('B')) return 'bg-blue-100 text-blue-800';
  if (grade.startsWith('C')) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

export default function SavedPage() {
  const { token } = useAuth();
  const [analyses, setAnalyses] = useState<SavedAnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<Record<string, ShareInfo>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SavedAnalysisSummary[]>('/api/saved', { token });
      setAnalyses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved analyses');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  async function handleDelete(id: string) {
    if (!token || !confirm('Delete this saved analysis?')) return;
    setDeletingId(id);
    try {
      await apiFetch(`/api/saved/${id}`, { method: 'DELETE', token });
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleShare(id: string) {
    if (!token) return;
    if (shareInfo[id]) {
      // Already fetched — copy URL
      copyToClipboard(id, shareInfo[id].url);
      return;
    }
    try {
      const info = await apiFetch<ShareInfo>(`/api/saved/${id}/share`, { token });
      setShareInfo((prev) => ({ ...prev, [id]: info }));
      copyToClipboard(id, info.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share link failed');
    }
  }

  function copyToClipboard(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Saved Analyses</h1>
          <p className="text-muted-foreground mt-1">Your saved site evaluations</p>
        </div>
        <Button variant="outline" onClick={fetchAnalyses} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-5 bg-muted rounded animate-pulse mb-2 w-2/3" />
                <div className="h-4 bg-muted/60 rounded animate-pulse w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && analyses.length === 0 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mb-4 opacity-30" />
            <p className="font-medium">No saved analyses yet</p>
            <p className="text-sm mt-1">Score a location and save it to see it here.</p>
          </CardContent>
        </Card>
      )}

      {!loading && analyses.length > 0 && (
        <div className="space-y-3">
          {analyses.map((analysis) => (
            <Card key={analysis.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="font-medium text-sm truncate">{analysis.address}</p>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {analysis.country}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{analysis.trade_area_miles}-mile trade area</span>
                      <span>•</span>
                      <span>{new Date(analysis.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {analysis.score !== null && (
                      <div className={`px-3 py-1.5 rounded-md text-center ${gradeColor(analysis.letter_grade)}`}>
                        <div className="text-xl font-bold">{analysis.score}</div>
                        <div className="text-xs font-medium">{analysis.letter_grade}</div>
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleShare(analysis.id)}
                      title="Copy share link"
                    >
                      {copiedId === analysis.id ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Share2 className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(analysis.id)}
                      disabled={deletingId === analysis.id}
                      className="text-destructive hover:text-destructive"
                      title="Delete analysis"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
