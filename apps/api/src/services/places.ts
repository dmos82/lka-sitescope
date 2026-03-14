/**
 * Google Places Service (New API) with Overpass fallback
 * Caches 7 days per category+location — Google charges per request.
 */

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? '';
const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1/places:searchNearby';

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

function setCache(key: string, data: unknown, ttlMs = 7 * 24 * 60 * 60 * 1000): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaceItem {
  id: string;
  name: string;
  category: 'school' | 'library' | 'community_center' | 'grocery' | 'art_gallery' | 'museum';
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  lat: number;
  lng: number;
  place_id?: string;
  types?: string[];
  opening_hours?: string;
  source: 'google' | 'overpass';
  distance_miles?: number;
}

export type PlaceCategory =
  | 'school'
  | 'library'
  | 'community_center'
  | 'grocery'
  | 'art_gallery'
  | 'museum';

// Google Places (New) includedTypes per category
const GOOGLE_TYPES: Record<PlaceCategory, string[]> = {
  school: ['school', 'primary_school', 'secondary_school', 'preschool'],
  library: ['library'],
  community_center: ['community_center', 'recreation_center'],
  grocery: ['supermarket', 'grocery_store'],
  art_gallery: ['art_gallery'],
  museum: ['museum'],
};

// Overpass tags per category (fallback)
const OVERPASS_TAGS: Record<PlaceCategory, string[]> = {
  school: [
    'node[amenity=school]', 'way[amenity=school]',
    'node[amenity=kindergarten]', 'way[amenity=kindergarten]',
  ],
  library: ['node[amenity=library]', 'way[amenity=library]'],
  community_center: [
    'node[amenity=community_centre]', 'way[amenity=community_centre]',
    'node[leisure=recreation_centre]',
  ],
  grocery: [
    'node[shop=supermarket]', 'way[shop=supermarket]',
    'node[shop=grocery]', 'way[shop=grocery]',
  ],
  art_gallery: ['node[tourism=gallery]', 'way[tourism=gallery]'],
  museum: ['node[tourism=museum]', 'way[tourism=museum]'],
};

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Google Places Fetch ──────────────────────────────────────────────────────

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  currentOpeningHours?: { openNow?: boolean };
}

interface GooglePlacesResponse {
  places?: GooglePlace[];
}

async function fetchGooglePlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  category: PlaceCategory
): Promise<PlaceItem[]> {
  const types = GOOGLE_TYPES[category];
  const body = {
    includedTypes: types,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
  };

  const res = await fetch(GOOGLE_PLACES_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.nationalPhoneNumber',
        'places.websiteUri',
        'places.rating',
        'places.location',
        'places.types',
        'places.currentOpeningHours',
      ].join(','),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Google Places API error: ${res.status}`);

  const json = await res.json() as GooglePlacesResponse;
  const places = json.places ?? [];

  return places
    .filter((p) => p.location?.latitude !== undefined && p.displayName?.text)
    .map((p): PlaceItem => {
      const pLat = p.location!.latitude!;
      const pLng = p.location!.longitude!;
      const hours = p.currentOpeningHours?.openNow !== undefined
        ? (p.currentOpeningHours.openNow ? 'Open now' : 'Closed now')
        : undefined;
      return {
        id: `google:${p.id ?? Math.random().toString(36).slice(2)}`,
        name: p.displayName!.text!,
        category,
        address: p.formattedAddress,
        phone: p.nationalPhoneNumber,
        website: p.websiteUri,
        rating: p.rating,
        lat: pLat,
        lng: pLng,
        place_id: p.id,
        types: p.types,
        opening_hours: hours,
        source: 'google',
        distance_miles: parseFloat(haversineMiles(lat, lng, pLat, pLng).toFixed(2)),
      };
    });
}

// ─── Overpass Fallback ────────────────────────────────────────────────────────

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function fetchOverpassFallback(
  lat: number,
  lng: number,
  radiusMeters: number,
  category: PlaceCategory
): Promise<PlaceItem[]> {
  const tags = OVERPASS_TAGS[category];
  const queryBody = tags.map((t) => `${t}(around:${radiusMeters},${lat},${lng});`).join('\n');
  const overpassQuery = `[out:json][timeout:30];\n(\n${queryBody}\n);\nout center;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(overpassQuery)}`,
    signal: AbortSignal.timeout(35000),
  });

  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);

  const json = await res.json() as { elements: OverpassElement[] };
  const seen = new Set<string>();
  const results: PlaceItem[] = [];

  for (const el of json.elements ?? []) {
    const pLat = el.lat ?? el.center?.lat;
    const pLng = el.lon ?? el.center?.lon;
    if (pLat === undefined || pLng === undefined) continue;

    const id = `overpass:${el.type}:${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const tags = el.tags ?? {};
    const name = tags.name;
    if (!name) continue;

    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
      .filter(Boolean)
      .join(' ');

    results.push({
      id,
      name,
      category,
      address: address || undefined,
      lat: pLat,
      lng: pLng,
      source: 'overpass',
      distance_miles: parseFloat(haversineMiles(lat, lng, pLat, pLng).toFixed(2)),
    });
  }

  return results;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface PlacesResult {
  source: 'google' | 'overpass' | 'cache';
  category: PlaceCategory;
  count: number;
  results: PlaceItem[];
}

/**
 * Fetch POIs for a single category. Uses Google Places if API key is set,
 * falls back to Overpass/OSM.
 */
export async function fetchPlacesByCategory(
  lat: number,
  lng: number,
  radiusMiles: number,
  category: PlaceCategory
): Promise<PlacesResult> {
  const radiusMeters = Math.round(radiusMiles * 1609.344);
  const cacheKey = `places:${category}:${lat.toFixed(3)},${lng.toFixed(3)}:${radiusMiles}`;

  const cached = getCached<PlacesResult>(cacheKey);
  if (cached) {
    return { ...cached, source: 'cache' };
  }

  let results: PlaceItem[] = [];
  let source: 'google' | 'overpass' = 'overpass';

  if (GOOGLE_API_KEY) {
    try {
      results = await fetchGooglePlaces(lat, lng, radiusMeters, category);
      source = 'google';
    } catch (err) {
      console.warn(`[Places] Google API failed for ${category}, falling back to Overpass:`, err);
      results = await fetchOverpassFallback(lat, lng, radiusMeters, category);
    }
  } else {
    results = await fetchOverpassFallback(lat, lng, radiusMeters, category);
  }

  results.sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0));

  const out: PlacesResult = { source, category, count: results.length, results };
  setCache(cacheKey, out);
  return out;
}

/**
 * Fetch POIs across multiple (or all) categories.
 */
export async function fetchAllPlaces(
  lat: number,
  lng: number,
  radiusMiles: number,
  categories: PlaceCategory[] = ['school', 'library', 'community_center', 'grocery', 'art_gallery', 'museum']
): Promise<Record<PlaceCategory, PlaceItem[]>> {
  const settled = await Promise.allSettled(
    categories.map((cat) => fetchPlacesByCategory(lat, lng, radiusMiles, cat))
  );

  const out: Partial<Record<PlaceCategory, PlaceItem[]>> = {};
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const res = settled[i];
    out[cat] = res.status === 'fulfilled' ? res.value.results : [];
  }
  return out as Record<PlaceCategory, PlaceItem[]>;
}
