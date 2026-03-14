'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart2, MapPin, RefreshCw, ChevronRight, AlertCircle } from 'lucide-react';
import { useLocation } from '@/hooks/useLocation';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import type { DemographicResult } from '@lka/shared';

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

export default function DemographicsPage() {
  const { location, updateTradeArea, updateIncomeThreshold } = useLocation();
  const { token } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DemographicResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradeAreaInput, setTradeAreaInput] = useState('5');
  const [incomeInput, setIncomeInput] = useState('125000');

  const fetchDemographics = useCallback(async () => {
    if (!location || !token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lng.toString(),
        trade_area_miles: location.trade_area_miles.toString(),
        income_threshold: location.income_threshold.toString(),
      });
      const result = await apiFetch<DemographicResult>(`/api/demographics?${params}`, { token });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demographics');
    } finally {
      setLoading(false);
    }
  }, [location, token]);

  // Auto-fetch when location changes
  useEffect(() => {
    if (location) {
      setTradeAreaInput(location.trade_area_miles.toString());
      setIncomeInput(location.income_threshold.toString());
      fetchDemographics();
    }
  }, [location?.lat, location?.lng]);

  function handleApplySettings() {
    const miles = parseFloat(tradeAreaInput);
    const threshold = parseFloat(incomeInput);
    if (!isNaN(miles) && miles > 0) updateTradeArea(miles);
    if (!isNaN(threshold) && threshold > 0) updateIncomeThreshold(threshold);
    fetchDemographics();
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Demographics Dashboard</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate max-w-[400px]">{location.address}</span>
            <Badge variant="outline" className="text-xs">
              {location.country}
            </Badge>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchDemographics}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

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
              />
            </div>
            <Button onClick={handleApplySettings} disabled={loading}>
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
          {Array.from({ length: 6 }).map((_, i) => (
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
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

            <Card>
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

            <Card>
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

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Households w/ Children</CardDescription>
                <CardTitle className="text-3xl">
                  {formatPct(data.pct_with_children)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Of total households</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>College Educated</CardDescription>
                <CardTitle className="text-3xl">
                  {formatPct(data.pct_college_educated)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Bachelor's degree or higher
                </p>
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

          {/* Median Home Value */}
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
