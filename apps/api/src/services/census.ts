import type { DemographicResult } from '@lka/shared';

const CENSUS_BASE = 'https://api.census.gov/data/2022/acs/acs5';
const CENSUS_API_KEY = process.env.CENSUS_API_KEY ?? '';

// TIGERweb for tract/place lookup
const TIGERWEB_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';

// TIGERweb layer IDs
const LAYER_TRACT = 8;
const LAYER_PLACE = 28;

// In-memory session cache (simple TTL)
const sessionCache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = sessionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  sessionCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

interface TractInfo {
  state: string;
  county: string;
  tract: string;
  geoid: string;
}

interface PlaceInfo {
  state: string;
  placeId: string; // Census Place FIPS (without state prefix)
  geoid: string;   // Full 7-digit GEOID (state + place)
  name: string;
}

/**
 * Find census tracts that intersect a point using TIGERweb
 */
export async function findTractAtPoint(lat: number, lng: number): Promise<TractInfo | null> {
  const cacheKey = `tract:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = getCached<TractInfo>(cacheKey);
  if (cached) return cached;

  try {
    const url =
      `${TIGERWEB_BASE}/8/query?` +
      `geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&outFields=STATE,COUNTY,TRACT,GEOID&returnGeometry=false&f=json`;

    const res = await fetch(url);
    const json = await res.json() as {
      features?: Array<{ attributes: { STATE: string; COUNTY: string; TRACT: string; GEOID: string } }>;
    };

    if (!json.features?.length) return null;

    const attrs = json.features[0].attributes;
    const tract: TractInfo = {
      state: attrs.STATE,
      county: attrs.COUNTY,
      tract: attrs.TRACT,
      geoid: attrs.GEOID,
    };

    setCache(cacheKey, tract, 24 * 60 * 60 * 1000); // 24h
    return tract;
  } catch (err) {
    console.error('[Census] TIGERweb error:', err);
    return null;
  }
}

interface ACSVariables {
  B19001_001E: number; // Total households
  B19001_014E: number; // $100K-$124K
  B19001_015E: number; // $125K-$149K
  B19001_016E: number; // $150K-$199K
  B19001_017E: number; // $200K+
  B19013_001E: number; // Median household income
  B09001_001E: number; // Population under 18
  B09001_003E: number; // Children 3-4 years
  B09001_004E: number; // Children 5 years
  B09001_005E: number; // Children 6-8 years
  B09001_006E: number; // Children 9-11 years
  B09001_007E: number; // Children 12-14 years
  B09001_008E: number; // Children 15-17 years
  B25077_001E: number; // Median home value
  B15003_022E: number; // Bachelor's degree
  B15003_023E: number; // Master's degree
  B15003_024E: number; // Professional degree
  B15003_025E: number; // Doctorate
  B15003_001E: number; // Total pop 25+
  B01003_001E: number; // Total population
}

const ACS_VARS = [
  'B19001_001E', 'B19001_014E', 'B19001_015E', 'B19001_016E', 'B19001_017E',
  'B19013_001E',
  'B09001_001E', 'B09001_003E', 'B09001_004E', 'B09001_005E',
  'B09001_006E', 'B09001_007E', 'B09001_008E',
  'B25077_001E',
  'B15003_001E', 'B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E',
  'B01003_001E',
].join(',');

/**
 * Fetch ACS data for a specific census tract
 */
export async function fetchTractACS(tract: TractInfo): Promise<ACSVariables | null> {
  const cacheKey = `acs:${tract.geoid}`;
  const cached = getCached<ACSVariables>(cacheKey);
  if (cached) return cached;

  try {
    const url =
      `${CENSUS_BASE}?get=NAME,${ACS_VARS}` +
      `&for=tract:${tract.tract}&in=state:${tract.state}+county:${tract.county}` +
      (CENSUS_API_KEY ? `&key=${CENSUS_API_KEY}` : '');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Census API ${res.status}`);

    const rows = await res.json() as string[][];
    if (rows.length < 2) return null;

    const headers = rows[0];
    const values = rows[1];

    const data: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      data[headers[i]] = parseFloat(values[i]) || 0;
    }

    const result = data as unknown as ACSVariables;
    setCache(cacheKey, result, 90 * 24 * 60 * 60 * 1000); // 90 days
    return result;
  } catch (err) {
    console.error('[Census] ACS fetch error:', err);
    return null;
  }
}

