'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, ArrowRight } from 'lucide-react';
import { useLocation } from '@/hooks/useLocation';

// MapLibre must be loaded client-side only (no SSR)
const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

export default function MapPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const { location, setLocation } = useLocation();
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
  }

  function handleLocationSelect(lat: number, lng: number, address: string) {
    // Detect country by latitude/longitude (rough bounding box for Canada)
    const country: 'US' | 'CA' =
      lat >= 42 && lat <= 83 && lng >= -141 && lng <= -52 && lat > 49 ? 'CA' : 'US';

    setLocation({
      lat,
      lng,
      address,
      trade_area_miles: 5,
      income_threshold: country === 'CA' ? 150000 : 125000,
      country,
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">Site Map</h1>
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
            <Input
              placeholder="Search an address or location..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="icon" variant="outline">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          {location && (
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="secondary" className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                <span className="max-w-[200px] truncate">{location.address}</span>
              </Badge>
              <Button
                size="sm"
                onClick={() => router.push('/demographics')}
                className="flex items-center gap-1.5"
              >
                Analyze
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tip */}
      {!location && (
        <div className="px-4 py-2 bg-muted/50 border-b text-sm text-muted-foreground flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          Click anywhere on the map or search an address to begin site analysis
        </div>
      )}

      {/* Map — needs explicit height since parent is overflow-auto */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0">
          <MapView searchQuery={searchQuery} onLocationSelect={handleLocationSelect} />
        </div>
      </div>
    </div>
  );
}
