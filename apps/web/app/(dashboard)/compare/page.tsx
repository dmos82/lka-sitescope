'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GitCompare, MapPin, AlertCircle, Search, Star, BarChart2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import type { DemographicResult, ScoringResult } from '@lka/shared';

interface SiteData {
  address: string;
  lat: number;
  lng: number;
  country: 'US' | 'CA';
  demographics: DemographicResult | null;
  scoring: ScoringResult | null;
  loading: boolean;
  error: string | null;
}

interface SitePanelProps {
  label: string;
  data: SiteData;
  onChange: (address: string) => void;
  onLoad: () => void;
}

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

function CompareBar({ valueA, valueB, max }: { valueA: number; valueB: number; max: number }) {
  const pctA = Math.min(100, (valueA / max) * 100);
  const pctB = Math.min(100, (valueB / max) * 100);
  const winnerA = valueA >= valueB;
  return (
    <div className="space-y-1">
      <div className="flex gap-1 items-center">
        <div className={`h-2.5 rounded-l-full transition-all ${winnerA ? 'bg-green-500' : 'bg-blue-400'}`} style={{ width: `${pctA}%`, minWidth: pctA > 0 ? '2px' : 0 }} />
        <span className="text-xs font-mono w-12 text-right shrink-0">{formatNumber(valueA)}</span>
      </div>
      <div className="flex gap-1 items-center">
        <div className={`h-2.5 rounded-l-full transition-all ${!winnerA ? 'bg-green-500' : 'bg-blue-400'}`} style={{ width: `${pctB}%`, minWidth: pctB > 0 ? '2px' : 0 }} />
        <span className="text-xs font-mono w-12 text-right shrink-0">{formatNumber(valueB)}</span>
      </div>
    </div>
  );
}

const DEFAULT_SITE: Omit<SiteData, 'address' | 'lat' | 'lng' | 'country'> = {
  demographics: null,
  scoring: null,
  loading: false,
  error: null,
};

