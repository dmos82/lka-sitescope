// ─── Enums / Literal Types ─────────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst' | 'viewer';
export type LocationStatus = 'OPEN' | 'COMING_SOON' | 'CLOSED';
export type PartnerStatus =
  | 'not_contacted'
  | 'contacted'
  | 'interested'
  | 'partnered'
  | 'declined';
export type CountryCode = 'US' | 'CA';

// ─── Domain Models ─────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface LkaLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  country: CountryCode;
  status: LocationStatus;
  opening_date?: Date;
  territory_radius_miles: number;
  created_by_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface SavedAnalysis {
  id: string;
  user_id: string;
  address: string;
  lat: number;
  lng: number;
  country: CountryCode;
  score?: number;
  letter_grade?: string;
  score_breakdown?: ScoringResult;
  demographics_snapshot?: DemographicResult;
  income_threshold: number;
  trade_area_miles: number;
  map_screenshot_url?: string;
  share_token?: string;
  created_at: Date;
  updated_at: Date;
  partners?: Partner[];
}

export interface Partner {
  id: string;
  analysis_id: string;
  name: string;
  category: string;
  sub_type?: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  distance_miles?: number;
  relevance_score?: number;
  status: PartnerStatus;
  notes?: string;
  source?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity?: string;
  entity_id?: string;
  ip_address?: string;
  user_agent?: string;
  meta?: Record<string, unknown>;
  created_at: Date;
}

// ─── Analysis / Scoring Types ───────────────────────────────────────────────

export interface ScoringFactor {
  name: string;
  raw: number;
  normalized: number;
  weight: number;
  weightedScore: number;
}

export interface ScoringResult {
  score: number;
  grade: string;
  factors: ScoringFactor[];
  country: CountryCode;
  currency: string;
  income_threshold: number;
}

export interface DemographicResult {
  tract_geoid?: string;
  place_geoid?: string;
  place_name?: string;
  county_name?: string;
  median_household_income?: number;
  population?: number;
  households?: number;
  households_above_threshold?: number;
  pct_above_threshold?: number;
  median_home_value?: number;
  pct_with_children?: number;
  pct_college_educated?: number;
  pop_growth_rate?: number;
  /** Children aged 3-17 (B09001_003E through B09001_008E) */
  children_3_17?: number;
  /** Percentage of total population aged 3-17 */
  pct_children_3_17?: number;
  /** ACS 1-Year median household income (more recent, only available for places 65k+ pop) */
  median_household_income_1yr?: number | null;
  /** ACS 5-Year vintage label, e.g. "2018-2022" */
  acs_year_5yr?: string;
  /** ACS 1-Year vintage label, e.g. "2023" (null if unavailable for this area) */
  acs_year_1yr?: string | null;
  source?: string;
  fetched_at?: string;
}

export interface POIResult {
  fsq_id?: string;
  name: string;
  category: string;
  address?: string;
  lat: number;
  lng: number;
  distance_meters?: number;
}

export interface SchoolResult {
  nces_id?: string;
  name: string;
  type: string; // public, private, charter, montessori
  grade_levels?: string;
  address?: string;
  lat: number;
  lng: number;
  enrollment?: number;
  distance_miles?: number;
}

export interface TractResult {
  geoid: string;
  name: string;
  state_fips: string;
  county_fips: string;
  geometry?: GeoJSONFeature;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties?: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export type MoneyAmount = {
  value: number;
  currency: string;
  formatted: string;
};
