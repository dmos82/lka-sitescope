# LKA SiteScope — Audit Fix Plan (2026-03-14)

Based on the comprehensive audit of the existing codebase. All steps operate on the existing repo at `/Users/davidmini/Desktop/Projects/lka-sitescope/`.

**IMPORTANT**: Web runs on port 3100, API runs on port 4100. Do NOT change these.

---

## Phase 1: Security Hardening (Steps 1-4)

#### Step 1: CSRF Protection
Add CSRF token validation for all state-changing requests (POST, PATCH, DELETE).
- Install `csurf` or implement double-submit cookie pattern in `apps/api/src/index.ts`
- Generate CSRF token on GET `/api/auth/csrf-token` endpoint
- Validate CSRF token in middleware for POST/PATCH/DELETE routes
- Update `apps/web/lib/api-client.ts` to fetch and include CSRF token in requests
- Exempt `/api/auth/login` and `/api/auth/refresh` from CSRF (they establish the session)

#### Step 2: Role-Based Access Control Enforcement
Tighten role checks on API routes that currently only check authentication.
- `apps/api/src/routes/saved.ts`: POST/DELETE require role `analyst` or `admin` (not `viewer`)
- `apps/api/src/routes/score.ts`: POST require role `analyst` or `admin`
- `apps/api/src/routes/partners.ts`: PATCH status require role `analyst` or `admin`
- Update `apps/api/src/middleware/protect.ts` to support `requireRole('analyst', 'admin')` (multiple roles)
- Add role-aware UI in web: hide action buttons for viewer role users

#### Step 3: Audit Logging
Wire up the existing AuditLog model so sensitive operations are tracked.
- Create `apps/api/src/lib/audit.ts` helper: `logAudit(userId, action, entity, entityId, req)` that writes to AuditLog table
- Add audit logging calls to: user create/update/delete, LKA location create/update/delete, login/logout, saved analysis create/delete, partner status changes
- Wire up the existing `/api/admin/audit-log` GET endpoint to return real data with pagination (limit, offset, filter by action/entity)

#### Step 4: Security Headers & Cookie Hardening
- Set `SameSite=Strict` on refresh token cookie (currently may be Lax or unset)
- Add `Secure` flag on cookies in production
- Review helmet config for CSP headers that allow MapLibre tile loading
- Ensure CORS origin is strict (no wildcards)

---

## Phase 2: Real Data Services (Steps 5-9)

#### Step 5: Census API Integration
Replace the stubbed census service with real US Census ACS API calls.
- Update `apps/api/src/services/census.ts` to call the Census ACS 5-Year API
- Fetch: total population, median household income, median age, housing units, owner-occupied %, household size
- Use `CENSUS_API_KEY` from environment
- Implement FIPS code lookup: lat/lng → state+county+tract via Census Geocoder API
- Cache responses for 30 days (in-memory or DB)
- Return data matching the `DemographicResult` type from shared package

#### Step 6: StatsCan Integration
Replace the stubbed StatsCan service with real data.
- Update `apps/api/src/services/statscan.ts` to call StatsCan Census Profile API
- Fetch: population, median income (after-tax), housing, age distribution for Census Subdivisions
- Lat/lng → geographic code lookup via StatsCan boundary files or reverse geocode
- Cache responses for 30 days
- Return data matching `DemographicResult` with CAD currency

#### Step 7: POI Service Enhancement
Improve the Overpass-based POI service.
- `apps/api/src/routes/poi.ts`: Add configurable radius (default 3 miles / 5km)
- Add POI categories: schools (existing), libraries, community centers, competitors (insurance/financial), churches, daycares
- Return distance from search point for each POI
- Add result count limits (max 50 per category)
- Cache Overpass responses for 7 days

#### Step 8: Wire Pipeline Data into API
Connect the pipeline importers so their data is queryable.
- `packages/pipeline/src/foursquare.ts`: Complete the stub — download Parquet, parse with `parquet-wasm`, insert competitor POIs into DB
- Add a `pipeline_data` or `cached_poi` table to Prisma schema for storing imported pipeline data
- Create `apps/api/src/routes/pipeline-data.ts` to query cached pipeline data by lat/lng radius
- Register the new route in `apps/api/src/index.ts`

#### Step 9: Isochrone Service Improvement
- `apps/api/src/routes/isochrone.ts`: Ensure ORS API key is used when available
- Add 5-minute and 25-minute isochrone options (currently only 10/15/20)
- Store isochrone GeoJSON in DB cache table with 30-day TTL
- Fallback circle generation should use realistic drive-time estimates (not just radius)

---

## Phase 3: Export Features (Steps 10-12)

