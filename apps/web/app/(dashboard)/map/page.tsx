'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

// MapLibre must be loaded client-side only (no SSR)
const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

export default function MapPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
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
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapView searchQuery={searchQuery} />
      </div>
    </div>
  );
}
