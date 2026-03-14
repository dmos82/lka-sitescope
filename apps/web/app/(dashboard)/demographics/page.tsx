'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart2, MapPin, RefreshCw, ChevronRight, AlertCircle, Users, School, BookOpen, Building2, ShoppingCart, Palette, Landmark } from 'lucide-react';
import { useLocation } from '@/hooks/useLocation';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import type { DemographicResult } from '@lka/shared';

type DemoLevel = 'place' | 'radius' | 'tract';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaceItem {
  id: string;
  name: string;
  category: string;
  address?: string;
  distance_miles?: number;
}

interface PlacesResponse {
  total: number;
  summary: Record<string, number>;
  results: Record<string, PlaceItem[]>;
  google_enabled: boolean;
}

interface BoundaryResult {
  place?: { properties: { name: string } } | null;
  county?: { properties: { name: string } } | null;
  source: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(value?: number, currency = 'USD'): string {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value?: number): string {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function formatPct(value?: number): string {
  if (value === undefined || value === null) return '—';
  return `${value.toFixed(1)}%`;
}

// ─── POI category config ──────────────────────────────────────────────────────

const POI_CATEGORIES = [
  { key: 'school', label: 'Schools', icon: School, color: '#3b82f6' },
  { key: 'library', label: 'Libraries', icon: BookOpen, color: '#22c55e' },
  { key: 'community_center', label: 'Community Centers', icon: Building2, color: '#f97316' },
  { key: 'grocery', label: 'Grocery Stores', icon: ShoppingCart, color: '#ef4444' },
  { key: 'art_gallery', label: 'Art Galleries', icon: Palette, color: '#a855f7' },
  { key: 'museum', label: 'Museums', icon: Landmark, color: '#14b8a6' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemographicsPage() {
  const { location, updateTradeArea, updateIncomeThreshold } = useLocation();
  const { token } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DemographicResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradeAreaInput, setTradeAreaInput] = useState('5');
  const [incomeInput, setIncomeInput] = useState('125000');
  const [demoLevel, setDemoLevel] = useState<DemoLevel>('place');
  const [radiusMiles, setRadiusMiles] = useState(5);

  const [poiData, setPoiData] = useState<PlacesResponse | null>(null);
  const [poiLoading, setPoiLoading] = useState(false);

  const [boundaryData, setBoundaryData] = useState<BoundaryResult | null>(null);

  const fetchDemographics = useCallback(async (overrideLevel?: DemoLevel, overrideRadius?: number) => {
    if (!location || !token) return;
    setLoading(true);
    setError(null);
    try {
      const level = overrideLevel ?? demoLevel;
      const radius = overrideRadius ?? radiusMiles;
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lng.toString(),
        trade_area_miles: location.trade_area_miles.toString(),
        income_threshold: location.income_threshold.toString(),
        level,
      });
      if (level === 'radius') {
        params.set('radius_miles', radius.toString());
      }
      const result = await apiFetch<DemographicResult>(`/api/demographics?${params}`, { token });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demographics');
    } finally {
      setLoading(false);
    }
  }, [location, token, demoLevel, radiusMiles]);

  const fetchPOIs = useCallback(async () => {
    if (!location || !token) return;
    setPoiLoading(true);
    try {
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lng.toString(),
        radius_miles: location.trade_area_miles.toString(),
      });
      const result = await apiFetch<PlacesResponse>(`/api/places?${params}`, { token });
      setPoiData(result);
    } catch (_err) {
      // POI data is non-critical — silently fail
    } finally {
      setPoiLoading(false);
    }
  }, [location, token]);

  const fetchBoundaries = useCallback(async () => {
    if (!location || !token || location.country === 'CA') return;
    try {
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lng.toString(),
      });
      const result = await apiFetch<BoundaryResult>(`/api/boundaries?${params}`, { token });
      setBoundaryData(result);
    } catch (_err) {
      // Non-critical
    }
  }, [location, token]);

  // Feature 1: Auto-set level to 'place' when city boundary click mode is active
  useEffect(() => {
    if (!location) return;
    if (location.mode === 'city' && demoLevel !== 'place') {
      setDemoLevel('place');
    }
  }, [location?.mode]);

  // Auto-fetch when location changes
  useEffect(() => {
    if (location) {
      setTradeAreaInput(location.trade_area_miles.toString());
      setIncomeInput(location.income_threshold.toString());
      setData(null);
      setPoiData(null);
      setBoundaryData(null);
      fetchDemographics();
      fetchPOIs();
      fetchBoundaries();
    }
  }, [location?.lat, location?.lng]);

  function handleApplySettings() {
    const miles = parseFloat(tradeAreaInput);
    const threshold = parseFloat(incomeInput);
    if (!isNaN(miles) && miles > 0) updateTradeArea(miles);
    if (!isNaN(threshold) && threshold > 0) updateIncomeThreshold(threshold);
    fetchDemographics();
    fetchPOIs();
  }

  function handleLevelChange(level: DemoLevel) {
    setDemoLevel(level);
    setData(null);
    fetchDemographics(level, radiusMiles);
  }

  function handleRadiusChange(miles: number) {
    setRadiusMiles(miles);
    if (demoLevel === 'radius') {
      setData(null);
      fetchDemographics('radius', miles);
    }
  }

  const currency = location?.country === 'CA' ? 'CAD' : 'USD';

  if (!location) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full text-center">
        <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Location Selected</h2>
        <p className="text-muted-foreground mb-4">
          Go to the map, click a location, and then return here to view demographics.
        </p>
        <Button onClick={() => router.push('/map')}>
          Open Map
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    );
  }

  // Compute the active level label for display
  const activeLevelLabel = (() => {
    if (demoLevel === 'place') {
      const placeName = data?.place_name ?? boundaryData?.place?.properties.name ?? location?.city_name;
      return placeName ? `Showing demographics for ${placeName}` : 'Showing city/town demographics';
    }
    if (demoLevel === 'radius') {
      const cityCtx = location?.city_name;
      return cityCtx
        ? `Showing demographics within ${radiusMiles} mi of ${cityCtx}`
        : `Showing demographics within ${radiusMiles} mi radius`;
    }
    if (demoLevel === 'tract' && data?.tract_geoid) return `Showing demographics for Census Tract ${data.tract_geoid}`;
    return 'Showing census tract demographics';
  })();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Demographics Dashboard</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate max-w-[400px]">{location.address}</span>
            <Badge variant="outline" className="text-xs">{location.country}</Badge>
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">{activeLevelLabel}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => { fetchDemographics(); fetchPOIs(); fetchBoundaries(); }}
          disabled={loading}
          className="flex items-center gap-2"
          title="Re-fetch demographics data from the Census API"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Feature 1: City boundary mode indicator */}
      {location.mode === 'city' && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-sm">
          <span className="h-2 w-2 rounded-full bg-purple-600 shrink-0" />
          City Boundary mode active — demographics aggregated at the city/town level.
        </div>
      )}

      {/* Level selector (US only) */}
      {location.country === 'US' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Geography Level</CardTitle>
            <CardDescription>Choose the area to aggregate demographics over</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {([
                { value: 'place' as DemoLevel, label: 'City / Town', tooltip: 'Aggregate demographics for the entire city or town containing your selected point' },
                { value: 'radius' as DemoLevel, label: 'Trade Area Radius', tooltip: 'Aggregate demographics across all census tracts within the specified radius' },
                { value: 'tract' as DemoLevel, label: 'Census Tract', tooltip: 'Show demographics for the single census tract directly under your selected point (most granular, can be misleading)' },
              ] as { value: DemoLevel; label: string; tooltip: string }[]).map(({ value, label, tooltip }) => (
                <Button
                  key={value}
                  variant={demoLevel === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleLevelChange(value)}
                  disabled={loading}
                  title={tooltip}
                >
                  {label}
                </Button>
              ))}
            </div>
            {demoLevel === 'radius' && (
              <div className="space-y-1.5">
                <Label htmlFor="radius-slider">
                  Radius: <span className="font-semibold">{radiusMiles} miles</span>
                </Label>
                <input
                  id="radius-slider"
                  type="range"
                  min={1}
                  max={25}
                  step={1}
                  value={radiusMiles}
                  onChange={(e) => handleRadiusChange(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 mi</span>
                  <span>25 mi</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Analysis Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="trade-area">Trade Area (miles)</Label>
              <Input
                id="trade-area"
                type="number"
                min="1"
                max="50"
                value={tradeAreaInput}
                onChange={(e) => setTradeAreaInput(e.target.value)}
                className="w-32"
                title="Radius in miles for trade area analysis — affects demographic aggregation and POI search"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="income">Income Threshold ({currency})</Label>
              <Input
                id="income"
                type="number"
                min="0"
                step="5000"
                value={incomeInput}
                onChange={(e) => setIncomeInput(e.target.value)}
                className="w-40"
                title="Minimum household income threshold — used to calculate what percentage of households are above this level"
              />
            </div>
            <Button onClick={handleApplySettings} disabled={loading} title="Refresh demographics with updated settings">
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-8 bg-muted rounded animate-pulse mb-2" />
                <div className="h-4 bg-muted/60 rounded animate-pulse w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Data */}
      {!loading && data && (
        <>
          {/* Core metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card title="Median annual household income from US Census ACS 5-year estimates">
              <CardHeader className="pb-2">
                <CardDescription>Median Household Income</CardDescription>
                <CardTitle className="text-3xl">
                  {formatCurrency(data.median_household_income, currency)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Threshold: {formatCurrency(location.income_threshold, currency)}
                  {data.median_household_income &&
                    data.median_household_income >= location.income_threshold && (
                      <Badge variant="secondary" className="ml-2 text-xs">Above threshold</Badge>
                    )}
                </p>
              </CardContent>
            </Card>

            <Card title="Number and percentage of households earning above your income threshold">
              <CardHeader className="pb-2">
                <CardDescription>Households Above Threshold</CardDescription>
                <CardTitle className="text-3xl">
                  {formatNumber(data.households_above_threshold)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {formatPct(data.pct_above_threshold)} of {formatNumber(data.households)} total households
                </p>
              </CardContent>
            </Card>

            <Card title="Total population within the selected geography">
              <CardHeader className="pb-2">
                <CardDescription>Total Population</CardDescription>
                <CardTitle className="text-3xl">{formatNumber(data.population)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Within {location.trade_area_miles}-mile trade area
                </p>
              </CardContent>
            </Card>

            {/* Children 3-17 card */}
            <Card className="border-blue-100" title="Children in the LKA target age range (3-17 years) — key metric for franchise viability">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  Children Ages 3–17
                </CardDescription>
                <CardTitle className="text-3xl text-blue-700">
                  {formatNumber(data.children_3_17)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {formatPct(data.pct_children_3_17)} of total population
                  {data.children_3_17 !== undefined && data.children_3_17 > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-2 text-xs border-blue-200 text-blue-700"
                    >
                      Target age group
                    </Badge>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card title="Percentage of households with at least one child under 18">
              <CardHeader className="pb-2">
                <CardDescription>Households w/ Children</CardDescription>
                <CardTitle className="text-3xl">
                  {formatPct(data.pct_with_children)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Of total population under 18</p>
              </CardContent>
            </Card>

            <Card title="Percentage of adults with a bachelor's degree or higher">
              <CardHeader className="pb-2">
                <CardDescription>College Educated</CardDescription>
                <CardTitle className="text-3xl">
                  {formatPct(data.pct_college_educated)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Bachelor's degree or higher</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Population Growth</CardDescription>
                <CardTitle className="text-3xl">
                  {data.pop_growth_rate !== undefined
                    ? `${data.pop_growth_rate > 0 ? '+' : ''}${data.pop_growth_rate.toFixed(1)}%`
                    : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">5-year trend</p>
              </CardContent>
            </Card>
          </div>

          {/* Additional indicators */}
          {data.median_home_value && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="h-4 w-4" />
                  Additional Indicators
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Median Home Value</p>
                    <p className="font-semibold">{formatCurrency(data.median_home_value, currency)}</p>
                  </div>
                  {data.tract_geoid && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Census Tract</p>
                      <p className="font-mono text-sm">{data.tract_geoid}</p>
                    </div>
                  )}
                  {data.source && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Data Source</p>
                      <p className="text-sm">{data.source}</p>
                    </div>
                  )}
                  {data.fetched_at && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                      <p className="text-sm">{new Date(data.fetched_at).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* POI Summary */}
          {(poiLoading || poiData) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Nearby Points of Interest
                  {poiLoading && <span className="text-xs text-muted-foreground font-normal">(loading...)</span>}
                  {poiData && !poiLoading && (
                    <Badge variant="secondary" className="text-xs">
                      {poiData.total} total within {location.trade_area_miles} mi
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {poiData?.google_enabled ? 'Via Google Places' : 'Via OpenStreetMap'} — select categories on the map to see markers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {poiLoading && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {POI_CATEGORIES.map((cat) => (
                      <div key={cat.key} className="h-16 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                )}
                {poiData && !poiLoading && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {POI_CATEGORIES.map((cat) => {
                      const count = poiData.summary[cat.key] ?? 0;
                      const Icon = cat.icon;
                      return (
                        <div
                          key={cat.key}
                          className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                        >
                          <div
                            className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${cat.color}20` }}
                          >
                            <Icon className="h-4 w-4" style={{ color: cat.color }} />
                          </div>
                          <div>
                            <p className="text-lg font-bold leading-none">{count}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{cat.label}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* CTA to scoring */}
          <div className="flex justify-end">
            <Button onClick={() => router.push('/scoring')}>
              Score This Location
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
