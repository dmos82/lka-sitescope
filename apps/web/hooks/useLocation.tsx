'use client';

import React, { createContext, useContext, useState } from 'react';

export interface SelectedLocation {
  lat: number;
  lng: number;
  address: string;
  /** Detected city/town name (from boundary lookup or geocoder) */
  city_name?: string;
  /** GEOID of the selected city/place when in city boundary click mode */
  city_geoid?: string;
  /** 'city' = city boundary click mode, 'radius' = normal coordinate mode */
  mode?: 'city' | 'radius';
  trade_area_miles: number;
  income_threshold: number;
  country: 'US' | 'CA';
}

interface LocationContextValue {
  location: SelectedLocation | null;
  setLocation: (loc: SelectedLocation | null) => void;
  updateTradeArea: (miles: number) => void;
  updateIncomeThreshold: (threshold: number) => void;
  updateCityName: (name: string) => void;
  updateCityGeoid: (geoid: string) => void;
  updateMode: (mode: 'city' | 'radius') => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<SelectedLocation | null>(null);

  function setLocation(loc: SelectedLocation | null) {
    setLocationState(loc);
  }

  function updateTradeArea(miles: number) {
    setLocationState((prev) => (prev ? { ...prev, trade_area_miles: miles } : null));
  }

  function updateIncomeThreshold(threshold: number) {
    setLocationState((prev) => (prev ? { ...prev, income_threshold: threshold } : null));
  }

  function updateCityName(name: string) {
    setLocationState((prev) => (prev ? { ...prev, city_name: name } : null));
  }

  function updateCityGeoid(geoid: string) {
    setLocationState((prev) => (prev ? { ...prev, city_geoid: geoid } : null));
  }

  function updateMode(mode: 'city' | 'radius') {
    setLocationState((prev) => (prev ? { ...prev, mode } : null));
  }

  return (
    <LocationContext.Provider value={{ location, setLocation, updateTradeArea, updateIncomeThreshold, updateCityName, updateCityGeoid, updateMode }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
