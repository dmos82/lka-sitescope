import { SCORING_WEIGHTS, COUNTRY_CONFIG } from './constants';
import { clamp, normalizeScore, scoreToGrade } from './utils';
import type { ScoringFactor, ScoringResult, CountryCode } from './types';

// Empirical benchmarks for each factor (min/max for normalization)
export const SCORING_BENCHMARKS = {
  target_households: { min: 0, max: 8000 },
  competitor_landscape: { min: 0, max: 100 },   // 0-100 score
  school_quality: { min: 0, max: 50 },           // count of quality schools
  population_growth: { min: -5, max: 10 },        // % growth, -5% to +10%
  community_density: { min: 0, max: 30 },         // count of community POIs
  commercial_real_estate: { min: 0, max: 1 },     // boolean flag
} as const;

export interface ScoringInputFactors {
  target_households_count: number;          // count of $threshold+ HH with children within trade area
  competitor_score: number;                 // 0-100 (higher = better competitive landscape)
  school_quality_score: number;             // weighted count of quality schools
  population_growth_pct: number;            // % growth over 5 years
  community_poi_count: number;              // libraries, community centers, cultural venues
  commercial_real_estate_ok: boolean;       // manual flag: is commercial real estate acceptable
}

export function calculateScore(
  inputs: ScoringInputFactors,
  country: CountryCode = 'US'
): ScoringResult {
  const config = COUNTRY_CONFIG[country];

  const factors: ScoringFactor[] = [
    {
      name: 'Target Households',
      raw: inputs.target_households_count,
      normalized: normalizeScore(
        inputs.target_households_count,
        SCORING_BENCHMARKS.target_households.min,
        SCORING_BENCHMARKS.target_households.max
      ),
      weight: SCORING_WEIGHTS.target_households,
      weightedScore: 0,
    },
    {
      name: 'Competitor Landscape',
      raw: inputs.competitor_score,
      normalized: normalizeScore(
        inputs.competitor_score,
        SCORING_BENCHMARKS.competitor_landscape.min,
        SCORING_BENCHMARKS.competitor_landscape.max
      ),
      weight: SCORING_WEIGHTS.competitor_landscape,
      weightedScore: 0,
    },
    {
      name: 'School Quality & Montessori',
      raw: inputs.school_quality_score,
      normalized: normalizeScore(
        inputs.school_quality_score,
        SCORING_BENCHMARKS.school_quality.min,
        SCORING_BENCHMARKS.school_quality.max
      ),
      weight: SCORING_WEIGHTS.school_quality,
      weightedScore: 0,
    },
    {
      name: 'Population Growth Trend',
      raw: inputs.population_growth_pct,
      normalized: normalizeScore(
        inputs.population_growth_pct,
        SCORING_BENCHMARKS.population_growth.min,
        SCORING_BENCHMARKS.population_growth.max
      ),
      weight: SCORING_WEIGHTS.population_growth,
      weightedScore: 0,
    },
    {
      name: 'Community & Partner Density',
      raw: inputs.community_poi_count,
      normalized: normalizeScore(
        inputs.community_poi_count,
        SCORING_BENCHMARKS.community_density.min,
        SCORING_BENCHMARKS.community_density.max
      ),
      weight: SCORING_WEIGHTS.community_density,
      weightedScore: 0,
    },
    {
      name: 'Commercial Real Estate',
      raw: inputs.commercial_real_estate_ok ? 1 : 0,
      normalized: inputs.commercial_real_estate_ok ? 100 : 0,
      weight: SCORING_WEIGHTS.commercial_real_estate,
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

  const finalScore = Math.round(clamp(0, 100, totalScore));
  const grade = scoreToGrade(finalScore);

  return {
    score: finalScore,
    grade,
    factors,
    country,
    currency: config.currency,
    income_threshold: config.default_income_threshold,
  };
}
