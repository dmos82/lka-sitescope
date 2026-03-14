import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  role: z.enum(['admin', 'analyst', 'viewer']).default('viewer'),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'analyst', 'viewer']).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const scoreRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  trade_area_miles: z.number().min(1).max(50).default(5),
  income_threshold: z.number().min(0).optional(),
  country: z.enum(['US', 'CA']).optional(),
});

export const saveAnalysisSchema = z.object({
  address: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  trade_area_miles: z.number().min(1).max(50).default(5),
  income_threshold: z.number().min(0).optional(),
  score: z.number().min(0).max(100).optional(),
  letter_grade: z.string().optional(),
  score_breakdown: z.record(z.unknown()).optional(),
  demographics_snapshot: z.record(z.unknown()).optional(),
  map_screenshot_url: z.string().url().optional(),
});

export const updatePartnerSchema = z.object({
  status: z
    .enum(['not_contacted', 'contacted', 'interested', 'partnered', 'declined'])
    .optional(),
  notes: z.string().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  sub_type: z.string().optional(),
  relevance_score: z.number().min(0).max(100).optional(),
});

export const lkaLocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  country: z.enum(['US', 'CA']).default('US'),
  status: z.enum(['OPEN', 'COMING_SOON', 'CLOSED']).default('OPEN'),
  opening_date: z.string().datetime().optional(),
  territory_radius_miles: z.number().min(1).max(100).default(15),
});

export const geocodeQuerySchema = z.object({
  address: z.string().min(3).max(500),
  country: z.enum(['US', 'CA']).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ScoreRequestInput = z.infer<typeof scoreRequestSchema>;
export type SaveAnalysisInput = z.infer<typeof saveAnalysisSchema>;
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;
export type LkaLocationInput = z.infer<typeof lkaLocationSchema>;
export type GeocodeQueryInput = z.infer<typeof geocodeQuerySchema>;
