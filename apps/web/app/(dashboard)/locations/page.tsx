'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Plus, RefreshCw, AlertCircle, X, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from '@/hooks/useLocation';
import { apiFetch } from '@/lib/api-client';
import type { LkaLocation, LocationStatus } from '@lka/shared';

const STATUS_LABELS: Record<LocationStatus, string> = {
  OPEN: 'Open',
  COMING_SOON: 'Coming Soon',
  CLOSED: 'Closed',
};

const STATUS_BADGE: Record<LocationStatus, 'default' | 'secondary' | 'destructive'> = {
  OPEN: 'default',
  COMING_SOON: 'secondary',
  CLOSED: 'destructive',
};

interface NearbyLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  status: LocationStatus;
  distance_miles: number;
}

export default function LocationsPage() {
  const { token, user } = useAuth();
  const { location } = useLocation();

  const [locations, setLocations] = useState<LkaLocation[]>([]);
  const [nearby, setNearby] = useState<NearbyLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Add form state (admin only)
  const [addForm, setAddForm] = useState({
    name: '',
    address: '',
    lat: '',
    lng: '',
    country: 'US',
    status: 'OPEN',
    territory_radius_miles: '15',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  const fetchLocations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LkaLocation[]>('/api/lka-locations', { token });
      setLocations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchNearby = useCallback(async () => {
    if (!token || !location) return;
    setNearbyLoading(true);
    try {
      const params = new URLSearchParams({
        lat: location.lat.toString(),
        lng: location.lng.toString(),
        radius_miles: '30',
      });
      const data = await apiFetch<NearbyLocation[]>(`/api/lka-locations/nearby?${params}`, { token });
      setNearby(data);
    } catch {
      // Non-critical — don't show error
    } finally {
      setNearbyLoading(false);
    }
  }, [token, location]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    if (location) fetchNearby();
  }, [location?.lat, location?.lng]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setAddLoading(true);
    setAddError(null);
    setAddSuccess(false);
    try {
      const body = {
        name: addForm.name,
        address: addForm.address,
        lat: parseFloat(addForm.lat),
        lng: parseFloat(addForm.lng),
        country: addForm.country,
        status: addForm.status,
        territory_radius_miles: parseFloat(addForm.territory_radius_miles),
      };
      const created = await apiFetch<LkaLocation>('/api/lka-locations', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      });
      setLocations((prev) => [...prev, created]);
      setAddSuccess(true);
      setAddForm({ name: '', address: '', lat: '', lng: '', country: 'US', status: 'OPEN', territory_radius_miles: '15' });
      setTimeout(() => { setShowAdd(false); setAddSuccess(false); }, 1500);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add location');
    } finally {
      setAddLoading(false);
    }
  }

  const isAdmin = user?.role === 'admin';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LKA Locations</h1>
          <p className="text-muted-foreground mt-1">
            Existing franchise locations and territory management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLocations} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {isAdmin && (
            <Button onClick={() => setShowAdd(!showAdd)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
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

      {/* Add Form (admin only) */}
      {showAdd && isAdmin && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Add New Location</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowAdd(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input
                    required
                    placeholder="LKA Naperville"
                    value={addForm.name}
                    onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Address *</Label>
                  <Input
                    required
                    placeholder="123 Main St, Naperville, IL 60540"
                    value={addForm.address}
                    onChange={(e) => setAddForm((p) => ({ ...p, address: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Latitude *</Label>
                  <Input
                    required
                    type="number"
                    step="any"
                    placeholder="41.7508"
                    value={addForm.lat}
                    onChange={(e) => setAddForm((p) => ({ ...p, lat: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Longitude *</Label>
                  <Input
                    required
                    type="number"
                    step="any"
                    placeholder="-88.1535"
                    value={addForm.lng}
                    onChange={(e) => setAddForm((p) => ({ ...p, lng: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Country</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={addForm.country}
                    onChange={(e) => setAddForm((p) => ({ ...p, country: e.target.value }))}
                  >
                    <option value="US">US</option>
                    <option value="CA">CA</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={addForm.status}
                    onChange={(e) => setAddForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="OPEN">Open</option>
                    <option value="COMING_SOON">Coming Soon</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Territory Radius (miles)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={addForm.territory_radius_miles}
                    onChange={(e) => setAddForm((p) => ({ ...p, territory_radius_miles: e.target.value }))}
                  />
                </div>
              </div>

              {addError && (
                <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {addError}
                </div>
              )}

              {addSuccess && (
                <div className="flex items-center gap-2 p-2 rounded bg-green-50 text-green-700 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  Location added successfully!
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={addLoading}>
                  {addLoading ? 'Adding...' : 'Add Location'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Nearby alert (if location is selected) */}
      {location && nearby.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Territory Conflict Warning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-yellow-700 mb-2">
              {nearby.length} existing location{nearby.length > 1 ? 's' : ''} found within 30 miles of your selected site:
            </p>
            <div className="space-y-1">
              {nearby.map((loc) => (
                <div key={loc.id} className="flex items-center gap-2 text-sm text-yellow-800">
                  <MapPin className="h-3 w-3" />
                  <span className="font-medium">{loc.name}</span>
                  <span className="text-yellow-600">— {loc.distance_miles.toFixed(1)} mi away</span>
                  <Badge variant={STATUS_BADGE[loc.status]} className="text-xs">
                    {STATUS_LABELS[loc.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Locations list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Franchise Locations
            {!loading && (
              <Badge variant="secondary" className="text-xs">
                {locations.length} total
              </Badge>
            )}
          </CardTitle>
          <CardDescription>All LKA franchise locations with territory radii</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : locations.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <MapPin className="h-12 w-12 mb-4 opacity-30" />
              <p>No LKA locations found. {isAdmin && 'Add the first location above.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {locations.map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">{loc.address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {loc.country}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {loc.territory_radius_miles} mi radius
                    </span>
                    <Badge variant={STATUS_BADGE[loc.status]}>
                      {STATUS_LABELS[loc.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
