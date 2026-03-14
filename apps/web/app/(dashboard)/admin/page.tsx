'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Shield, Users, UserPlus, RefreshCw, AlertCircle, CheckCircle,
  UserX, Edit2, X, BarChart2, MapPin, BookOpen, Star,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'analyst' | 'viewer';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdminStats {
  users: { total: number; active: number; inactive: number };
  locations: { total: number; open: number; coming_soon: number; closed: number };
  analyses: {
    total: number;
    partners: number;
    score_distribution: Array<{ grade: string; count: number }>;
  };
  recent_analyses: Array<{
    id: string;
    address: string;
    score: number | null;
    letter_grade: string | null;
    country: string;
    created_at: string;
    user_id: string;
  }>;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  analyst: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-700',
};

interface CreateUserForm {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'analyst' | 'viewer';
}

interface EditUserForm {
  name: string;
  role: 'admin' | 'analyst' | 'viewer';
  is_active: boolean;
}

type TabName = 'overview' | 'users';

export default function AdminPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<TabName>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '', password: '', name: '', role: 'analyst',
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>({
    name: '', role: 'analyst', is_active: true,
  });
  const [editLoading, setEditLoading] = useState(false);

  // Guard
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/map');
    }
  }, [user, router]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!token) return;
    setStatsLoading(true);
    try {
      const data = await apiFetch<AdminStats>('/api/admin/stats', { token });
      setStats(data);
    } catch {
      // Stats are supplemental — don't block the UI
    } finally {
      setStatsLoading(false);
    }
  }, [token]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setUsersLoading(true);
    setError(null);
    try {
      const data = await apiFetch<UserRecord[]>('/api/users', { token });
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStats();
    fetchUsers();
  }, [fetchStats, fetchUsers]);

  function showSuccessMsg(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreateLoading(true);
    setError(null);
    try {
      const created = await apiFetch<UserRecord>('/api/users', {
        method: 'POST',
        token,
        body: JSON.stringify(createForm),
      });
      setUsers((prev) => [created, ...prev]);
      setShowCreate(false);
      setCreateForm({ email: '', password: '', name: '', role: 'analyst' });
      showSuccessMsg(`User ${created.email} created.`);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  }

  function startEdit(u: UserRecord) {
    setEditingId(u.id);
    setEditForm({ name: u.name, role: u.role, is_active: u.is_active });
    setError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editingId) return;
    setEditLoading(true);
    setError(null);
    try {
      const updated = await apiFetch<UserRecord>(`/api/users/${editingId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(editForm),
      });
      setUsers((prev) => prev.map((u) => (u.id === editingId ? { ...u, ...updated } : u)));
      setEditingId(null);
      showSuccessMsg('User updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!token || !confirm('Deactivate this user?')) return;
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE', token });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, is_active: false } : u)));
      showSuccessMsg('User deactivated.');
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user');
    }
  }

  if (user?.role !== 'admin') return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-purple-600" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground mt-1">User management and system administration</p>
        </div>
        <Button variant="outline" onClick={() => { fetchStats(); fetchUsers(); }} disabled={statsLoading || usersLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${statsLoading || usersLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 text-green-700 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['overview', 'users'] as TabName[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'overview' ? 'System Overview' : 'User Management'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {statsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <div className="h-8 bg-muted rounded animate-pulse mb-2" />
                    <div className="h-4 bg-muted/60 rounded animate-pulse w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : stats ? (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      Users
                    </CardDescription>
                    <CardTitle className="text-3xl">{stats.users.active}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {stats.users.total} total · {stats.users.inactive} inactive
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      Locations
                    </CardDescription>
                    <CardTitle className="text-3xl">{stats.locations.total}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {stats.locations.open} open · {stats.locations.coming_soon} coming soon
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4" />
                      Analyses
                    </CardDescription>
                    <CardTitle className="text-3xl">{stats.analyses.total}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {stats.analyses.partners} partners found
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <Star className="h-4 w-4" />
                      Score Distribution
                    </CardDescription>
                    <CardTitle className="text-3xl">
                      {stats.analyses.score_distribution.length > 0
                        ? stats.analyses.score_distribution[0].grade
                        : '—'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-1 flex-wrap">
                      {stats.analyses.score_distribution.map(({ grade, count }) => (
                        <Badge key={grade} variant="outline" className="text-xs">
                          {grade}: {count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Analyses */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Analyses</CardTitle>
                  <CardDescription>Last 10 analyses across all users</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.recent_analyses.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between p-2 rounded border text-sm"
                      >
                        <div>
                          <p className="font-medium truncate max-w-[300px]">{a.address}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(a.created_at).toLocaleDateString()} · {a.country}
                          </p>
                        </div>
                        {a.score !== null && (
                          <div className="text-right">
                            <p className="font-bold">{a.score}</p>
                            <p className="text-xs text-muted-foreground">{a.letter_grade}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No statistics available</p>
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreate(!showCreate)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>

          {/* Create Form */}
          {showCreate && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Create New User</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Name *</Label>
                      <Input
                        required
                        placeholder="Jane Smith"
                        value={createForm.name}
                        onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email *</Label>
                      <Input
                        required
                        type="email"
                        placeholder="jane@example.com"
                        value={createForm.email}
                        onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Password * (min 8 chars)</Label>
                      <Input
                        required
                        type="password"
                        minLength={8}
                        placeholder="••••••••"
                        value={createForm.password}
                        onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Role</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={createForm.role}
                        onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value as CreateUserForm['role'] }))}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="analyst">Analyst</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={createLoading}>
                      {createLoading ? 'Creating...' : 'Create User'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Users List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Users
                {!usersLoading && (
                  <Badge variant="secondary" className="text-xs">{users.length} total</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div key={u.id} className="rounded-lg border">
                      {editingId === u.id ? (
                        <form onSubmit={handleEdit} className="p-4 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <Label>Name</Label>
                              <Input
                                value={editForm.name}
                                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Role</Label>
                              <select
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                                value={editForm.role}
                                onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value as EditUserForm['role'] }))}
                              >
                                <option value="viewer">Viewer</option>
                                <option value="analyst">Analyst</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Active</Label>
                              <div className="flex items-center gap-2 h-9">
                                <input
                                  type="checkbox"
                                  checked={editForm.is_active}
                                  onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm">{editForm.is_active ? 'Active' : 'Inactive'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={editLoading}>
                              {editLoading ? 'Saving...' : 'Save'}
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between p-3 gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{u.name}</p>
                              {!u.is_active && (
                                <Badge variant="secondary" className="text-xs">Inactive</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Joined {new Date(u.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role]}`}>
                              {u.role}
                            </span>
                            {u.id !== user?.id && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => startEdit(u)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                {u.is_active && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeactivate(u.id)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <UserX className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
