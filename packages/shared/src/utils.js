"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectCountry = detectCountry;
exports.milesToMeters = milesToMeters;
exports.metersToMiles = metersToMiles;
exports.scoreToGrade = scoreToGrade;
exports.clamp = clamp;
exports.normalizeScore = normalizeScore;
exports.formatCurrency = formatCurrency;
const constants_1 = require("./constants");
function detectCountry(lat, lng) {
    // Rough bounding box for Canada (approximate)
    if (lat >= 42 && lat <= 83 && lng >= -141 && lng <= -52) {
        // Further check: Canada latitude starts around 42N at its southernmost
        // US continental: lat 24-49, lng -125 to -67
        // Simple heuristic: if lat > 49 it's likely Canada
        if (lat > 49)
            return 'CA';
        // Great Lakes region: some Canadian cities are below 49
        // Windsor, ON is ~42.3N — check longitude
        if (lat > 41.7 && lng < -82.5 && lng > -83.5)
            return 'CA';
    }
    return 'US';
}
function milesToMeters(miles) {
    return miles * 1609.344;
}
function metersToMiles(meters) {
    return meters / 1609.344;
}
function scoreToGrade(score) {
    for (const threshold of constants_1.GRADE_THRESHOLDS) {
        if (score >= threshold.min)
            return threshold.grade;
    }
    return 'F';
}
function clamp(min, max, value) {
    return Math.min(max, Math.max(min, value));
}
function normalizeScore(raw, benchmarkMin, benchmarkMax) {
    if (benchmarkMax === benchmarkMin)
        return 0;
    return clamp(0, 100, ((raw - benchmarkMin) / (benchmarkMax - benchmarkMin)) * 100);
}
function formatCurrency(value, currency) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(value);
}
//# sourceMappingURL=utils.js.map