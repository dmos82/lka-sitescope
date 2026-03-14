# LKA SiteScope — Demographics & Map V2 Plan

## Problem Statement
1. Single census tract demographics are misleading (need city-wide + radius aggregation)
2. No city/town/county boundaries on map
3. POI data from OpenStreetMap is unreliable (misclassifications, missing data)
4. Need real addresses, phone numbers, contact info for POIs (Google Maps quality)
5. Need children age demographics (3-18) for LKA franchise targeting
6. POIs should show as toggleable map layers within selected boundaries

## What the User Wants
"Basically Google Maps with filters for schools, community centres, grocery stores, libraries, art galleries, museums — all showing on the map when selecting a district/town/city/county, as layers. Click on any POI to see address and contact info. Population with children 3-18."

---

## Features

### Feature 1: Google Places API Integration
**Why**: OSM/Overpass data has misclassifications, missing addresses, no phone/contact info. Google Places is the gold standard.

**New Service** (`apps/api/src/services/google-places.ts`):
- Use Google Places API (New) — Nearby Search endpoint
- Categories to support:
  - `school` — schools (K-12, preschool, montessori)
  - `library` — public libraries
  - `community_center` — community centers, recreation centers
  - `supermarket` / `grocery_store` — grocery stores
  - `art_gallery` — art galleries
  - `museum` — museums
- Each result includes: name, address, phone, website, rating, lat/lng, place_id, types, opening hours
- Cache responses: 7 days per category+location combo (Google charges per request)
- Requires `GOOGLE_PLACES_API_KEY` env var
- Google gives $200/month free credit (~6,000 searches free)

**New Route** (`apps/api/src/routes/places.ts`):
- `GET /api/places?lat={lat}&lng={lng}&radius_miles={r}&types=school,library,grocery_store`
- Returns grouped by category with full details
- `GET /api/places/:placeId` — fetch full place details (phone, hours, reviews)

**Fallback**: If no Google API key, fall back to existing Overpass/OSM data (degraded quality)

### Feature 2: City/Town/County Boundaries
**Goal**: Show political boundaries on the map. Aggregate demographics within them.

**New Service** (`apps/api/src/services/tigerweb.ts`):
- TIGERweb ArcGIS REST API (free, no key needed)
- Layers:
  - Places (cities/towns): Layer 28
  - Counties: Layer 86
  - Census Tracts: Layer 8
- Functions:
  - `getPlaceBoundary(lat, lng)` → GeoJSON polygon + name + GEOID
  - `getCountyBoundary(lat, lng)` → GeoJSON polygon + name
  - `getTractsInRadius(lat, lng, radiusMiles)` → list of tract GEOIDs + centroids
