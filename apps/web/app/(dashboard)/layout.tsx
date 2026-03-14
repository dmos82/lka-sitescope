'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { LocationProvider } from '@/hooks/useLocation';
import { Sidebar, MobileNav } from '@/components/layout/Sidebar';

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <LocationProvider>
      {/* Mobile: hamburger + drawer */}
      <MobileNav />
      <div className="flex h-screen overflow-hidden">
        {/* Desktop: permanent sidebar */}
        <Sidebar />
        {/* Main content — on mobile add left padding for hamburger button */}
        <main className="flex-1 overflow-auto md:pt-0 pt-14 flex flex-col">{children}</main>
      </div>
    </LocationProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardInner>{children}</DashboardInner>
    </AuthProvider>
  );
}
