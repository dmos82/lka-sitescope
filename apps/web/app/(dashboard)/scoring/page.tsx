'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Star, MapPin, ChevronRight, AlertCircle, Save, CheckSquare, Zap,
} from 'lucide-react';
import { useLocation } from '@/hooks/useLocation';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import { SCORING_WEIGHTS } from '@lka/shared';
import type { ScoringResult, ScoringFactor } from '@lka/shared';

const FACTOR_LABELS: Record<string, string> = {
  target_households: 'Target Households',
  competitor_landscape: 'Competitor Landscape',
  school_quality: 'School Quality & Montessori',
  population_growth: 'Population Growth Trend',
  community_density: 'Community & Partner Density',
  commercial_real_estate: 'Commercial Real Estate',
};

function gradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A') return 'text-green-600';
  if (grade === 'A-' || grade === 'B+' || grade === 'B') return 'text-blue-600';
  if (grade === 'B-' || grade === 'C+' || grade === 'C') return 'text-yellow-600';
  return 'text-red-600';
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface ScoringInputState {
  target_households_count: string;
  competitor_score: string;
  school_quality_score: string;
  population_growth_pct: string;
  community_poi_count: string;
  commercial_real_estate_ok: boolean;
}

interface POIResult {
  id: string;
  name: string;
  type: string;
  category: string;
  lat: number;
  lng: number;
  distance_miles?: number;
}

interface POIResponse {
  source: string;
  count: number;
  results: POIResult[];
}

// New Google Places response shape
interface PlaceItem {
  id: string;
  name: string;
  category: string;
  distance_miles?: number;
}

interface PlacesResponse {
  total: number;
  summary: Record<string, number>;
  results: Record<string, PlaceItem[]>;
  google_enabled: boolean;
}

