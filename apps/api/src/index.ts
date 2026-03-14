import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import lkaLocationsRoutes from './routes/lka-locations';
import savedRoutes from './routes/saved';
import partnersRoutes from './routes/partners';
import scoreRoutes from './routes/score';
import demographicsRoutes from './routes/demographics';
import geocodeRoutes from './routes/geocode';
import healthRoutes from './routes/health';

const app = express();
const PORT = process.env.PORT ?? 4000;

// ─── Security & Parsing ─────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many auth attempts, please try again later.',
});

app.use(globalLimiter);

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/lka-locations', lkaLocationsRoutes);
app.use('/api/saved', savedRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/score', scoreRoutes);
app.use('/api/demographics', demographicsRoutes);
app.use('/api/locations', geocodeRoutes);

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[API Error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
);

app.listen(PORT, () => {
  console.log(`[API] Running on http://localhost:${PORT}`);
});

export default app;
