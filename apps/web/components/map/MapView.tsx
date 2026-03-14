'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapViewProps {
  searchQuery?: string;
  onLocationSelect?: (lat: number, lng: number, address: string) => void;
}

export default function MapView({ searchQuery, onLocationSelect }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-98.5, 39.5], // Center of US
      zoom: 4,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.current.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }), 'top-right');

    map.current.on('load', () => setIsReady(true));

    // Click to place marker
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      placeMarker(lat, lng);
      onLocationSelect?.(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  function placeMarker(lat: number, lng: number) {
    if (!map.current) return;
    marker.current?.remove();
    marker.current = new maplibregl.Marker({ color: '#2563eb' })
      .setLngLat([lng, lat])
      .addTo(map.current);
    map.current.flyTo({ center: [lng, lat], zoom: 12, duration: 1000 });
  }

  // Handle search query changes
  useEffect(() => {
    if (!searchQuery || !isReady) return;

    // Geocode using Nominatim (OpenStreetMap)
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
      .then((r) => r.json())
      .then((results: Array<{ lat: string; lon: string; display_name: string }>) => {
        if (results.length > 0) {
          const { lat, lon, display_name } = results[0];
          const latNum = parseFloat(lat);
          const lngNum = parseFloat(lon);
          placeMarker(latNum, lngNum);
          onLocationSelect?.(latNum, lngNum, display_name);
        }
      })
      .catch(console.error);
  }, [searchQuery, isReady]);

  return (
    <div
      ref={mapContainer}
      className="w-full h-full"
      style={{ minHeight: '400px' }}
    />
  );
}