- Cache: 30 days (boundaries don't change)

**New Route** (`apps/api/src/routes/boundaries.ts`):
- `GET /api/boundaries?lat={lat}&lng={lng}&type=place|county|tracts`
- Returns GeoJSON + metadata (name, population, GEOID)

### Feature 3: Demographics Upgrade — Place/Radius/Children
**Goal**: City-level demographics, radius aggregation, and children 3-18 data.

**Census ACS Tables to Add**:
- `B09001_001E` — Total population under 18
- `B09001_003E` — Children 3-4 years
- `B09001_004E` — Children 5 years
- `B09001_005E` — Children 6-8 years
- `B09001_006E` — Children 9-11 years
- `B09001_007E` — Children 12-14 years
- `B09001_008E` — Children 15-17 years
- Sum B09001_003E through B09001_008E = **children 3-17** (closest to 3-18)
- Also: `B01001_001E` total population for percentage calculation

**API Changes** (`apps/api/src/services/census.ts`):
- Add children fields to `DemographicResult`:
  ```
  children_3_17: number
  pct_children_3_17: number
  children_under_18: number
  ```
- Support place-level queries: `for=place:{placeId}&in=state:{stateId}`
- Support radius aggregation: query multiple tracts, population-weighted average

**Route Changes** (`apps/api/src/routes/demographics.ts`):
- Add `level` param: `tract` (default) | `place` | `radius`
- Add `radius_miles` param for radius aggregation
- Always return children demographics alongside income/housing data

### Feature 4: POI Map Layers
**Goal**: Schools, libraries, community centers, groceries, art galleries, museums as toggleable map layers with markers.

**Frontend** (`apps/web/components/map/MapView.tsx`):
- After location selected, fetch POIs from `/api/places`
- Add GeoJSON source per category with distinct markers:
  | Category | Color | Icon |
  |----------|-------|------|
  | Schools | Blue | 📚 |
  | Libraries | Green | 📖 |
  | Community Centers | Orange | 🏛 |
  | Grocery Stores | Red | 🛒 |
  | Art Galleries | Purple | 🎨 |
  | Museums | Teal | 🏛 |
- Click popup: name, address, phone, rating, "Open in Google Maps" link
- Layer toggle panel: checkbox per category (all off by default)
- Auto-fetch when location changes or radius changes

### Feature 5: Demographics Dashboard Upgrade
**Goal**: Show enriched demographics with children data, level selector, and source counts.

**Frontend** (`apps/web/app/(dashboard)/demographics/page.tsx`):
- Level selector: "Census Tract" | "City/Town" | "Trade Area (X mi)"
- New data cards:
  - Children 3-17: count + percentage of population
  - Households with children (already have `pct_with_children`)
- POI summary section:
  - "12 schools, 3 libraries, 5 community centers, 8 grocery stores within 5 mi"
  - Each with link to see on map
- City/town name displayed when boundary detected

### Feature 6: Scoring Auto-Fill from Real POI Data
**Goal**: Auto-populate scoring factors from Google Places counts.

**Frontend** (`apps/web/app/(dashboard)/scoring/page.tsx`):
- Auto-fill button fetches:
  - Schools count → `school_quality_score` (more schools = higher score)
  - Competitor count (Montessori, Kumon, Sylvan, childcare) → `competitor_score`
  - Community POI count (libraries + community centers + art galleries + museums) → `community_poi_count`
- Show: "Based on 12 schools, 4 competitors, 8 community venues within 5 mi"

---

## Implementation Steps

#### Step 1: Google Places Service + Route
- `apps/api/src/services/google-places.ts` — Nearby Search with category mapping + caching
- `apps/api/src/routes/places.ts` — GET /api/places, GET /api/places/:placeId
- Register in index.ts
- Add `GOOGLE_PLACES_API_KEY` to .env.example and Render env vars
- Fallback to Overpass if no key

#### Step 2: TIGERweb Boundary Service + Route
- `apps/api/src/services/tigerweb.ts` — place/county/tract boundary queries
- `apps/api/src/routes/boundaries.ts` — GET /api/boundaries
- Register in index.ts
- Cache responses 30 days

#### Step 3: Census Demographics Upgrade
- Add children 3-17 fields to census.ts (B09001 table)
- Add place-level query support
- Add radius aggregation (TIGERweb tract list → batch Census queries → weighted average)
- Update DemographicResult type in shared package
- Update demographics route with `level` param

#### Step 4: Map — Boundary Layers
- Add city/county boundary GeoJSON layers to MapView
- Fetch boundary when location selected
- Dashed outline + light fill + name label
- Layer toggles: "City Boundary", "County Boundary"

#### Step 5: Map — POI Layers
- Fetch Google Places data after location selected
- Add marker layers per category (6 categories)
- Click popup with name, address, phone, rating, Google Maps link
- Layer toggles per category (default off)
- Loading states while fetching

#### Step 6: Demographics Page Upgrade
- Level selector (tract/place/radius)
- Children 3-17 data cards
- POI summary with counts per category
- City/town name from boundary data

#### Step 7: Scoring Auto-Fill
- Enhance auto-fill to use Google Places counts
- Map POI counts to scoring factors
- Show breakdown

#### Step 8: Deploy & Test
- Add GOOGLE_PLACES_API_KEY to Render env vars
- Push to GitHub → auto-deploy
- Smoke test boundaries, POIs, demographics in production

---

## Environment Requirements
- `GOOGLE_PLACES_API_KEY` — Google Cloud Console → APIs & Services → Places API (New)
- Google gives $200/month free credit (~6,000 Nearby Search requests)
- TIGERweb API — free, no key needed
- Census ACS API — already have `CENSUS_API_KEY`

## Estimated Effort
- Steps 1-3: API services (~3 hours)
- Steps 4-5: Map layers (~2 hours)
- Steps 6-7: Frontend pages (~1.5 hours)
- Step 8: Deploy + test (~30 min)
- **Total: ~7 hours**
