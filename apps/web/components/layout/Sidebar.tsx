'use client';

import Link from 'next/link';
import Image from 'next/image';
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
      <div className="p-5 border-b border-white/10">
        <Image
          src="/lka-logo.svg"
          alt="Little Kitchen Academy"
          width={160}
          height={32}
          className="brightness-0 invert"
          priority
        />
        <p className="text-xs mt-2" style={{ color: 'var(--sidebar-muted)' }}>
          Franchise Site Analysis
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
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
                  ? 'text-white'
                  : 'text-white/70 hover:text-white'
              )}
              style={
                active
                  ? { backgroundColor: 'var(--sidebar-active-bg)' }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    'var(--sidebar-hover-bg)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '';
                }
              }}
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
              <p className="text-xs font-medium px-3 uppercase tracking-wider" style={{ color: 'var(--sidebar-muted)' }}>
                Admin
              </p>
            </div>
            <Link
              href="/admin"
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname === '/admin'
                  ? 'text-white'
                  : 'text-white/70 hover:text-white'
              )}
              style={
                pathname === '/admin'
                  ? { backgroundColor: 'var(--sidebar-active-bg)' }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (pathname !== '/admin') {
                  (e.currentTarget as HTMLElement).style.backgroundColor =
                    'var(--sidebar-hover-bg)';
                }
              }}
              onMouseLeave={(e) => {
                if (pathname !== '/admin') {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '';
                }
              }}
            >
              <Shield className="h-4 w-4 shrink-0" />
              Admin Panel
              {pathname === '/admin' && <ChevronRight className="ml-auto h-4 w-4" />}
            </Link>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-white/10">
        <div className="mb-2">
          <p className="text-sm font-medium text-white truncate">{user?.name}</p>
          <p className="text-xs truncate" style={{ color: 'var(--sidebar-muted)' }}>
            {user?.email}
          </p>
          <span className="text-xs capitalize" style={{ color: 'var(--sidebar-muted)' }}>
            {user?.role}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/10"
          onClick={handleLogout}
        >
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
    <aside
      className="hidden md:flex flex-col w-64 h-screen sticky top-0 shrink-0"
      style={{ backgroundColor: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)' }}
    >
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
          'md:hidden fixed top-0 left-0 z-50 h-full w-72 flex flex-col',
          'transform transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ backgroundColor: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)' }}
      >
        <NavContent onNavClick={() => setOpen(false)} />
      </aside>
    </>
  );
}
