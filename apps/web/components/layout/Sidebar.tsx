'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Map,
  BarChart2,
  Star,
  Users,
  MapPin,
  BookOpen,
  LogOut,
  ChevronRight,
  Shield,
  GitCompare,
  Menu,
  X,
} from 'lucide-react';

const mainNavItems = [
  { href: '/map', icon: Map, label: 'Map View' },
  { href: '/demographics', icon: BarChart2, label: 'Demographics' },
  { href: '/scoring', icon: Star, label: 'Scoring' },
  { href: '/compare', icon: GitCompare, label: 'Compare Sites' },
  { href: '/partners', icon: Users, label: 'Partners' },
  { href: '/locations', icon: MapPin, label: 'LKA Locations' },
  { href: '/saved', icon: BookOpen, label: 'Saved Analyses' },
];

function NavContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <>
      {/* Logo */}
      <div className="p-6 border-b">
        <h1 className="text-lg font-bold text-primary">LKA SiteScope</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Franchise Site Analysis</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {mainNavItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {active && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>
          );
        })}

        {/* Admin-only section */}
        {user?.role === 'admin' && (
          <>
            <div className="pt-3 pb-1">
              <p className="text-xs font-medium text-muted-foreground/60 px-3 uppercase tracking-wider">
                Admin
              </p>
            </div>
            <Link
              href="/admin"
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname === '/admin'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Shield className="h-4 w-4 shrink-0" />
              Admin Panel
              {pathname === '/admin' && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t">
        <div className="mb-2">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          <span className="text-xs capitalize text-muted-foreground">{user?.role}</span>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </>
  );
}

/** Desktop: permanent sidebar */
export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-card h-screen sticky top-0 shrink-0">
      <NavContent />
    </aside>
  );
}

/** Mobile: hamburger button + drawer */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Hamburger button — only visible on mobile */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-md bg-card border shadow-sm"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close navigation' : 'Open navigation'}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 z-50 h-full w-72 bg-card border-r flex flex-col',
          'transform transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <NavContent onNavClick={() => setOpen(false)} />
      </aside>
    </>
  );
}