export default function ComparePage() {
  const { token } = useAuth();

  const [addressA, setAddressA] = useState('');
  const [addressB, setAddressB] = useState('');
  const [siteA, setSiteA] = useState<SiteData | null>(null);
  const [siteB, setSiteB] = useState<SiteData | null>(null);

  const geocodeAndLoad = useCallback(
    async (address: string, site: 'A' | 'B') => {
      if (!address.trim() || !token) return;

      const setSite = site === 'A' ? setSiteA : setSiteB;

      // Geocode
      setSite({
        address,
        lat: 0,
        lng: 0,
        country: 'US',
        demographics: null,
        scoring: null,
        loading: true,
        error: null,
      });

      try {
        // Geocode via Nominatim
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const geoData: Array<{ lat: string; lon: string; display_name: string }> = await geoRes.json();

        if (!geoData.length) {
          setSite((prev) => prev ? { ...prev, loading: false, error: 'Address not found' } : null);
          return;
        }

        const lat = parseFloat(geoData[0].lat);
        const lng = parseFloat(geoData[0].lon);
        const resolvedAddress = geoData[0].display_name;
        const country: 'US' | 'CA' =
          lat >= 42 && lat <= 83 && lng >= -141 && lng <= -52 && lat > 49 ? 'CA' : 'US';

        setSite({ address: resolvedAddress, lat, lng, country, demographics: null, scoring: null, loading: true, error: null });

        // Fetch demographics
        const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString(), trade_area_miles: '5' });
        const demo = await apiFetch<DemographicResult>(`/api/demographics?${params}`, { token });

        setSite((prev) => prev ? { ...prev, demographics: demo } : null);
      } catch (err) {
        setSite((prev) =>
          prev ? { ...prev, loading: false, error: err instanceof Error ? err.message : 'Failed to load' } : null
        );
        return;
      } finally {
        setSite((prev) => prev ? { ...prev, loading: false } : null);
      }
    },
    [token]
  );

  const hasData = siteA && siteB && siteA.demographics && siteB.demographics;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitCompare className="h-6 w-6" />
          Compare Sites
        </h1>
        <p className="text-muted-foreground mt-1">Side-by-side demographic comparison of two locations</p>
      </div>

      {/* Address inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge className="text-xs bg-blue-600">Site A</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="123 Main St, Chicago, IL"
                value={addressA}
                onChange={(e) => setAddressA(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && geocodeAndLoad(addressA, 'A')}
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => geocodeAndLoad(addressA, 'A')}
                disabled={siteA?.loading}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {siteA && !siteA.loading && !siteA.error && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {siteA.address}
              </p>
            )}
            {siteA?.error && (
              <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {siteA.error}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge className="text-xs bg-green-600">Site B</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="456 Oak Ave, Naperville, IL"
                value={addressB}
                onChange={(e) => setAddressB(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && geocodeAndLoad(addressB, 'B')}
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => geocodeAndLoad(addressB, 'B')}
                disabled={siteB?.loading}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {siteB && !siteB.loading && !siteB.error && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {siteB.address}
              </p>
            )}
            {siteB?.error && (
              <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {siteB.error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Loading state */}
      {(siteA?.loading || siteB?.loading) && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full mr-3" />
          Loading demographic data...
        </div>
      )}

      {/* Comparison table */}
      {hasData && !siteA.loading && !siteB.loading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5" />
              Demographic Comparison
            </CardTitle>
            <CardDescription>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> Site A
              </span>
              {' vs '}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-green-400 inline-block" /> Site B
              </span>
              {' — green bar = winner'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Headers */}
              <div className="grid grid-cols-[1fr_200px_200px] gap-4 text-sm font-medium border-b pb-2">
                <span>Metric</span>
                <span className="text-center text-blue-600">Site A</span>
                <span className="text-center text-green-600">Site B</span>
              </div>

              {[
                {
                  label: 'Median Household Income',
                  a: siteA.demographics!.median_household_income,
                  b: siteB.demographics!.median_household_income,
                  format: (v?: number) => formatCurrency(v, siteA.country === 'CA' ? 'CAD' : 'USD'),
                },
                {
                  label: 'Households Above Threshold',
                  a: siteA.demographics!.households_above_threshold,
                  b: siteB.demographics!.households_above_threshold,
                  format: formatNumber,
                },
                {
                  label: 'Total Population',
                  a: siteA.demographics!.population,
                  b: siteB.demographics!.population,
                  format: formatNumber,
                },
                {
                  label: 'Total Households',
                  a: siteA.demographics!.households,
                  b: siteB.demographics!.households,
                  format: formatNumber,
                },
                {
                  label: '% Households w/ Children',
                  a: siteA.demographics!.pct_with_children,
                  b: siteB.demographics!.pct_with_children,
                  format: (v?: number) => v !== undefined && v !== null ? `${v.toFixed(1)}%` : '—',
                },
                {
                  label: '% College Educated',
                  a: siteA.demographics!.pct_college_educated,
                  b: siteB.demographics!.pct_college_educated,
                  format: (v?: number) => v !== undefined && v !== null ? `${v.toFixed(1)}%` : '—',
                },
                {
                  label: 'Population Growth (5yr)',
                  a: siteA.demographics!.pop_growth_rate,
                  b: siteB.demographics!.pop_growth_rate,
                  format: (v?: number) => v !== undefined && v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—',
                },
                {
                  label: 'Median Home Value',
                  a: siteA.demographics!.median_home_value,
                  b: siteB.demographics!.median_home_value,
                  format: (v?: number) => formatCurrency(v, siteA.country === 'CA' ? 'CAD' : 'USD'),
                },
              ].map((row) => {
                const aVal = row.a ?? 0;
                const bVal = row.b ?? 0;
                const aWins = aVal >= bVal;
                return (
                  <div key={row.label} className="grid grid-cols-[1fr_200px_200px] gap-4 items-center">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <div className={`text-center font-semibold text-sm ${aWins && aVal > 0 ? 'text-green-700' : ''}`}>
                      {row.format(row.a)}
                    </div>
                    <div className={`text-center font-semibold text-sm ${!aWins && bVal > 0 ? 'text-green-700' : ''}`}>
                      {row.format(row.b)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!hasData && !siteA?.loading && !siteB?.loading && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <GitCompare className="h-12 w-12 mb-4 opacity-30" />
          <p className="font-medium">Enter two addresses above to compare sites</p>
          <p className="text-sm mt-1">Press Enter or click the search button to load demographic data</p>
        </div>
      )}
    </div>
  );
}
