import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Commercial } from '@/types/meeting';
import { addCommercialRevenue } from '@/lib/commercialService';

interface AddRevenueFormProps {
  commercials: Commercial[];
  defaultCommercialId?: string;
  onSaved?: () => void;
}

export function AddRevenueForm({ commercials, defaultCommercialId, onSaved }: AddRevenueFormProps) {
  const [commercialId, setCommercialId] = useState(defaultCommercialId || (commercials[0]?.id ?? ''));
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('TND');
  const [source, setSource] = useState<'manual' | 'meeting' | 'import'>('manual');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!commercialId) return;
    setSaving(true);
    await addCommercialRevenue({
      commercialId,
      year,
      month,
      amount,
      currency,
      source,
    });
    setSaving(false);
    onSaved?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Les revenus sont stockés localement (offline-first). Vérifiez l'indicateur de synchronisation global pour l'état backend.
      </p>
      <div>
        <Label>Commercial</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={commercialId}
          onChange={(e) => setCommercialId(e.target.value)}
        >
          {commercials.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Année</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
        <div>
          <Label>Mois</Label>
          <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} />
        </div>
        <div>
          <Label>Montant</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Devise</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="TND">TND</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div>
          <Label>Source</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={source} onChange={(e) => setSource(e.target.value as any)}>
            <option value="manual">Saisie manuelle</option>
            <option value="meeting">Réunion</option>
            <option value="import">Import</option>
          </select>
        </div>
      </div>
      <Button type="button" onClick={handleSave} disabled={saving || !commercialId}>
        {saving ? 'Enregistrement...' : 'Ajouter le revenu'}
      </Button>
    </div>
  );
}