export default function ScoringPage() {
  const { location } = useLocation();
  const { token } = useAuth();
  const router = useRouter();

  const [inputs, setInputs] = useState<ScoringInputState>({
    target_households_count: '1500',
    competitor_score: '70',
    school_quality_score: '5',
    population_growth_pct: '3',
    community_poi_count: '8',
    commercial_real_estate_ok: true,
  });

  const [result, setResult] = useState<ScoringResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [nearbyPOIs, setNearbyPOIs] = useState<POIResult[]>([]);
  const [autoFillSummary, setAutoFillSummary] = useState<string | null>(null);

  // Auto-fill from demographics when location changes
  useEffect(() => {
    if (!location) return;
    // Reset result when location changes
    setResult(null);
    setSaveSuccess(false);
  }, [location?.lat, location?.lng]);

  const handleAutoFill = useCallback(async () => {
    if (!location || !token) return;
    setAutoFilling(true);
    setError(null);
    setAutoFillSummary(null);

    try {
      // Fetch from Google Places (new endpoint) + demographics concurrently
      const placesParams = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lng.toString(),
        radius_miles: location.trade_area_miles.toString(),
      });

      const demoParams = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lng.toString(),
        trade_area_miles: location.trade_area_miles.toString(),
      });

      const [placesResult, demo] = await Promise.allSettled([
        apiFetch<PlacesResponse>(`/api/places?${placesParams}`, { token }),
        apiFetch<{ pop_growth_rate?: number; households_above_threshold?: number; children_3_17?: number }>(
          `/api/demographics?${demoParams}`,
          { token }
        ),
      ]);

      let schoolCount = 0;
      let communityCount = 0;
      let competitorCount = 0;
      let dataSource = 'OpenStreetMap';

      if (placesResult.status === 'fulfilled') {
        const places = placesResult.value;
        dataSource = places.google_enabled ? 'Google Places' : 'OpenStreetMap';

        schoolCount = places.summary['school'] ?? 0;
        communityCount =
          (places.summary['library'] ?? 0) +
          (places.summary['community_center'] ?? 0) +
          (places.summary['art_gallery'] ?? 0) +
          (places.summary['museum'] ?? 0);
        // Competitors: we still use old /api/poi for competitor types (Montessori, Kumon, etc.)
      } else {
        // Fallback to legacy Overpass endpoint
        const legacyParams = new URLSearchParams({
          lat: location.lat.toString(),
          lng: location.lng.toString(),
          radius_miles: location.trade_area_miles.toString(),
          type: 'all',
        });
        try {
          const poi = await apiFetch<POIResponse>(`/api/poi?${legacyParams}`, { token });
          setNearbyPOIs(poi.results);
          schoolCount = poi.results.filter((p) => p.type === 'school').length;
          communityCount = poi.results.filter((p) => p.type === 'community').length;
          competitorCount = poi.results.filter((p) => p.type === 'competitor').length;
          dataSource = 'OpenStreetMap';
        } catch (_legacyErr) {
          // Ignore
        }
      }

      // Also fetch competitor counts from legacy route (has Montessori/Kumon classification)
      if (competitorCount === 0) {
        try {
          const compParams = new URLSearchParams({
            lat: location.lat.toString(),
            lng: location.lng.toString(),
            radius_miles: location.trade_area_miles.toString(),
            type: 'competitors',
          });
          const compPoi = await apiFetch<POIResponse>(`/api/poi?${compParams}`, { token });
          competitorCount = compPoi.results.filter((p) => p.type === 'competitor').length;
        } catch (_err) {
          // Ignore
        }
      }

      // School quality: base on count * 1pt per school (benchmark 0-50)
      const schoolScore = Math.min(50, schoolCount);
      // Community: count of community venues (benchmark 0-30)
      const communityScore = Math.min(30, communityCount);
      // Competitor score: fewer = higher (0 competitors = 100, each -15)
      const competitorScore = Math.max(0, 100 - competitorCount * 15);

      const demoData = demo.status === 'fulfilled' ? demo.value : null;

      setInputs((prev) => ({
        ...prev,
        school_quality_score: schoolScore.toString(),
        community_poi_count: communityScore.toString(),
        competitor_score: competitorScore.toString(),
        population_growth_pct: demoData?.pop_growth_rate?.toFixed(1) ?? prev.population_growth_pct,
        target_households_count: demoData?.households_above_threshold?.toString() ?? prev.target_households_count,
      }));

      setAutoFillSummary(
        `Based on ${schoolCount} schools, ${competitorCount} competitors, ${communityCount} community venues within ${location.trade_area_miles} mi (via ${dataSource})`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-fill failed');
    } finally {
      setAutoFilling(false);
    }
  }, [location, token]);

  const handleScore = useCallback(async () => {
    if (!location || !token) return;
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const body = {
        lat: location.lat,
        lng: location.lng,
        trade_area_miles: location.trade_area_miles,
        income_threshold: location.income_threshold,
        country: location.country,
        factors: {
          target_households_count: parseFloat(inputs.target_households_count) || 0,
          competitor_score: parseFloat(inputs.competitor_score) || 0,
          school_quality_score: parseFloat(inputs.school_quality_score) || 0,
          population_growth_pct: parseFloat(inputs.population_growth_pct) || 0,
          community_poi_count: parseFloat(inputs.community_poi_count) || 0,
          commercial_real_estate_ok: inputs.commercial_real_estate_ok,
        },
      };
      const scored = await apiFetch<ScoringResult>('/api/score', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      });
      setResult(scored);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scoring failed');
    } finally {
      setLoading(false);
    }
  }, [location, token, inputs]);

  async function handleSave() {
    if (!location || !token || !result) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/saved', {
        method: 'POST',
        token,
        body: JSON.stringify({
          address: location.address,
          lat: location.lat,
          lng: location.lng,
          score: result.score,
          letter_grade: result.grade,
          score_breakdown: result,
          income_threshold: location.income_threshold,
          trade_area_miles: location.trade_area_miles,
        }),
      });
      setSaveSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save analysis');
    } finally {
      setSaving(false);
    }
  }

  function updateInput(key: keyof ScoringInputState, value: string | boolean) {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setResult(null);
    setSaveSuccess(false);
  }

  if (!location) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center">
        <Star className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Location Selected</h2>
        <p className="text-muted-foreground mb-4">Select a location on the map before scoring.</p>
        <Button onClick={() => router.push('/map')}>
          Open Map
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Site Eligibility Score</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate max-w-[400px]">{location.address}</span>
            <Badge variant="outline" className="text-xs">{location.country}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleAutoFill}
            disabled={autoFilling}
            className="flex items-center gap-2"
            title="Auto-fill from POI data and demographics"
          >
            <Zap className={`h-4 w-4 ${autoFilling ? 'animate-pulse' : ''}`} />
            {autoFilling ? 'Loading...' : 'Auto-fill'}
          </Button>
          {result && (
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving || saveSuccess}
              className="flex items-center gap-2"
            >
              {saveSuccess ? (
                <>
                  <CheckSquare className="h-4 w-4 text-green-600" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save'}
                </>
              )}
            </Button>
          )}
          <Button onClick={handleScore} disabled={loading} className="flex items-center gap-2">
            <Star className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Scoring...' : 'Score Location'}
          </Button>
        </div>
      </div>

      {/* Score result */}
      {result && (
        <Card className="border-2 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="text-center">
                <div className={`text-8xl font-bold ${gradeColor(result.grade)}`}>{result.score}</div>
                <div className={`text-3xl font-bold mt-1 ${gradeColor(result.grade)}`}>{result.grade}</div>
                <p className="text-sm text-muted-foreground mt-1">out of 100</p>
              </div>
              <div className="flex-1 w-full">
                <ScoreBar value={result.score} />
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                  <div><div className="font-medium text-red-500">0–49</div><div>Not Eligible</div></div>
                  <div><div className="font-medium text-yellow-500">50–69</div><div>Conditional</div></div>
                  <div><div className="font-medium text-green-500">70–100</div><div>Eligible</div></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {autoFillSummary && !error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-blue-50 text-blue-700 text-sm border border-blue-100">
          <Zap className="h-4 w-4 shrink-0" />
          {autoFillSummary}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Factor Inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Factor Inputs</CardTitle>
            <CardDescription>
              Click "Auto-fill" to populate from real POI and demographic data, or enter manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Target Households (above income threshold)</Label>
              <Input
                type="number"
                min="0"
                value={inputs.target_households_count}
                onChange={(e) => updateInput('target_households_count', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Benchmark: 0–8,000</p>
            </div>

            <div className="space-y-1.5">
              <Label>Competitor Score (0–100, higher = fewer competitors)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={inputs.competitor_score}
                onChange={(e) => updateInput('competitor_score', e.target.value)}
              />
              {nearbyPOIs.filter((p) => p.type === 'competitor').length > 0 && (
                <p className="text-xs text-blue-600">
                  {nearbyPOIs.filter((p) => p.type === 'competitor').length} competitors found nearby
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>School Quality Score</Label>
              <Input
                type="number"
                min="0"
                value={inputs.school_quality_score}
                onChange={(e) => updateInput('school_quality_score', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Montessori = 3pts, Private/Preschool = 2pts, Public = 1pt. Benchmark: 0–50
              </p>
              {nearbyPOIs.filter((p) => p.type === 'school').length > 0 && (
                <p className="text-xs text-blue-600">
                  {nearbyPOIs.filter((p) => p.type === 'school').length} schools found nearby
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Population Growth % (5-year)</Label>
              <Input
                type="number"
                step="0.1"
                value={inputs.population_growth_pct}
                onChange={(e) => updateInput('population_growth_pct', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Benchmark: -5% to +10%</p>
            </div>

            <div className="space-y-1.5">
              <Label>Community POI Count</Label>
              <Input
                type="number"
                min="0"
                value={inputs.community_poi_count}
                onChange={(e) => updateInput('community_poi_count', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Libraries, community centers, parks. Benchmark: 0–30</p>
              {nearbyPOIs.filter((p) => p.type === 'community').length > 0 && (
                <p className="text-xs text-blue-600">
                  {nearbyPOIs.filter((p) => p.type === 'community').length} community POIs found nearby
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="re-ok"
                checked={inputs.commercial_real_estate_ok}
                onChange={(e) => updateInput('commercial_real_estate_ok', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="re-ok">
                Commercial real estate is acceptable (unchecked caps score at 60)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Factor Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scoring Factors</CardTitle>
            <CardDescription>Weighted breakdown of the eligibility score</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result
              ? result.factors.map((factor: ScoringFactor) => (
                  <div key={factor.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{factor.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          {Math.round(factor.weight * 100)}%
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {factor.normalized.toFixed(0)}/100
                        </Badge>
                      </div>
                    </div>
                    <ScoreBar value={factor.normalized} />
                    <p className="text-xs text-muted-foreground">
                      Contribution: {factor.weightedScore.toFixed(1)} pts
                    </p>
                  </div>
                ))
              : Object.entries(SCORING_WEIGHTS).map(([key, weight]) => (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{FACTOR_LABELS[key] ?? key}</span>
                      <span className="text-muted-foreground text-xs">
                        {Math.round(weight * 100)}% weight
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full">
                      <div
                        className="h-full bg-primary/20 rounded-full"
                        style={{ width: `${weight * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
          </CardContent>
        </Card>
      </div>

      {/* Nearby POIs table */}
      {nearbyPOIs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nearby Points of Interest</CardTitle>
            <CardDescription>
              {nearbyPOIs.length} POIs found within {location.trade_area_miles} miles (via OpenStreetMap)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {nearbyPOIs.slice(0, 50).map((poi) => (
                <div key={poi.id} className="flex items-center justify-between py-1.5 text-sm border-b last:border-0">
                  <div>
                    <span className="font-medium">{poi.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{poi.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        poi.type === 'school' ? 'border-blue-300 text-blue-700' :
                        poi.type === 'community' ? 'border-green-300 text-green-700' :
                        'border-red-300 text-red-700'
                      }`}
                    >
                      {poi.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {poi.distance_miles?.toFixed(1)} mi
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
