import type { DemographicResult } from '@lka/shared';

const CENSUS_BASE = 'https://api.census.gov/data/2022/acs/acs5';
const CENSUS_API_KEY = process.env.CENSUS_API_KEY ?? '';

// TIGERweb for tract lookup
const TIGERWEB_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';

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
 * Get demographic result for a point
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
