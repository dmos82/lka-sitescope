'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
  Map,
  BarChart2,
  Star,
  Users,
  MapPin,
  BookOpen,
  LogOut,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  { href: '/map', icon: Map, label: 'Map View' },
  { href: '/demographics', icon: BarChart2, label: 'Demographics' },
  { href: '/scoring', icon: Star, label: 'Scoring' },
  { href: '/partners', icon: Users, label: 'Partners' },
  { href: '/locations', icon: MapPin, label: 'LKA Locations' },
  { href: '/saved', icon: BookOpen, label: 'Saved Analyses' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <aside className="flex flex-col w-64 border-r bg-card h-screen sticky top-0">
      {/* Logo */}
      <div className="p-6 border-b">
        <h1 className="text-lg font-bold text-primary">LKA SiteScope</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Franchise Site Analysis</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
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
    </aside>
  );
}
