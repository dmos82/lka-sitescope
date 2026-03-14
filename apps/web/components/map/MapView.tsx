'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';

interface LkaLocationData {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  status: 'OPEN' | 'COMING_SOON' | 'CLOSED';
  territory_radius_miles: number;
  country: string;
}

interface MapViewProps {
  searchQuery?: string;
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#ef4444',       // red
  COMING_SOON: '#eab308', // yellow
  CLOSED: '#6b7280',     // gray
};

const MILES_TO_METERS = 1609.344;

// Generate GeoJSON circle polygon for territory radius
function createCirclePolygon(lng: number, lat: number, radiusMiles: number, steps = 64) {
  const radiusMeters = radiusMiles * MILES_TO_METERS;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    // Convert meters to degrees (approximate)
    const dLat = dy / 111320;
    const dLng = dx / (111320 * Math.cos((lat * Math.PI) / 180));
    coords.push([lng + dLng, lat + dLat]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coords],
    },
  };
}

// Create trade area circle GeoJSON
function createTradeAreaCircle(lng: number, lat: number, radiusMiles: number) {
  return createCirclePolygon(lng, lat, radiusMiles, 128);
}

interface IsochroneGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { value: number; label: string; color: string };
    geometry: { type: string; coordinates: unknown };
  }>;
}

interface IsochroneResponse {
  source: string;
  geojson: IsochroneGeoJSON;
  note?: string;
}

interface LayerState {
  lkaLocations: boolean;
  territories: boolean;
  tradeArea: boolean;
  isochrones: boolean;
}

