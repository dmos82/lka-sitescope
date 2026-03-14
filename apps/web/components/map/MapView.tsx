'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import { useLocation } from '@/hooks/useLocation';

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

// POI category colors
const POI_COLORS: Record<string, string> = {
  school: '#3b82f6',         // blue
  library: '#22c55e',        // green
  community_center: '#f97316', // orange
  grocery: '#ef4444',        // red
  art_gallery: '#a855f7',    // purple
  museum: '#14b8a6',         // teal
};

const POI_LABELS: Record<string, string> = {
  school: 'Schools',
  library: 'Libraries',
  community_center: 'Community Centers',
  grocery: 'Grocery Stores',
  art_gallery: 'Art Galleries',
  museum: 'Museums',
};

type POICategory = 'school' | 'library' | 'community_center' | 'grocery' | 'art_gallery' | 'museum';
const POI_CATEGORIES: POICategory[] = ['school', 'library', 'community_center', 'grocery', 'art_gallery', 'museum'];

// Generate GeoJSON circle polygon for territory radius
function createCirclePolygon(lng: number, lat: number, radiusMiles: number, steps = 64) {
  const radiusMeters = radiusMiles * MILES_TO_METERS;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
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

interface BoundaryFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: { name: string; geoid?: string; layer: string };
}

interface BoundaryResult {
  place?: BoundaryFeature | null;
  county?: BoundaryFeature | null;
  tract?: BoundaryFeature | null;
  source: string;
}

interface PlaceItem {
  id: string;
  name: string;
  category: POICategory;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  lat: number;
  lng: number;
  place_id?: string;
  opening_hours?: string;
  source: string;
  distance_miles?: number;
}

interface PlacesResponse {
  total: number;
  summary: Record<string, number>;
  results: Record<POICategory, PlaceItem[]>;
  google_enabled: boolean;
}

interface LayerState {
  lkaLocations: boolean;
  territories: boolean;
  tradeArea: boolean;
  isochrones: boolean;
  cityBoundary: boolean;
  countyBoundary: boolean;
  // POI categories
  school: boolean;
  library: boolean;
  community_center: boolean;
  grocery: boolean;
  art_gallery: boolean;
  museum: boolean;
}