#### Step 10: Excel Export
- Install `exceljs` in `apps/api`
- Create `apps/api/src/routes/export.ts` with GET `/api/export/excel/:analysisId`
- Generate .xlsx with sheets: Summary (score, grade, address), Demographics, Competitors, Partners, Schools
- Style with LKA brand colors, headers, auto-column-width
- Return as download (Content-Disposition: attachment)
- Protect with auth middleware

#### Step 11: PDF Export
- Install `puppeteer` in `apps/api` (or `@react-pdf/renderer` for lighter weight)
- Add GET `/api/export/pdf/:analysisId` to export route
- Generate PDF report: cover page with address + score, demographics table, competitor map screenshot (if available), partner list, scoring breakdown chart
- Return as download

#### Step 12: PowerPoint Export
- Install `pptxgenjs` in `apps/api`
- Add GET `/api/export/pptx/:analysisId` to export route
- Generate .pptx with slides: Title (address + grade), Executive Summary, Demographics, Competition Analysis, Scoring Breakdown, Recommendation
- Use LKA brand template (dark blue header, white body)
- Return as download

---

## Phase 4: Missing Features (Steps 13-18)

#### Step 13: Data Health Monitoring
- Create `apps/web/app/(dashboard)/data-health/page.tsx`
- Show: last pipeline run dates, record counts per data source, data freshness indicators (green/yellow/red)
- Create `apps/api/src/routes/data-health.ts` with GET `/api/data-health` — query pipeline metadata
- Add sidebar link for admin users
- Register route in `apps/api/src/index.ts`

#### Step 14: Logging Infrastructure
- Install `pino` in `apps/api`
- Replace all `console.log/error` with pino logger
- Use `LOG_LEVEL` from environment (default: 'info')
- Add request ID to each log entry via middleware
- Structured JSON logging in production, pretty-print in development

#### Step 15: Mobile Responsiveness
- Audit all pages for mobile breakpoints (< 768px)
- `apps/web/components/layout/Sidebar.tsx`: Collapsible/drawer on mobile
- Map page: Full-screen map with floating controls on mobile
- Tables: Horizontal scroll or card layout on mobile
- Score display: Stack vertically on mobile

#### Step 16: Error Boundaries & Loading States
- Add Next.js `error.tsx` boundary to `(dashboard)/` layout
- Add `loading.tsx` skeletons for each dashboard page
- Ensure all `apiFetch` calls have try/catch with user-friendly error messages
- Add toast notifications for success/error on mutations (save, delete, export)

#### Step 17: Nominatim User-Agent Fix
- Update User-Agent in `apps/api/src/routes/geocode.ts` from 'contact@lka.com' to a real contact or configurable env var `NOMINATIM_CONTACT_EMAIL`
- Add to `.env.example`

#### Step 18: Partner Export Pagination
- `apps/api/src/routes/partners.ts`: Add `limit` and `offset` query params to export endpoint
- Default limit 500, max 5000
- Add total count header for client-side pagination

---

## Phase 5: Cleanup & Polish (Steps 19-22)

#### Step 19: Remove Unused Environment Variables
- Remove `GOOGLE_PLACES_API_KEY` and `EVENTBRITE_TOKEN` from `.env.example` (not used anywhere in code)
- OR implement Google Places for geocoding and Eventbrite for community events — decide and act

#### Step 20: Build & Lint Verification
- Run `pnpm build` — fix any TypeScript errors
- Run `pnpm lint` — fix any ESLint warnings
- Ensure all pages render without runtime errors
- Test auth flow: login → protected page → refresh → logout

#### Step 21: Deployment Configuration
- Create `Dockerfile` for `apps/api` (multi-stage build: build shared+database+api → slim runtime)
- Create `netlify.toml` for `apps/web` (Next.js on Netlify)
- Create `render.yaml` for API + PostgreSQL/PostGIS on Render
- Document deployment in a DEPLOY section of the project README or .env.example

#### Step 22: Final Integration Test
- Verify all API endpoints respond correctly (health, auth, CRUD, scoring, demographics, export)
- Verify all web pages load and display data
- Verify auth flow end-to-end
- Verify export downloads work
- Verify share link works for unauthenticated users
- Fix any issues found

---

## Summary

| Phase | Steps | Focus |
|-------|-------|-------|
| 1: Security | 1-4 | CSRF, RBAC, audit logging, cookie hardening |
| 2: Data | 5-9 | Census API, StatsCan, POI, pipeline, isochrones |
| 3: Export | 10-12 | Excel, PDF, PowerPoint |
| 4: Features | 13-18 | Data health, logging, mobile, error boundaries, fixes |
| 5: Polish | 19-22 | Cleanup, build verification, deployment, integration test |

Total: 22 steps
