import type { UserRole, LocationStatus, PartnerStatus, CountryCode } from './types';

export const ROLES: UserRole[] = ['admin', 'analyst', 'viewer'];

export const LOCATION_STATUSES: LocationStatus[] = ['OPEN', 'COMING_SOON', 'CLOSED'];

export const PARTNER_STATUSES: PartnerStatus[] = [
  'not_contacted',
  'contacted',
  'interested',
  'partnered',
  'declined',
];

export const COUNTRY_CONFIG: Record<
  CountryCode,
  {
    name: string;
    currency: string;
    default_income_threshold: number;
    ppp_factor: number;
  }
> = {
  US: {
    name: 'United States',
    currency: 'USD',
    default_income_threshold: 125000,
    ppp_factor: 1.0,
  },
  CA: {
    name: 'Canada',
    currency: 'CAD',
    default_income_threshold: 160000,
    ppp_factor: 1.28,
  },
};

export const SCORING_WEIGHTS = {
  target_households: 0.45,
  competitor_landscape: 0.15,
  school_quality: 0.10,
  population_growth: 0.10,
  community_density: 0.10,
  commercial_real_estate: 0.10,
} as const;

export const GRADE_THRESHOLDS = [
  { min: 93, grade: 'A+' },
  { min: 90, grade: 'A' },
  { min: 87, grade: 'A-' },
  { min: 83, grade: 'B+' },
  { min: 80, grade: 'B' },
  { min: 77, grade: 'B-' },
  { min: 73, grade: 'C+' },
  { min: 70, grade: 'C' },
  { min: 67, grade: 'C-' },
  { min: 60, grade: 'D' },
  { min: 0, grade: 'F' },
] as const;

// Foursquare category filter list (relevant POI categories)
export const FSQ_CATEGORIES = {
  grocery: '17069',
  school: '12058',
  community_center: '12112',
  library: '12126',
  cultural: '10027',
  fitness: '18021',
  childcare: '12059',
  park: '16032',
} as const;

export const DEFAULT_TRADE_AREA_MILES = 5;
export const DEFAULT_TERRITORY_RADIUS_MILES = 15;
