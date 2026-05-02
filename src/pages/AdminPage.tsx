import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Shield, User, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { getProcessingDiagnostics, ProcessingDiagnosticsResponse } from '@/lib/api';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
  created_at: string;
}

interface UserMeetingStats {
  userId: string;
  count: number;
}

export default function AdminPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [meetingStats, setMeetingStats] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ProcessingDiagnosticsResponse | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

  const fetchUsers = async () => {
    try {
      const data = await apiClient.get<any[]>('/users');
      const users = data.map((u: any) => ({
        id: u.id || u._id,
        email: u.email,
        full_name: u.full_name || null,
        role: u.role,
        created_at: u.created_at || u.createdAt || '',
      }));
      setUsers(users);

      // Meeting counts come from the API (meeting_count field)
      const counts = new Map<string, number>();
      for (const u of data) {
        counts.set(u.id || u._id, u.meeting_count || 0);
      }
      setMeetingStats(counts);
    } catch (err) {
      console.error('Error fetching users:', err);
      toast.error('Erreur lors du chargement des utilisateurs');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    let mounted = true;
    const loadDiagnostics = async () => {
      setLoadingDiagnostics(true);
      try {
        const data = await getProcessingDiagnostics();
        if (!mounted) return;
        setDiagnostics(data);
      } catch {
        if (mounted) setDiagnostics(null);
      } finally {
        if (mounted) setLoadingDiagnostics(false);
      }
    };

    loadDiagnostics();
    const timer = setInterval(loadDiagnostics, 15000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      await apiClient.post('/users', {
        email: newEmail,
        password: newPassword,
        full_name: newName || newEmail,
      });

      toast.success(`Utilisateur ${newEmail} créé avec succès`);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la création');
    }
    setIsCreating(false);
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Supprimer l'utilisateur ${userEmail} et toutes ses données ?`)) return;

    try {
      await apiClient.del(`/users/${userId}`);
      toast.success(`Utilisateur ${userEmail} supprimé`);
      fetchUsers();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Erreur lors de la suppression');
    }
  };

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-destructive">Accès non autorisé</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="animate-fade-in">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              <span className="gradient-text">Administration</span>
            </h1>
            <p className="mt-1 text-muted-foreground">
              Gérer les utilisateurs et les données
            </p>
          </div>
          <Button variant="gradient" onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="h-5 w-5" />
            Nouvel utilisateur
          </Button>
        </div>

        {showCreateForm && (
          <Card className="glass-card mb-8 animate-fade-in">
            <CardHeader>
              <CardTitle className="text-lg">Créer un utilisateur</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Nom complet</label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nom complet"
                      className="bg-muted/50"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Email *</label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="user@email.com"
                      className="bg-muted/50"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium">Mot de passe *</label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 6 caractères"
                      className="bg-muted/50"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Création...
                      </>
                    ) : (
                      'Créer'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                  >
                    Annuler
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Utilisateurs ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        {u.role === 'admin' ? (
                          <Shield className="h-5 w-5 text-primary" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{u.full_name || u.email}</p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {meetingStats.get(u.id) || 0} réunion(s)
                      </span>
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                        {u.role === 'admin' ? 'Admin' : 'Utilisateur'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString('fr-FR')}
                      </span>
                      {u.id !== currentUser?.id && u.role !== 'admin' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteUser(u.id, u.email)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Processing diagnostics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDiagnostics ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !diagnostics ? (
              <p className="text-sm text-muted-foreground">Aucune donnée de diagnostic disponible.</p>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Queue mode</div>
                    <div className="font-semibold mt-1">{diagnostics.queue.mode}</div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Queue connected</div>
                    <div className="font-semibold mt-1">{diagnostics.queue.connected ? 'yes' : 'no'}</div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Recent failures</div>
                    <div className="font-semibold mt-1">{diagnostics.summary.recentFailureCount}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Queue health</h3>
                  <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
                    {Object.entries(diagnostics.queue.counts).map(([k, v]) => (
                      <div key={k} className="rounded border border-border p-2 text-center">
                        <div className="text-xs text-muted-foreground">{k}</div>
                        <div className="font-semibold">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Recent failures</h3>
                    <div className="space-y-2 max-h-64 overflow-auto pr-1">
                      {diagnostics.failures.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun échec récent.</p>
                      ) : diagnostics.failures.map((f) => (
                        <div key={f.id} className="rounded border border-border p-3 text-xs">
                          <div className="font-medium">{f.title}</div>
                          <div className="text-muted-foreground">{f.error_message || 'Unknown error'}</div>
                          <div className="mt-1 text-muted-foreground">{f.updated_at ? new Date(f.updated_at).toLocaleString('fr-FR') : '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">Recent queue / processing events</h3>
                    <div className="space-y-2 max-h-64 overflow-auto pr-1">
                      {diagnostics.events.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun événement.</p>
                      ) : diagnostics.events.slice(0, 60).map((e) => (
                        <div key={e.id} className="rounded border border-border p-3 text-xs">
                          <div className="font-medium">{e.event_type}</div>
                          <div className="text-muted-foreground">{new Date(e.created_at).toLocaleString('fr-FR')}</div>
                          {e.metadata?.error ? (
                            <div className="text-destructive mt-1">{String(e.metadata.error)}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