export default function MapView({ searchQuery, onLocationSelect }: MapViewProps) {
  const { token } = useAuth();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [layers, setLayers] = useState<LayerState>({
    lkaLocations: true,
    territories: true,
    tradeArea: true,
    isochrones: false,
  });
  const [isochroneLoading, setIsochroneLoading] = useState(false);
  const [lkaLocations, setLkaLocations] = useState<LkaLocationData[]>([]);
  const [selectedMarkerPos, setSelectedMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const tradeAreaMilesRef = useRef(5);

  // Fetch LKA locations
  useEffect(() => {
    if (!token) return;
    apiFetch<LkaLocationData[]>('/api/lka-locations', { token })
      .then(setLkaLocations)
      .catch(() => {}); // Non-critical
  }, [token]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-98.5, 39.5],
      zoom: 4,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'top-right'
    );

    map.current.on('load', () => {
      const m = map.current!;

      // ── Trade area ring source ──────────────────────────────────────────────
      m.addSource('trade-area', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'trade-area-fill',
        type: 'fill',
        source: 'trade-area',
        paint: {
          'fill-color': '#2563eb',
          'fill-opacity': 0.07,
        },
      });
      m.addLayer({
        id: 'trade-area-line',
        type: 'line',
        source: 'trade-area',
        paint: {
          'line-color': '#2563eb',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });

      // ── Isochrone source ────────────────────────────────────────────────────
      m.addSource('isochrones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'isochrones-fill',
        type: 'fill',
        source: 'isochrones',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.15,
        },
      });
      m.addLayer({
        id: 'isochrones-line',
        type: 'line',
        source: 'isochrones',
        layout: { visibility: 'none' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
        },
      });

      // ── LKA territory circles source ────────────────────────────────────────
      m.addSource('territories', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'territories-fill',
        type: 'fill',
        source: 'territories',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.08,
        },
      });
      m.addLayer({
        id: 'territories-line',
        type: 'line',
        source: 'territories',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
        },
      });

      // ── LKA location markers source ─────────────────────────────────────────
      m.addSource('lka-locations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'lka-locations-circle',
        type: 'circle',
        source: 'lka-locations',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Popup on LKA location click
      m.on('click', 'lka-locations-circle', (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties as {
          name: string;
          address: string;
          status: string;
          territory_radius_miles: number;
        };
        const coords = (e.features[0].geometry as { type: 'Point'; coordinates: [number, number] })
          .coordinates;

        new maplibregl.Popup({ offset: 10 })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family:sans-serif;font-size:13px;min-width:180px">
              <strong>${props.name}</strong><br/>
              <span style="color:#666">${props.address}</span><br/>
              <span style="margin-top:4px;display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;background:${STATUS_COLORS[props.status] ?? '#999'};color:#fff">${props.status.replace('_', ' ')}</span><br/>
              <span style="color:#888;font-size:11px">${props.territory_radius_miles} mi territory</span>
            </div>`
          )
          .addTo(m);
      });

      m.on('mouseenter', 'lka-locations-circle', () => {
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', 'lka-locations-circle', () => {
        m.getCanvas().style.cursor = '';
      });

      setIsReady(true);
    });

    // Click to place marker
    map.current.on('click', (e) => {
      // Don't intercept clicks on LKA location circles
      const features = map.current?.queryRenderedFeatures(e.point, { layers: ['lka-locations-circle'] });
      if (features && features.length > 0) return;

      const { lng, lat } = e.lngLat;
      placeMarker(lat, lng);
      setSelectedMarkerPos({ lat, lng });
      onLocationSelect?.(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  function placeMarker(lat: number, lng: number) {
    if (!map.current) return;
    marker.current?.remove();
    marker.current = new maplibregl.Marker({ color: '#2563eb' })
      .setLngLat([lng, lat])
      .addTo(map.current);
    map.current.flyTo({ center: [lng, lat], zoom: 12, duration: 1000 });

    // Update trade area ring
    updateTradeArea(lng, lat, tradeAreaMilesRef.current);
  }

  function updateTradeArea(lng: number, lat: number, radiusMiles: number) {
    if (!map.current || !map.current.getSource('trade-area')) return;
    const circle = createTradeAreaCircle(lng, lat, radiusMiles);
    (map.current.getSource('trade-area') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [circle],
    });
  }

  // Update LKA locations on map when data loaded + layers change
  useEffect(() => {
    if (!isReady || !map.current) return;

    const locationFeatures = lkaLocations.map((loc) => ({
      type: 'Feature' as const,
      properties: {
        id: loc.id,
        name: loc.name,
        address: loc.address,
        status: loc.status,
        territory_radius_miles: loc.territory_radius_miles,
        color: STATUS_COLORS[loc.status] ?? '#999',
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [loc.lng, loc.lat],
      },
    }));

    const territoryFeatures = lkaLocations.map((loc) => {
      const circle = createCirclePolygon(loc.lng, loc.lat, loc.territory_radius_miles);
      return {
        ...circle,
        properties: {
          color: STATUS_COLORS[loc.status] ?? '#999',
          status: loc.status,
        },
      };
    });

    const lkaSource = map.current.getSource('lka-locations') as maplibregl.GeoJSONSource | undefined;
    if (lkaSource) {
      lkaSource.setData({ type: 'FeatureCollection', features: locationFeatures });
    }

    const terrSource = map.current.getSource('territories') as maplibregl.GeoJSONSource | undefined;
    if (terrSource) {
      terrSource.setData({ type: 'FeatureCollection', features: territoryFeatures });
    }
  }, [lkaLocations, isReady]);

  // Toggle layer visibility
  useEffect(() => {
    if (!isReady || !map.current) return;
    const m = map.current;

    const setVis = (layerId: string, visible: boolean) => {
      if (m.getLayer(layerId)) {
        m.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };

    setVis('lka-locations-circle', layers.lkaLocations);
    setVis('territories-fill', layers.territories);
    setVis('territories-line', layers.territories);
    setVis('trade-area-fill', layers.tradeArea);
    setVis('trade-area-line', layers.tradeArea);
    setVis('isochrones-fill', layers.isochrones);
    setVis('isochrones-line', layers.isochrones);
  }, [layers, isReady]);

  // Handle search query
  useEffect(() => {
    if (!searchQuery || !isReady) return;

    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
      .then((r) => r.json())
      .then((results: Array<{ lat: string; lon: string; display_name: string }>) => {
        if (results.length > 0) {
          const { lat, lon, display_name } = results[0];
          const latNum = parseFloat(lat);
          const lngNum = parseFloat(lon);
          placeMarker(latNum, lngNum);
          setSelectedMarkerPos({ lat: latNum, lng: lngNum });
          onLocationSelect?.(latNum, lngNum, display_name);
        }
      })
      .catch(console.error);
  }, [searchQuery, isReady]);

  async function fetchAndRenderIsochrones(lat: number, lng: number) {
    if (!map.current || !token) return;
    setIsochroneLoading(true);
    try {
      const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString() });
      const response = await apiFetch<IsochroneResponse>(`/api/isochrone?${params}`, { token });
      const isoSource = map.current.getSource('isochrones') as maplibregl.GeoJSONSource | undefined;
      if (isoSource && response.geojson) {
        isoSource.setData(response.geojson as Parameters<typeof isoSource.setData>[0]);
      }
    } catch (err) {
      console.error('[MapView] Isochrone fetch error:', err);
    } finally {
      setIsochroneLoading(false);
    }
  }

  function toggleLayer(key: keyof LayerState) {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Fetch isochrones when toggling on
      if (key === 'isochrones' && !prev.isochrones && selectedMarkerPos) {
        fetchAndRenderIsochrones(selectedMarkerPos.lat, selectedMarkerPos.lng);
      }
      return next;
    });
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: '400px' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />

      {/* Layer control panel */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border p-3 space-y-2 text-sm">
        <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">Layers</p>
        {[
          { key: 'lkaLocations' as const, label: 'LKA Locations' },
          { key: 'territories' as const, label: 'Territory Radii' },
          { key: 'tradeArea' as const, label: 'Trade Area Ring' },
          { key: 'isochrones' as const, label: isochroneLoading ? 'Drive Times (loading...)' : 'Drive Times (10/15/20 min)' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={() => toggleLayer(key)}
              disabled={key === 'isochrones' && !selectedMarkerPos}
              className="h-3.5 w-3.5 rounded"
            />
            <span className={`text-xs ${key === 'isochrones' && !selectedMarkerPos ? 'text-muted-foreground/50' : ''}`}>
              {label}
            </span>
          </label>
        ))}

        {/* Isochrone legend */}
        {layers.isochrones && (
          <div className="pt-2 mt-1 border-t space-y-1">
            {[
              { color: '#22c55e', label: '10 min drive' },
              { color: '#eab308', label: '15 min drive' },
              { color: '#f97316', label: '20 min drive' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* LKA status legend */}
        {layers.lkaLocations && lkaLocations.length > 0 && (
          <div className="pt-2 mt-2 border-t space-y-1">
            {[
              { status: 'OPEN', label: 'Open' },
              { status: 'COMING_SOON', label: 'Coming Soon' },
              { status: 'CLOSED', label: 'Closed' },
            ].map(({ status, label }) => (
              <div key={status} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
