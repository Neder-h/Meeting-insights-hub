import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Commercial, CommercialTarget } from '@/types/meeting';
import { getCommercialTarget, setCommercialTarget } from '@/lib/commercialService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SetTargetFormProps {
  commercials: Commercial[];
  onSaved?: () => void;
}

export function SetTargetForm({ commercials, onSaved }: SetTargetFormProps) {
  const first = commercials[0];
  const [selectedCommercialId, setSelectedCommercialId] = useState<string>(first?.id || '');
  const [year, setYear] = useState(new Date().getFullYear());
  const [annual, setAnnual] = useState<number>(0);
  const [q1, setQ1] = useState<number>(0);
  const [q2, setQ2] = useState<number>(0);
  const [q3, setQ3] = useState<number>(0);
  const [q4, setQ4] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('TND');
  const [saving, setSaving] = useState(false);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCommercialId && first) {
      setSelectedCommercialId(first.id);
    }
  }, [first, selectedCommercialId]);

  const loadTarget = async (commercialId: string, targetYear: number) => {
    if (!commercialId) return;
    setLoadingTarget(true);
    const existing = await getCommercialTarget(commercialId, targetYear);
    if (existing) {
      setTargetId(existing.id);
      setYear(existing.year);
      setAnnual(existing.annualTarget);
      setQ1(existing.q1Target);
      setQ2(existing.q2Target);
      setQ3(existing.q3Target);
      setQ4(existing.q4Target);
      setCurrency(existing.currency);
    } else {
      setTargetId(null);
      setAnnual(0);
      setQ1(0);
      setQ2(0);
      setQ3(0);
      setQ4(0);
      setCurrency('TND');
    }
    setLoadingTarget(false);
  };

  useEffect(() => {
    if (selectedCommercialId) {
      loadTarget(selectedCommercialId, year);
    }
  }, [selectedCommercialId, year]);

  useEffect(() => {
    const sum = q1 + q2 + q3 + q4;
    if (annual === 0 && sum > 0) setAnnual(sum);
  }, [q1, q2, q3, q4]);

  const autoSplit = () => {
    if (annual <= 0) return;
    const split = Math.round(annual / 4);
    setQ1(split);
    setQ2(split);
    setQ3(split);
    setQ4(split);
  };

  const handleSave = async () => {
    setSaving(true);
    await setCommercialTarget({
      id: targetId || crypto.randomUUID(),
      commercialId: selectedCommercialId,
      year,
      annualTarget: annual,
      q1Target: q1,
      q2Target: q2,
      q3Target: q3,
      q4Target: q4,
      currency,
      createdBy: undefined,
      lastUpdated: new Date().toISOString(),
    });
    setSaving(false);
    onSaved?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Les objectifs sont gérés en cache local (offline-first). L'indicateur de sync affiche les éléments en attente ou en conflit.
      </p>
      <div>
        <Label>Commercial</Label>
        <Select value={selectedCommercialId} onValueChange={(v) => setSelectedCommercialId(v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sélectionner un commercial" />
          </SelectTrigger>
          <SelectContent>
            {commercials.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Année</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
        <div>
          <Label>Devise</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="TND">TND</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      <div>
        <Label>Objectif annuel</Label>
        <Input type="number" value={annual} onChange={(e) => setAnnual(Number(e.target.value))} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Label>Q1</Label>
          <Input type="number" value={q1} onChange={(e) => setQ1(Number(e.target.value))} />
        </div>
        <div>
          <Label>Q2</Label>
          <Input type="number" value={q2} onChange={(e) => setQ2(Number(e.target.value))} />
        </div>
        <div>
          <Label>Q3</Label>
          <Input type="number" value={q3} onChange={(e) => setQ3(Number(e.target.value))} />
        </div>
        <div>
          <Label>Q4</Label>
          <Input type="number" value={q4} onChange={(e) => setQ4(Number(e.target.value))} />
        </div>
      </div>

      {loadingTarget && <p className="text-xs text-muted-foreground">Chargement de la cible...</p>}

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={autoSplit}>
          Répartir par défaut
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving || !selectedCommercialId}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
