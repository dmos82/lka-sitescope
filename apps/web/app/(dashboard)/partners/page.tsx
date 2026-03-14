'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Download, RefreshCw, AlertCircle, MapPin, Phone, StickyNote } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import type { PartnerStatus } from '@lka/shared';

interface SavedAnalysisSummary {
  id: string;
  address: string;
  score: number | null;
  letter_grade: string | null;
  created_at: string;
}

interface Partner {
  id: string;
  analysis_id: string;
  name: string;
  category: string;
  sub_type?: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  distance_miles?: number;
  relevance_score?: number;
  status: PartnerStatus;
  notes?: string;
  source?: string;
  created_at: string;
}

const STATUS_COLORS: Record<PartnerStatus, string> = {
  not_contacted: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  interested: 'bg-yellow-100 text-yellow-700',
  partnered: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<PartnerStatus, string> = {
  not_contacted: 'Not Contacted',
  contacted: 'Contacted',
  interested: 'Interested',
  partnered: 'Partnered',
  declined: 'Declined',
};

export default function PartnersPage() {
  const { token } = useAuth();
  const [analyses, setAnalyses] = useState<SavedAnalysisSummary[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Fetch saved analyses to pick from
  useEffect(() => {
    if (!token) return;
    apiFetch<SavedAnalysisSummary[]>('/api/saved', { token })
      .then((data) => {
        setAnalyses(data);
        if (data.length > 0) setSelectedAnalysisId(data[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analyses'))
      .finally(() => setLoading(false));
  }, [token]);

  const fetchPartners = useCallback(async () => {
    if (!token || !selectedAnalysisId) return;
    setPartnersLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ analysis_id: selectedAnalysisId });
      const data = await apiFetch<Partner[]>(`/api/partners?${params}`, { token });
      setPartners(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partners');
    } finally {
      setPartnersLoading(false);
    }
  }, [token, selectedAnalysisId]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  async function updatePartnerStatus(id: string, status: PartnerStatus) {
    if (!token) return;
    setUpdatingId(id);
    try {
      const updated = await apiFetch<Partner>(`/api/partners/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      });
      setPartners((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update partner');
    } finally {
      setUpdatingId(null);
    }
  }

  function handleExport() {
    if (!token || !selectedAnalysisId) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
    const url = `${apiUrl}/api/partners/export?analysis_id=${selectedAnalysisId}`;
    // Use a link with auth header via hidden anchor — since we need auth, open in new tab
    // (CSVs don't need auth if we include token as query param — but we'll use the token approach)
    window.open(`${url}&token=${token}`, '_blank');
  }

  // Status counts for selected analysis
  const statusCounts = (Object.keys(STATUS_LABELS) as PartnerStatus[]).reduce(
    (acc, s) => ({ ...acc, [s]: partners.filter((p) => p.status === s).length }),
    {} as Record<PartnerStatus, number>
  );

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partner Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            Manage community partners for franchise development
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchPartners} disabled={partnersLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${partnersLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {selectedAnalysisId && partners.length > 0 && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Analysis selector */}
      {analyses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Select Saved Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={selectedAnalysisId ?? ''}
              onChange={(e) => setSelectedAnalysisId(e.target.value)}
            >
              {analyses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.address} {a.score !== null ? `(Score: ${a.score} ${a.letter_grade})` : ''} —{' '}
                  {new Date(a.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {/* No analyses */}
      {analyses.length === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-muted-foreground">
            <Users className="h-12 w-12 mb-4 opacity-30" />
            <p>No saved analyses yet. Score a location and save it to discover partners.</p>
          </CardContent>
        </Card>
      )}

      {/* Status summary */}
      {selectedAnalysisId && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(Object.keys(STATUS_LABELS) as PartnerStatus[]).map((status) => (
              <Card key={status}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-2xl font-bold">{statusCounts[status]}</p>
                  <div className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                    {STATUS_LABELS[status]}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Partners
                {!partnersLoading && (
                  <Badge variant="secondary" className="text-xs">{partners.length} total</Badge>
                )}
              </CardTitle>
              <CardDescription>Community partners discovered for this analysis</CardDescription>
            </CardHeader>
            <CardContent>
              {partnersLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-16 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : partners.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                  <Users className="h-12 w-12 mb-4 opacity-30" />
                  <p>No partners found for this analysis.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {partners.map((partner) => (
                    <div
                      key={partner.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-sm">{partner.name}</p>
                          <Badge variant="outline" className="text-xs">{partner.category}</Badge>
                          {partner.sub_type && (
                            <span className="text-xs text-muted-foreground">{partner.sub_type}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {partner.address && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {partner.address}
                            </span>
                          )}
                          {partner.distance_miles !== undefined && (
                            <span>{partner.distance_miles.toFixed(1)} mi away</span>
                          )}
                          {partner.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {partner.phone}
                            </span>
                          )}
                          {partner.notes && (
                            <span className="flex items-center gap-1">
                              <StickyNote className="h-3 w-3" />
                              {partner.notes}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          className="h-8 rounded border border-input bg-background px-2 text-xs"
                          value={partner.status}
                          disabled={updatingId === partner.id}
                          onChange={(e) => updatePartnerStatus(partner.id, e.target.value as PartnerStatus)}
                        >
                          {(Object.keys(STATUS_LABELS) as PartnerStatus[]).map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
