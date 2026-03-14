import type { CountryCode } from './types';
import { GRADE_THRESHOLDS } from './constants';

export function detectCountry(lat: number, lng: number): CountryCode {
  // Rough bounding box for Canada (approximate)
  if (lat >= 42 && lat <= 83 && lng >= -141 && lng <= -52) {
    // Further check: Canada latitude starts around 42N at its southernmost
    // US continental: lat 24-49, lng -125 to -67
    // Simple heuristic: if lat > 49 it's likely Canada
    if (lat > 49) return 'CA';
    // Great Lakes region: some Canadian cities are below 49
    // Windsor, ON is ~42.3N — check longitude
    if (lat > 41.7 && lng < -82.5 && lng > -83.5) return 'CA';
  }
  return 'US';
}

export function milesToMeters(miles: number): number {
  return miles * 1609.344;
}

export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

export function scoreToGrade(score: number): string {
  for (const threshold of GRADE_THRESHOLDS) {
    if (score >= threshold.min) return threshold.grade;
  }
  return 'F';
}

export function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeScore(
  raw: number,
  benchmarkMin: number,
  benchmarkMax: number
): number {
  if (benchmarkMax === benchmarkMin) return 0;
  return clamp(0, 100, ((raw - benchmarkMin) / (benchmarkMax - benchmarkMin)) * 100);
}

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
