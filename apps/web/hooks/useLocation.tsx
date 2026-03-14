'use client';

import React, { createContext, useContext, useState } from 'react';

export interface SelectedLocation {
  lat: number;
  lng: number;
  address: string;
  trade_area_miles: number;
  income_threshold: number;
  country: 'US' | 'CA';
}

interface LocationContextValue {
  location: SelectedLocation | null;
  setLocation: (loc: SelectedLocation | null) => void;
  updateTradeArea: (miles: number) => void;
  updateIncomeThreshold: (threshold: number) => void;
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

  return (
    <LocationContext.Provider value={{ location, setLocation, updateTradeArea, updateIncomeThreshold }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