export default function MapView({ searchQuery, onLocationSelect }: MapViewProps) {
  const { token } = useAuth();
  const { updateTradeArea: updateLocationTradeArea, updateCityName } = useLocation();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const poiMarkers = useRef<Map<string, maplibregl.Marker[]>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const [layers, setLayers] = useState<LayerState>({
    lkaLocations: true,
    territories: true,
    tradeArea: true,
    isochrones: false,
    cityBoundary: false,
    countyBoundary: false,
    school: false,
    library: false,
    community_center: false,
    grocery: false,
    art_gallery: false,
    museum: false,
  });
  const [isochroneLoading, setIsochroneLoading] = useState(false);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [poiLoading, setPoiLoading] = useState<Partial<Record<POICategory, boolean>>>({});
  const [lkaLocations, setLkaLocations] = useState<LkaLocationData[]>([]);
  const [selectedMarkerPos, setSelectedMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [poiData, setPoiData] = useState<Partial<Record<POICategory, PlaceItem[]>>>({});
  const tradeAreaMilesRef = useRef(5);
  const [radiusSlider, setRadiusSlider] = useState(5);
  const fetchBoundariesRef = useRef<((lat: number, lng: number) => void) | null>(null);

  // Fetch LKA locations
  useEffect(() => {
    if (!token) return;
    apiFetch<LkaLocationData[]>('/api/lka-locations', { token })
      .then(setLkaLocations)
      .catch(() => {});
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

      // ── Trade area ring ──────────────────────────────────────────────────────
      m.addSource('trade-area', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'trade-area-fill',
        type: 'fill',
        source: 'trade-area',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.07 },
      });
      m.addLayer({
        id: 'trade-area-line',
        type: 'line',
        source: 'trade-area',
        paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [3, 2] },
      });

      // ── Isochrone ────────────────────────────────────────────────────────────
      m.addSource('isochrones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'isochrones-fill',
        type: 'fill',
        source: 'isochrones',
        layout: { visibility: 'none' },
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 },
      });
      m.addLayer({
        id: 'isochrones-line',
        type: 'line',
        source: 'isochrones',
        layout: { visibility: 'none' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      });

      // ── City boundary ────────────────────────────────────────────────────────
      m.addSource('city-boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'city-boundary-fill',
        type: 'fill',
        source: 'city-boundary',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.05 },
      });
      m.addLayer({
        id: 'city-boundary-line',
        type: 'line',
        source: 'city-boundary',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [4, 2] },
      });

      // ── County boundary ──────────────────────────────────────────────────────
      m.addSource('county-boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'county-boundary-fill',
        type: 'fill',
        source: 'county-boundary',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#0891b2', 'fill-opacity': 0.04 },
      });
      m.addLayer({
        id: 'county-boundary-line',
        type: 'line',
        source: 'county-boundary',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#0891b2', 'line-width': 2, 'line-dasharray': [6, 3] },
      });

      // ── LKA territories ──────────────────────────────────────────────────────
      m.addSource('territories', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      m.addLayer({
        id: 'territories-fill',
        type: 'fill',
        source: 'territories',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.08 },
      });
      m.addLayer({
        id: 'territories-line',
        type: 'line',
        source: 'territories',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      });

      // ── LKA location markers ─────────────────────────────────────────────────
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
      const features = map.current?.queryRenderedFeatures(e.point, { layers: ['lka-locations-circle'] });
      if (features && features.length > 0) return;

      const { lng, lat } = e.lngLat;
      placeMarker(lat, lng);
      setSelectedMarkerPos({ lat, lng });
      onLocationSelect?.(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      // Auto-fetch boundaries on click so city name is always detected
      fetchBoundariesRef.current?.(lat, lng);
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
    updateMapTradeArea(lng, lat, tradeAreaMilesRef.current);
  }

  function updateMapTradeArea(lng: number, lat: number, radiusMiles: number) {
    if (!map.current || !map.current.getSource('trade-area')) return;
    const circle = createTradeAreaCircle(lng, lat, radiusMiles);
    (map.current.getSource('trade-area') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [circle],
    });
  }

  function handleRadiusSliderChange(miles: number) {
    tradeAreaMilesRef.current = miles;
    setRadiusSlider(miles);
    if (selectedMarkerPos) {
      updateMapTradeArea(selectedMarkerPos.lng, selectedMarkerPos.lat, miles);
    }
    // Sync to location context so demographics page picks up the change
    updateLocationTradeArea(miles);
  }

  // ── Fetch boundaries when location selected ────────────────────────────────

  const fetchBoundaries = useCallback(async (lat: number, lng: number) => {
    if (!token || !map.current) return;
    setBoundaryLoading(true);
    try {
      const params = new URLSearchParams({ lat: lat.toString(), lng: lng.toString() });
      const result = await apiFetch<BoundaryResult>(`/api/boundaries?${params}`, { token });

      const citySource = map.current.getSource('city-boundary') as maplibregl.GeoJSONSource | undefined;
      if (citySource) {
        const features = result.place ? [result.place] : [];
        citySource.setData({ type: 'FeatureCollection', features } as Parameters<typeof citySource.setData>[0]);
      }

      const countySource = map.current.getSource('county-boundary') as maplibregl.GeoJSONSource | undefined;
      if (countySource) {
        const features = result.county ? [result.county] : [];
        countySource.setData({ type: 'FeatureCollection', features } as Parameters<typeof countySource.setData>[0]);
      }

      // Propagate city name to location context
      if (result.place?.properties.name) {
        updateCityName(result.place.properties.name);
      }
    } catch (err) {
      console.error('[MapView] Boundary fetch error:', err);
    } finally {
      setBoundaryLoading(false);
    }
  }, [token, updateCityName]);

  // Keep ref in sync with latest callback so map click handler can call it
  useEffect(() => {
    fetchBoundariesRef.current = fetchBoundaries;
  }, [fetchBoundaries]);

  // ── Fetch POIs for a category ──────────────────────────────────────────────

  const clearPoiMarkers = useCallback((category: POICategory) => {
    const existing = poiMarkers.current.get(category) ?? [];
    existing.forEach((m) => m.remove());
    poiMarkers.current.set(category, []);
  }, []);

  const fetchAndRenderPOIs = useCallback(async (lat: number, lng: number, category: POICategory) => {
    if (!token || !map.current) return;

    setPoiLoading((prev) => ({ ...prev, [category]: true }));
    clearPoiMarkers(category);

    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radius_miles: tradeAreaMilesRef.current.toString(),
        categories: category,
      });
      const result = await apiFetch<PlacesResponse>(`/api/places?${params}`, { token });
      const items = result.results[category] ?? [];

      setPoiData((prev) => ({ ...prev, [category]: items }));

      if (!map.current) return;
      const color = POI_COLORS[category] ?? '#666';
      const markers: maplibregl.Marker[] = [];

      for (const poi of items) {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 12px; height: 12px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        `;

        const popup = new maplibregl.Popup({ offset: 12, maxWidth: '260px' }).setHTML(
          `<div style="font-family:sans-serif;font-size:12px;line-height:1.5">
            <strong style="font-size:13px">${escapeHtml(poi.name)}</strong><br/>
            ${poi.address ? `<span style="color:#555">${escapeHtml(poi.address)}</span><br/>` : ''}
            ${poi.phone ? `<span style="color:#555">Tel: ${escapeHtml(poi.phone)}</span><br/>` : ''}
            ${poi.rating !== undefined ? `<span style="color:#d97706">Rating: ${poi.rating}/5</span><br/>` : ''}
            ${poi.opening_hours ? `<span style="color:#16a34a">${escapeHtml(poi.opening_hours)}</span><br/>` : ''}
            ${poi.distance_miles !== undefined ? `<span style="color:#888;font-size:11px">${poi.distance_miles.toFixed(1)} mi away</span><br/>` : ''}
            ${poi.website ? `<a href="${escapeHtml(poi.website)}" target="_blank" rel="noopener" style="color:#2563eb;font-size:11px">Website</a>` : ''}
          </div>`
        );

        const m2 = new maplibregl.Marker({ element: el })
          .setLngLat([poi.lng, poi.lat])
          .setPopup(popup)
          .addTo(map.current!);

        markers.push(m2);
      }

      poiMarkers.current.set(category, markers);
    } catch (err) {
      console.error(`[MapView] POI fetch error (${category}):`, err);
    } finally {
      setPoiLoading((prev) => ({ ...prev, [category]: false }));
    }
  }, [token, clearPoiMarkers]);

  // Update LKA locations
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

  // Toggle layer visibility (map GL layers)
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
    setVis('city-boundary-fill', layers.cityBoundary);
    setVis('city-boundary-line', layers.cityBoundary);
    setVis('county-boundary-fill', layers.countyBoundary);
    setVis('county-boundary-line', layers.countyBoundary);
  }, [layers, isReady]);

  // Handle POI layer toggles — show/hide markers
  useEffect(() => {
    for (const cat of POI_CATEGORIES) {
      const visible = layers[cat];
      const markers = poiMarkers.current.get(cat) ?? [];
      for (const m of markers) {
        const el = m.getElement();
        el.style.display = visible ? 'block' : 'none';
      }
    }
  }, [layers]);

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
          // Auto-fetch boundaries on search so city name is always detected
          fetchBoundariesRef.current?.(latNum, lngNum);
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
    const pos = selectedMarkerPos;
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };

      // Fetch isochrones when toggling on
      if (key === 'isochrones' && !prev.isochrones && pos) {
        fetchAndRenderIsochrones(pos.lat, pos.lng);
      }

      // Fetch boundary data when toggling city/county on
      if ((key === 'cityBoundary' || key === 'countyBoundary') && !prev[key] && pos) {
        fetchBoundaries(pos.lat, pos.lng);
      }

      // Fetch POI data when toggling a category on
      if (POI_CATEGORIES.includes(key as POICategory) && !prev[key as POICategory] && pos) {
        const cat = key as POICategory;
        if (!poiData[cat] || poiData[cat]!.length === 0) {
          fetchAndRenderPOIs(pos.lat, pos.lng, cat);
        } else {
          // Already fetched — just show markers
          const markers = poiMarkers.current.get(cat) ?? [];
          for (const m of markers) {
            m.getElement().style.display = 'block';
          }
        }
      }

      return next;
    });
  }

  const totalPoiCount = Object.values(poiData).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);

  return (
    <div className="relative w-full h-full" style={{ minHeight: '400px' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />

      {/* Layer control panel */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border p-3 space-y-1.5 text-sm max-h-[calc(100vh-100px)] overflow-y-auto" style={{ width: '190px' }}>
        <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">Layers</p>

        {/* Core layers */}
        {[
          { key: 'lkaLocations' as const, label: 'LKA Locations' },
          { key: 'territories' as const, label: 'Territory Radii' },
          { key: 'tradeArea' as const, label: 'Trade Area Ring' },
          { key: 'isochrones' as const, label: isochroneLoading ? 'Drive Times (loading...)' : 'Drive Times' },
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

        {/* Trade area radius slider */}
        {layers.tradeArea && (
          <div className="pl-5 space-y-1">
            <p className="text-xs text-muted-foreground">
              Radius: <span className="font-medium text-foreground">{radiusSlider} mi</span>
            </p>
            <input
              type="range"
              min={1}
              max={25}
              step={1}
              value={radiusSlider}
              onChange={(e) => handleRadiusSliderChange(Number(e.target.value))}
              className="w-full accent-primary h-1"
              style={{ width: '140px' }}
            />
          </div>
        )}

        {/* Boundary layers */}
        <div className="pt-1.5 mt-1 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Boundaries {boundaryLoading ? '(loading...)' : ''}
          </p>
          {[
            { key: 'cityBoundary' as const, label: 'City Boundary', color: '#7c3aed' },
            { key: 'countyBoundary' as const, label: 'County Boundary', color: '#0891b2' },
          ].map(({ key, label, color }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={() => toggleLayer(key)}
                disabled={!selectedMarkerPos}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="flex items-center gap-1.5 text-xs">
                <span className="h-2 w-4 inline-block rounded-sm shrink-0" style={{ background: color, opacity: 0.7 }} />
                {label}
              </span>
            </label>
          ))}
        </div>

        {/* POI layers */}
        <div className="pt-1.5 mt-1 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            POIs {totalPoiCount > 0 ? `(${totalPoiCount})` : ''}
          </p>
          {POI_CATEGORIES.map((cat) => (
            <label key={cat} className="flex items-center gap-2 cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={layers[cat]}
                onChange={() => toggleLayer(cat)}
                disabled={!selectedMarkerPos}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: POI_COLORS[cat] }}
                />
                <span className={!selectedMarkerPos ? 'text-muted-foreground/50' : ''}>
                  {POI_LABELS[cat]}
                  {poiLoading[cat] ? ' ...' : poiData[cat] ? ` (${poiData[cat]!.length})` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>

        {/* Isochrone legend */}
        {layers.isochrones && (
          <div className="pt-1.5 mt-1 border-t space-y-1">
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
          <div className="pt-1.5 mt-1 border-t space-y-1">
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
