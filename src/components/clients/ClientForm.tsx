import { useState } from 'react';
import { Client, ClientStatus } from '@/types/meeting';
import { markClientConflictResolvedKeepLocal, overwriteClientWithServer, updateClient } from '@/lib/clientService';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { runBackgroundSync } from '@/services/syncService';

interface ClientFormProps {
  client: Client;
  onSaved?: (updated: Client) => void;
}

const statusOptions: ClientStatus[] = ['prospect', 'active', 'inactive', 'churned'];

export function ClientForm({ client, onSaved }: ClientFormProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<Client>({ ...client });
  const [saving, setSaving] = useState(false);

  const handleChange = (key: keyof Client, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateClient(client.id, form);
      onSaved?.({ ...form, id: client.id });
      toast({ title: 'Client mis à jour', description: form.name });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erreur', description: err instanceof Error ? err.message : 'Impossible de mettre à jour le client' });
    } finally {
      setSaving(false);
    }
  };

  const handleKeepLocalAndRetry = async () => {
    await markClientConflictResolvedKeepLocal(client.id);
    await runBackgroundSync().catch(() => {});
    toast({ title: 'Resync lancé', description: 'Votre version locale sera renvoyée.' });
  };

  const handleUseServerVersion = async () => {
    const updated = await overwriteClientWithServer(client.id);
    if (updated) {
      setForm(updated);
      onSaved?.(updated);
      toast({ title: 'Version serveur restaurée' });
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {form.syncMeta?.syncState && form.syncMeta.syncState !== 'synced' && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">
            {form.syncMeta.syncState === 'local-only' && 'Ce client existe uniquement en local.'}
            {form.syncMeta.syncState === 'pending' && 'Des modifications locales sont en attente de sync.'}
            {form.syncMeta.syncState === 'conflicted' && 'Conflit de synchronisation détecté.'}
          </p>
          {form.syncMeta.syncState === 'conflicted' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={handleKeepLocalAndRetry}>
                Garder ma version locale
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleUseServerVersion}>
                Reprendre version serveur
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Nom *</Label>
          <Input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
        </div>
        <div>
          <Label>Statut</Label>
          <Select value={form.status} onValueChange={(v) => handleChange('status', v as ClientStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Industrie</Label>
          <Input value={form.industry || ''} onChange={(e) => handleChange('industry', e.target.value)} />
        </div>
        <div>
          <Label>Contact principal</Label>
          <Input value={form.contactPerson || ''} onChange={(e) => handleChange('contactPerson', e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email || ''} onChange={(e) => handleChange('email', e.target.value)} />
        </div>
        <div>
          <Label>Téléphone</Label>
          <Input value={form.phone || ''} onChange={(e) => handleChange('phone', e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Site web</Label>
          <Input value={form.website || ''} onChange={(e) => handleChange('website', e.target.value)} />
        </div>
        <div>
          <Label>Adresse</Label>
          <Input value={form.address || ''} onChange={(e) => handleChange('address', e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes || ''} onChange={(e) => handleChange('notes', e.target.value)} rows={3} />
        <p className="mt-1 text-xs text-muted-foreground">
          Les notes sont modifiables hors-ligne et seront synchronisées automatiquement.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
      </div>
    </form>
  );
}
