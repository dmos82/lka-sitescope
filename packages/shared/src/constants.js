"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TERRITORY_RADIUS_MILES = exports.DEFAULT_TRADE_AREA_MILES = exports.FSQ_CATEGORIES = exports.GRADE_THRESHOLDS = exports.SCORING_WEIGHTS = exports.COUNTRY_CONFIG = exports.PARTNER_STATUSES = exports.LOCATION_STATUSES = exports.ROLES = void 0;
exports.ROLES = ['admin', 'analyst', 'viewer'];
exports.LOCATION_STATUSES = ['OPEN', 'COMING_SOON', 'CLOSED'];
exports.PARTNER_STATUSES = [
    'not_contacted',
    'contacted',
    'interested',
    'partnered',
    'declined',
];
exports.COUNTRY_CONFIG = {
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
exports.SCORING_WEIGHTS = {
    target_households: 0.45,
    competitor_landscape: 0.15,
    school_quality: 0.10,
    population_growth: 0.10,
    community_density: 0.10,
    commercial_real_estate: 0.10,
};
exports.GRADE_THRESHOLDS = [
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
];
// Foursquare category filter list (relevant POI categories)
exports.FSQ_CATEGORIES = {
    grocery: '17069',
    school: '12058',
    community_center: '12112',
    library: '12126',
    cultural: '10027',
    fitness: '18021',
    childcare: '12059',
    park: '16032',
};
exports.DEFAULT_TRADE_AREA_MILES = 5;
exports.DEFAULT_TERRITORY_RADIUS_MILES = 15;
//# sourceMappingURL=constants.js.map