/**
 * Get demographic result for a point (single census tract)
 */
export async function getDemographicsForLocation(
  lat: number,
  lng: number,
  incomeThreshold: number = 125000
): Promise<DemographicResult | null> {
  const tract = await findTractAtPoint(lat, lng);
  if (!tract) return null;

  const acs = await fetchTractACS(tract);
  if (!acs) return null;

  const totalHouseholds = acs.B19001_001E || 1;
  const highIncomeHouseholds =
    acs.B19001_014E + acs.B19001_015E + acs.B19001_016E + acs.B19001_017E;

  const collegePop =
    acs.B15003_022E + acs.B15003_023E + acs.B15003_024E + acs.B15003_025E;
  const totalAdults = acs.B15003_001E || 1;

  // Children 3-17 (B09001_003E through B09001_008E)
  const children3_17 =
    acs.B09001_003E + acs.B09001_004E + acs.B09001_005E +
    acs.B09001_006E + acs.B09001_007E + acs.B09001_008E;
  const totalPop = acs.B01003_001E || 1;

  return {
    tract_geoid: tract.geoid,
    median_household_income: acs.B19013_001E,
    population: acs.B01003_001E,
    households: totalHouseholds,
    households_above_threshold: highIncomeHouseholds,
    pct_above_threshold: (highIncomeHouseholds / totalHouseholds) * 100,
    median_home_value: acs.B25077_001E,
    pct_with_children: (acs.B09001_001E / totalPop) * 100,
    pct_college_educated: (collegePop / totalAdults) * 100,
    children_3_17: children3_17,
    pct_children_3_17: (children3_17 / totalPop) * 100,
    source: 'Census ACS 2022',
    fetched_at: new Date().toISOString(),
  };
}

// ─── ACS place-level variables (subset — place ACS doesn't have all tract vars) ──

const PLACE_ACS_VARS = [
  'NAME',
  'B19013_001E', // Median household income
  'B25077_001E', // Median home value
  'B01003_001E', // Total population
  'B11001_001E', // Total households
  'B25003_002E', // Owner-occupied units
  'B09001_001E', // Population under 18
  'B09001_003E', 'B09001_004E', 'B09001_005E',
  'B09001_006E', 'B09001_007E', 'B09001_008E',
  'B11003_001E', // Family households
].join(',');

/**
 * Find the Census Place (city/town) FIPS for a lat/lng using TIGERweb layer 28.
 */
async function findPlaceAtPoint(lat: number, lng: number): Promise<PlaceInfo | null> {
  const cacheKey = `place:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = getCached<PlaceInfo>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'NAME,GEOID,STATE',
      returnGeometry: 'false',
      f: 'json',
    });

    const url = `${TIGERWEB_BASE}/${LAYER_PLACE}/query?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`TIGERweb place error: ${res.status}`);

    const json = await res.json() as {
      features?: Array<{
        attributes: { NAME: string; GEOID: string; STATE: string };
      }>;
    };

    if (!json.features?.length) return null;

    const attrs = json.features[0].attributes;
    const geoid = attrs.GEOID; // e.g. "0680000" (state+place, 7 chars)
    const state = attrs.STATE;   // e.g. "06"
    // Place FIPS = geoid without the leading state code
    const placeId = geoid.length > 2 ? geoid.slice(2) : geoid;

    const info: PlaceInfo = {
      state,
      placeId,
      geoid,
      name: attrs.NAME,
    };

    setCache(cacheKey, info, 24 * 60 * 60 * 1000);
    return info;
  } catch (err) {
    console.error('[Census] TIGERweb place error:', err);
    return null;
  }
}

/**
 * Convert raw ACS row values to a DemographicResult.
 * Works for both tract-level and place-level ACS data.
 */
