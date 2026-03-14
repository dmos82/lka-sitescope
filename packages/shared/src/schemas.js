"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geocodeQuerySchema = exports.lkaLocationSchema = exports.updatePartnerSchema = exports.saveAnalysisSchema = exports.scoreRequestSchema = exports.updateUserSchema = exports.createUserSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
exports.createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    name: zod_1.z.string().min(1).max(100),
    role: zod_1.z.enum(['admin', 'analyst', 'viewer']).default('viewer'),
});
exports.updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    role: zod_1.z.enum(['admin', 'analyst', 'viewer']).optional(),
    is_active: zod_1.z.boolean().optional(),
    password: zod_1.z.string().min(8).optional(),
});
exports.scoreRequestSchema = zod_1.z.object({
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
    trade_area_miles: zod_1.z.number().min(1).max(50).default(5),
    income_threshold: zod_1.z.number().min(0).optional(),
    country: zod_1.z.enum(['US', 'CA']).optional(),
});
exports.saveAnalysisSchema = zod_1.z.object({
    address: zod_1.z.string().min(1),
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
    trade_area_miles: zod_1.z.number().min(1).max(50).default(5),
    income_threshold: zod_1.z.number().min(0).optional(),
    score: zod_1.z.number().min(0).max(100).optional(),
    letter_grade: zod_1.z.string().optional(),
    score_breakdown: zod_1.z.record(zod_1.z.unknown()).optional(),
    demographics_snapshot: zod_1.z.record(zod_1.z.unknown()).optional(),
    map_screenshot_url: zod_1.z.string().url().optional(),
});
exports.updatePartnerSchema = zod_1.z.object({
    status: zod_1.z
        .enum(['not_contacted', 'contacted', 'interested', 'partnered', 'declined'])
        .optional(),
    notes: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    sub_type: zod_1.z.string().optional(),
    relevance_score: zod_1.z.number().min(0).max(100).optional(),
});
exports.lkaLocationSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200),
    address: zod_1.z.string().min(1),
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
    country: zod_1.z.enum(['US', 'CA']).default('US'),
    status: zod_1.z.enum(['OPEN', 'COMING_SOON', 'CLOSED']).default('OPEN'),
    opening_date: zod_1.z.string().datetime().optional(),
    territory_radius_miles: zod_1.z.number().min(1).max(100).default(15),
});
exports.geocodeQuerySchema = zod_1.z.object({
    address: zod_1.z.string().min(3).max(500),
    country: zod_1.z.enum(['US', 'CA']).optional(),
});
//# sourceMappingURL=schemas.js.map