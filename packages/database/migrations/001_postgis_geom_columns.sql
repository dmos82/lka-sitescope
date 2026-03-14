-- Migration 001: Add PostGIS geometry columns to tables managed by Prisma
-- Run after: prisma migrate dev
-- These columns are NOT managed by Prisma (requires postgis extension)

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column to lka_locations (not managed by Prisma schema)
ALTER TABLE lka_locations
  ADD COLUMN IF NOT EXISTS geom GEOMETRY(POINT, 4326);

-- Populate from existing lat/lng
UPDATE lka_locations
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE geom IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

-- Create spatial index
CREATE INDEX IF NOT EXISTS lka_locations_geom_idx ON lka_locations USING GIST(geom);

-- Trigger to auto-update geom when lat/lng changes
CREATE OR REPLACE FUNCTION update_lka_location_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lka_locations_geom_trigger ON lka_locations;
CREATE TRIGGER lka_locations_geom_trigger
  BEFORE INSERT OR UPDATE OF lat, lng ON lka_locations
  FOR EACH ROW EXECUTE FUNCTION update_lka_location_geom();