function buildDemographicResult(
  data: Record<string, number>,
  opts: {
    tractGeoid?: string;
    placeGeoid?: string;
    placeName?: string;
    incomeThreshold?: number;
  }
): DemographicResult {
  const incomeThreshold = opts.incomeThreshold ?? 125000;

  const totalHouseholds = data['B11001_001E'] || data['B19001_001E'] || 1;
  // High-income households: use bracket counts if available, else fallback to 0
  const highIncomeHouseholds =
    (data['B19001_014E'] ?? 0) +
    (data['B19001_015E'] ?? 0) +
    (data['B19001_016E'] ?? 0) +
    (data['B19001_017E'] ?? 0);

  const collegePop =
    (data['B15003_022E'] ?? 0) +
    (data['B15003_023E'] ?? 0) +
    (data['B15003_024E'] ?? 0) +
    (data['B15003_025E'] ?? 0);
  const totalAdults = data['B15003_001E'] || 1;

  const children3_17 =
    (data['B09001_003E'] ?? 0) +
    (data['B09001_004E'] ?? 0) +
    (data['B09001_005E'] ?? 0) +
    (data['B09001_006E'] ?? 0) +
    (data['B09001_007E'] ?? 0) +
    (data['B09001_008E'] ?? 0);
  const under18 = data['B09001_001E'] ?? 0;
  const totalPop = data['B01003_001E'] || 1;

  return {
    tract_geoid: opts.tractGeoid,
    place_geoid: opts.placeGeoid,
    place_name: opts.placeName,
    median_household_income: data['B19013_001E'] || undefined,
    population: data['B01003_001E'] || undefined,
    households: totalHouseholds,
    households_above_threshold: highIncomeHouseholds || undefined,
    pct_above_threshold: highIncomeHouseholds
      ? (highIncomeHouseholds / totalHouseholds) * 100
      : undefined,
    median_home_value: data['B25077_001E'] || undefined,
    pct_with_children: (under18 / totalPop) * 100,
    pct_college_educated: collegePop ? (collegePop / totalAdults) * 100 : undefined,
    children_3_17: children3_17,
    pct_children_3_17: (children3_17 / totalPop) * 100,
    source: 'Census ACS 2022',
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Get place-level (city/town) demographics for a lat/lng.
 * Queries ACS at the Census Place geography level.
 */
export async function getDemographicsForPlace(
  lat: number,
  lng: number,
  incomeThreshold: number = 125000
): Promise<DemographicResult | null> {
  const place = await findPlaceAtPoint(lat, lng);
  if (!place) {
    // Point is not within any incorporated place (rural area) — fall back to tract
    console.log('[Census] No place found at point, falling back to tract');
    return getDemographicsForLocation(lat, lng, incomeThreshold);
  }

  const cacheKey = `place-acs:${place.geoid}`;
  const cached = getCached<DemographicResult>(cacheKey);
  if (cached) return cached;

  try {
    const url =
      `${CENSUS_BASE}?get=${PLACE_ACS_VARS}` +
      `&for=place:${place.placeId}&in=state:${place.state}` +
      (CENSUS_API_KEY ? `&key=${CENSUS_API_KEY}` : '');

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Census ACS place error: ${res.status}`);

    const rows = await res.json() as string[][];
    if (rows.length < 2) return null;

    const headers = rows[0];
    const values = rows[1];

    const data: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      data[headers[i]] = parseFloat(values[i]) || 0;
    }

    const result = buildDemographicResult(data, {
      placeGeoid: place.geoid,
      placeName: place.name,
      incomeThreshold,
    });

    setCache(cacheKey, result, 90 * 24 * 60 * 60 * 1000); // 90 days
    return result;
  } catch (err) {
    console.error('[Census] ACS place fetch error:', err);
    // Fallback to tract on error
    return getDemographicsForLocation(lat, lng, incomeThreshold);
  }
}

// ─── Radius helpers ───────────────────────────────────────────────────────────

const MILES_TO_KM = 1.60934;
const EARTH_RADIUS_KM = 6371;

/**
 * Return approximate bounding box for a lat/lng + radius in miles.
 */
function getBoundingBox(lat: number, lng: number, radiusMiles: number) {
  const radiusKm = radiusMiles * MILES_TO_KM;
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

/**
 * Haversine distance between two points in miles.
 */
function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find all census tract GEOIDs that intersect (approximately) a radius circle.
 * Uses TIGERweb spatial query with a bounding envelope.
 */
async function findTractsInRadius(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<TractInfo[]> {
  const cacheKey = `tracts-radius:${lat.toFixed(4)},${lng.toFixed(4)},${radiusMiles}`;
  const cached = getCached<TractInfo[]>(cacheKey);
  if (cached) return cached;

  const { minLat, maxLat, minLng, maxLng } = getBoundingBox(lat, lng, radiusMiles);

  // Use esriGeometryEnvelope (bounding box) to find intersecting tracts
  const params = new URLSearchParams({
    geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'STATE,COUNTY,TRACT,GEOID,INTPTLAT,INTPTLON',
    returnGeometry: 'false',
    f: 'json',
  });

  const url = `${TIGERWEB_BASE}/${LAYER_TRACT}/query?${params.toString()}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`TIGERweb radius error: ${res.status}`);

    const json = await res.json() as {
      features?: Array<{
        attributes: {
          STATE: string; COUNTY: string; TRACT: string; GEOID: string;
          INTPTLAT: string; INTPTLON: string;
        };
      }>;
    };

    const tracts = (json.features ?? [])
      .filter((f) => {
        // Filter to tracts whose centroid is within the radius circle
        const tLat = parseFloat(f.attributes.INTPTLAT);
        const tLng = parseFloat(f.attributes.INTPTLON);
        if (isNaN(tLat) || isNaN(tLng)) return true; // Include if no centroid
        return haversineDistanceMiles(lat, lng, tLat, tLng) <= radiusMiles * 1.3; // 30% buffer
      })
      .map((f) => ({
        state: f.attributes.STATE,
        county: f.attributes.COUNTY,
        tract: f.attributes.TRACT,
        geoid: f.attributes.GEOID,
      }));

    setCache(cacheKey, tracts, 24 * 60 * 60 * 1000);
    return tracts;
  } catch (err) {
    console.error('[Census] TIGERweb radius query error:', err);
    return [];
  }
}

/**
 * Get population-weighted aggregate demographics for all census tracts within
 * a given radius of a lat/lng.
 */
export async function getDemographicsForRadius(
  lat: number,
  lng: number,
  radiusMiles: number = 5,
  incomeThreshold: number = 125000
): Promise<DemographicResult | null> {
  const tracts = await findTractsInRadius(lat, lng, radiusMiles);

  if (tracts.length === 0) {
    // Fall back to single tract
    return getDemographicsForLocation(lat, lng, incomeThreshold);
  }

  // Fetch ACS for all tracts in parallel (cap at 30 tracts)
  const limitedTracts = tracts.slice(0, 30);
  const acsResults = await Promise.all(
    limitedTracts.map((t) => fetchTractACS(t).catch(() => null))
  );

  // Filter out nulls and pair with tracts
  const valid = limitedTracts
    .map((t, i) => ({ tract: t, acs: acsResults[i] }))
    .filter((x): x is { tract: TractInfo; acs: ACSVariables } => x.acs !== null);

  if (valid.length === 0) return null;

  // Population-weighted aggregation
  const totalPop = valid.reduce((sum, x) => sum + (x.acs.B01003_001E || 0), 0) || 1;

  function weightedAvg(field: keyof ACSVariables): number {
    return valid.reduce((sum, x) => {
      const pop = x.acs.B01003_001E || 0;
      const val = x.acs[field] as number;
      return sum + (val > 0 ? val * pop : 0);
    }, 0) / totalPop;
  }

  function sumField(field: keyof ACSVariables): number {
    return valid.reduce((sum, x) => sum + ((x.acs[field] as number) || 0), 0);
  }

  const totalHouseholds = sumField('B19001_001E') || 1;
  const highIncomeHouseholds =
    sumField('B19001_014E') +
    sumField('B19001_015E') +
    sumField('B19001_016E') +
    sumField('B19001_017E');

  const collegePop =
    sumField('B15003_022E') +
    sumField('B15003_023E') +
    sumField('B15003_024E') +
    sumField('B15003_025E');
  const totalAdults = sumField('B15003_001E') || 1;

  const children3_17 =
    sumField('B09001_003E') +
    sumField('B09001_004E') +
    sumField('B09001_005E') +
    sumField('B09001_006E') +
    sumField('B09001_007E') +
    sumField('B09001_008E');
  const under18 = sumField('B09001_001E');

  return {
    median_household_income: weightedAvg('B19013_001E') || undefined,
    population: totalPop,
    households: totalHouseholds,
    households_above_threshold: highIncomeHouseholds,
    pct_above_threshold: (highIncomeHouseholds / totalHouseholds) * 100,
    median_home_value: weightedAvg('B25077_001E') || undefined,
    pct_with_children: (under18 / totalPop) * 100,
    pct_college_educated: collegePop ? (collegePop / totalAdults) * 100 : undefined,
    children_3_17: children3_17,
    pct_children_3_17: (children3_17 / totalPop) * 100,
    source: `Census ACS 2022 (${valid.length} tracts, ${radiusMiles}mi radius)`,
    fetched_at: new Date().toISOString(),
  };
}
