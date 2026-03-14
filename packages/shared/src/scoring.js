"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCORING_BENCHMARKS = void 0;
exports.calculateScore = calculateScore;
const constants_1 = require("./constants");
const utils_1 = require("./utils");
// Empirical benchmarks for each factor (min/max for normalization)
exports.SCORING_BENCHMARKS = {
    target_households: { min: 0, max: 8000 },
    competitor_landscape: { min: 0, max: 100 }, // 0-100 score
    school_quality: { min: 0, max: 50 }, // count of quality schools
    population_growth: { min: -5, max: 10 }, // % growth, -5% to +10%
    community_density: { min: 0, max: 30 }, // count of community POIs
    commercial_real_estate: { min: 0, max: 1 }, // boolean flag
};
function calculateScore(inputs, country = 'US') {
    const config = constants_1.COUNTRY_CONFIG[country];
    const factors = [
        {
            name: 'Target Households',
            raw: inputs.target_households_count,
            normalized: (0, utils_1.normalizeScore)(inputs.target_households_count, exports.SCORING_BENCHMARKS.target_households.min, exports.SCORING_BENCHMARKS.target_households.max),
            weight: constants_1.SCORING_WEIGHTS.target_households,
            weightedScore: 0,
        },
        {
            name: 'Competitor Landscape',
            raw: inputs.competitor_score,
            normalized: (0, utils_1.normalizeScore)(inputs.competitor_score, exports.SCORING_BENCHMARKS.competitor_landscape.min, exports.SCORING_BENCHMARKS.competitor_landscape.max),
            weight: constants_1.SCORING_WEIGHTS.competitor_landscape,
            weightedScore: 0,
        },
        {
            name: 'School Quality & Montessori',
            raw: inputs.school_quality_score,
            normalized: (0, utils_1.normalizeScore)(inputs.school_quality_score, exports.SCORING_BENCHMARKS.school_quality.min, exports.SCORING_BENCHMARKS.school_quality.max),
            weight: constants_1.SCORING_WEIGHTS.school_quality,
            weightedScore: 0,
        },
        {
            name: 'Population Growth Trend',
            raw: inputs.population_growth_pct,
            normalized: (0, utils_1.normalizeScore)(inputs.population_growth_pct, exports.SCORING_BENCHMARKS.population_growth.min, exports.SCORING_BENCHMARKS.population_growth.max),
            weight: constants_1.SCORING_WEIGHTS.population_growth,
            weightedScore: 0,
        },
        {
            name: 'Community & Partner Density',
            raw: inputs.community_poi_count,
            normalized: (0, utils_1.normalizeScore)(inputs.community_poi_count, exports.SCORING_BENCHMARKS.community_density.min, exports.SCORING_BENCHMARKS.community_density.max),
            weight: constants_1.SCORING_WEIGHTS.community_density,
            weightedScore: 0,
        },
        {
            name: 'Commercial Real Estate',
            raw: inputs.commercial_real_estate_ok ? 1 : 0,
            normalized: inputs.commercial_real_estate_ok ? 100 : 0,
            weight: constants_1.SCORING_WEIGHTS.commercial_real_estate,
            weightedScore: 0,
        },
    ];
    // Calculate weighted scores
    let totalScore = 0;
    for (const factor of factors) {
        factor.weightedScore = factor.normalized * factor.weight;
        totalScore += factor.weightedScore;
    }
    // Cap at 60 if commercial real estate flag is false
    if (!inputs.commercial_real_estate_ok) {
        totalScore = Math.min(60, totalScore);
    }
    const finalScore = Math.round((0, utils_1.clamp)(0, 100, totalScore));
    const grade = (0, utils_1.scoreToGrade)(finalScore);
    return {
        score: finalScore,
        grade,
        factors,
        country,
        currency: config.currency,
        income_threshold: config.default_income_threshold,
    };
}
//# sourceMappingURL=scoring.js.map