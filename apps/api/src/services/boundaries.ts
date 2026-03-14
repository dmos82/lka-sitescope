/**
 * TIGERweb Boundary Service
 * Fetches city (place), county, and census tract boundary GeoJSON from the
 * US Census TIGERweb ArcGIS REST API. No API key required.
 * Cached 30 days — boundaries essentially never change.
 */

const TIGERWEB_BASE =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';

// Layer IDs
const LAYER_TRACT = 8;   // Census Tracts
const LAYER_PLACE = 28;  // Incorporated Places (cities/towns)
const LAYER_COUNTY = 86; // Counties

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs = 30 * 24 * 60 * 60 * 1000): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoundaryFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: {
    name: string;
    geoid?: string;
    layer: 'place' | 'county' | 'tract';
    state?: string;
    county?: string;
    population?: number;
  };
}

export interface BoundaryResult {
  place?: BoundaryFeature | null;
  county?: BoundaryFeature | null;
  tract?: BoundaryFeature | null;
  source: 'tigerweb' | 'cache';
}

// ─── TIGERweb Query ───────────────────────────────────────────────────────────

interface TigerWebResponse {
  features?: Array<{
    attributes: Record<string, string | number>;
    geometry?: {
      rings?: number[][][];
      paths?: number[][][];
    };
  }>;
}

/**
 * Query a TIGERweb layer for a point and return the first matching feature as GeoJSON.
 */
async function queryLayer(
  layerId: number,
  lat: number,
  lng: number,
  outFields: string,
  nameField: string,
  layer: 'place' | 'county' | 'tract'
): Promise<BoundaryFeature | null> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });

  const url = `${TIGERWEB_BASE}/${layerId}/query?${params.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`TIGERweb layer ${layerId} error: ${res.status}`);

  const json = await res.json() as {
    features?: Array<{
      type: string;
      geometry: { type: string; coordinates: unknown };
      properties: Record<string, string | number>;
    }>;
  };

  if (!json.features?.length) return null;

  const feat = json.features[0];
  const props = feat.properties ?? {};

  return {
    type: 'Feature',
    geometry: feat.geometry,
    properties: {
      name: String(props[nameField] ?? props['NAME'] ?? 'Unknown'),
      geoid: String(props['GEOID'] ?? props['GEO_ID'] ?? ''),
      layer,
      state: props['STATE'] !== undefined ? String(props['STATE']) : undefined,
      county: props['COUNTY'] !== undefined ? String(props['COUNTY']) : undefined,
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch place (city), county, and census tract boundaries for a lat/lng.
 * Returns GeoJSON features for each boundary type.
 */
export async function getBoundaries(lat: number, lng: number): Promise<BoundaryResult> {
  const cacheKey = `boundaries:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = getCached<BoundaryResult>(cacheKey);
  if (cached) return { ...cached, source: 'cache' };

  const [placeRes, countyRes, tractRes] = await Promise.allSettled([
    queryLayer(LAYER_PLACE, lat, lng, 'NAME,GEOID,STATE', 'NAME', 'place'),
    queryLayer(LAYER_COUNTY, lat, lng, 'NAME,GEOID,STATE,COUNTY', 'NAME', 'county'),
    queryLayer(LAYER_TRACT, lat, lng, 'NAME,GEOID,STATE,COUNTY,TRACT', 'NAME', 'tract'),
  ]);

  const result: BoundaryResult = {
    place: placeRes.status === 'fulfilled' ? placeRes.value : null,
    county: countyRes.status === 'fulfilled' ? countyRes.value : null,
    tract: tractRes.status === 'fulfilled' ? tractRes.value : null,
    source: 'tigerweb',
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Fetch only census tract boundary (used by demographics for map overlay).
 */
export async function getTractBoundary(
  state: string,
  county: string,
  tract: string
): Promise<BoundaryFeature | null> {
  const cacheKey = `tract-boundary:${state}:${county}:${tract}`;
  const cached = getCached<BoundaryFeature>(cacheKey);
  if (cached) return cached;

  const geoid = `${state}${county}${tract}`;
  const params = new URLSearchParams({
    where: `GEOID='${geoid}'`,
    outFields: 'NAME,GEOID,STATE,COUNTY,TRACT',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });

  const url = `${TIGERWEB_BASE}/${LAYER_TRACT}/query?${params.toString()}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const json = await res.json() as {
      features?: Array<{
        type: string;
        geometry: { type: string; coordinates: unknown };
        properties: Record<string, string | number>;
      }>;
    };

    if (!json.features?.length) return null;

    const feat = json.features[0];
    const props = feat.properties ?? {};
    const result: BoundaryFeature = {
      type: 'Feature',
      geometry: feat.geometry,
      properties: {
        name: String(props['NAME'] ?? geoid),
        geoid,
        layer: 'tract',
        state,
        county,
      },
    };

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[Boundaries] Tract boundary fetch error:', err);
    return null;
  }
}
