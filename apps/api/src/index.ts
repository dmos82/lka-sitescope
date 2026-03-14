import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';

import { logger } from './lib/logger';
import { csrfProtect } from './middleware/csrf';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import lkaLocationsRoutes from './routes/lka-locations';
import savedRoutes from './routes/saved';
import partnersRoutes from './routes/partners';
import scoreRoutes from './routes/score';
import demographicsRoutes from './routes/demographics';
import geocodeRoutes from './routes/geocode';
import healthRoutes from './routes/health';
import adminRoutes from './routes/admin';
import poiRoutes from './routes/poi';
import isochroneRoutes from './routes/isochrone';
import schoolsRoutes from './routes/schools';
import exportRoutes from './routes/export';
import dataHealthRoutes from './routes/data-health';
import placesRoutes from './routes/places';
import boundariesRoutes from './routes/boundaries';

const app = express();
const PORT = process.env.PORT ?? 4100;

// ─── Security & Parsing ─────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // Allow MapLibre GL tile sources
        imgSrc: ["'self'", 'data:', 'blob:', '*.openstreetmap.org', '*.maptiler.com', '*.mapbox.com'],
        connectSrc: [
          "'self'",
          process.env.FRONTEND_URL ?? 'http://localhost:3100',
          '*.openstreetmap.org',
          'overpass-api.de',
          'nominatim.openstreetmap.org',
          'api.statcan.gc.ca',
          'api.census.gov',
          'tigerweb.geo.census.gov',
          'api.openrouteservice.org',
          'places.googleapis.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
      },
    },
  })
);
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3100',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ─── Request ID & Structured Logging ────────────────────────────────────────
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  res.setHeader('X-Request-Id', requestId);
  (req as express.Request & { requestId?: string }).requestId = requestId;

  const start = Date.now();
  res.on('finish', () => {
    logger.info(
      {
        requestId,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
        ip: req.ip,
      },
      `${req.method} ${req.originalUrl} ${res.statusCode}`
    );
  });

  next();
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many auth attempts, please try again later.',
});

app.use(globalLimiter);
app.use(csrfProtect);

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/health', healthRoutes);
// CSRF token endpoint must NOT be behind authLimiter (needed for every mutation)
app.get('/api/auth/csrf-token', (_req, res) => {
  const { generateCsrfToken } = require('./middleware/csrf');
  res.json({ csrf_token: generateCsrfToken() });
});
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/lka-locations', lkaLocationsRoutes);
app.use('/api/saved', savedRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/score', scoreRoutes);
app.use('/api/demographics', demographicsRoutes);
app.use('/api/locations', geocodeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/poi', poiRoutes);
app.use('/api/isochrone', isochroneRoutes);
app.use('/api/schools', schoolsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/data-health', dataHealthRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/boundaries', boundariesRoutes);

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err }, `Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
);

app.listen(PORT, () => {
  logger.info(`[API] Running on http://localhost:${PORT}`);
});

export default app;
