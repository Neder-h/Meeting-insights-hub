import { useState, useEffect } from 'react';
import { Check, X, Sparkles, Shield, ExternalLink, RefreshCw, Target } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  checkGeminiConfigured,
  invalidateGeminiCache,
} from '@/lib/geminiAnalysis';
import {
  getAnnualRevenue,
  getMonthlyBreakdown,
  updateAnnualRevenue,
  addMonthlyRevenue,
  recalculateTotals,
} from '@/lib/revenueService';

export default function SettingsPage() {
  const { toast } = useToast();
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [currency, setCurrency] = useState<string>('TND');
  const [target, setTarget] = useState<number | undefined>(undefined);
  const [monthly, setMonthly] = useState<Record<number, number>>({});
  const [isSavingRevenue, setIsSavingRevenue] = useState(false);

  const refreshStatus = async () => {
    setIsChecking(true);
    invalidateGeminiCache();
    try {
      const configured = await checkGeminiConfigured();
      setIsConfigured(configured);
    } catch {
      setIsConfigured(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    const loadRevenue = async () => {
      try {
        const annual = await getAnnualRevenue(year);
        const breakdown = await getMonthlyBreakdown(year);
        if (annual?.currency) setCurrency(annual.currency);
        if (annual?.target !== undefined) setTarget(annual.target);
        const map: Record<number, number> = {};
        breakdown.forEach(m => {
          map[m.month] = m.amount;
          if (!annual?.currency && m.currency) setCurrency(m.currency);
        });
        setMonthly(map);
      } catch (e) {
        console.error('Failed to load revenue data', e);
      }
    };
    loadRevenue();
  }, [year]);

  const handleRefresh = async () => {
    await refreshStatus();
    toast({
      title: 'Statut actualisé',
      description: isConfigured
        ? 'La clé API Gemini est bien configurée sur le backend.'
        : 'Aucune clé API Gemini détectée sur le backend.',
    });
  };

  const handleSaveRevenue = async () => {
    setIsSavingRevenue(true);
    try {
      // Persist monthly values
      await Promise.all(
        Object.entries(monthly).map(([month, amount]) =>
          addMonthlyRevenue({
            year,
            month: Number(month),
            amount: Number(amount) || 0,
            currency,
          })
        )
      );

      // Update target/currency
      await updateAnnualRevenue(year, { target, currency });

      // Recalculate totals
      await recalculateTotals(year);

      toast({
        title: 'Revenus enregistrés',
        description: 'Les totaux annuels et YTD ont été recalculés.',
      });
    } catch (e: any) {
      toast({
        title: 'Erreur',
        description: e?.message || 'Impossible de sauvegarder les revenus',
        variant: 'destructive',
      });
    } finally {
      setIsSavingRevenue(false);
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold">
            <span className="gradient-text">Paramètres</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Configurez vos services d'intelligence artificielle
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {/* Gemini API Configuration */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Google Gemini API</CardTitle>
                    <CardDescription>
                      Analyse IA des réunions en arabe tunisien et français
                    </CardDescription>
                  </div>
                </div>
                {isConfigured === null ? (
                  <Badge variant="secondary">Vérification...</Badge>
                ) : (
                  <Badge variant={isConfigured ? 'default' : 'secondary'}>
                    {isConfigured ? '✓ Configuré' : 'Non configuré'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span>
                    Gemini comprend nativement l'arabe tunisien (Derja). Quand la clé API est configurée, 
                    la transcription brute est envoyée directement à Gemini pour l'analyse — 
                    <strong> pas besoin de traduction</strong>. Sans clé API, le système utilise l'analyse 
                    par mots-clés (français uniquement, nécessite traduction).
                  </span>
                </p>
              </div>

              {/* Backend configuration instructions */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <h4 className="font-medium text-sm">Comment configurer</h4>
                <ol className="list-decimal ml-5 space-y-2 text-sm text-muted-foreground">
                  <li>
                    Obtenez votre clé API sur{' '}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Google AI Studio <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>
                    Créez un fichier <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">.env</code> dans le dossier{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">local-whisper/</code>{' '}
                    (copiez <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">.env.example</code>)
                  </li>
                  <li>
                    Ajoutez votre clé :{' '}
                    <code className="block mt-1 rounded bg-muted px-3 py-2 text-xs font-mono">
                      GEMINI_API_KEY=AIzaSy...votre_clé_ici
                    </code>
                  </li>
                  <li>Redémarrez le service local-whisper (port 9000)</li>
                </ol>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={isChecking}
                >
                  {isChecking ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Vérification...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Vérifier le statut
                    </>
                  )}
                </Button>
              </div>

              {isConfigured === true && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  Clé API Gemini détectée sur le backend — l'analyse IA est opérationnelle
                </div>
              )}
              {isConfigured === false && (
                <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-600">
                  <X className="h-4 w-4" />
                  Aucune clé API détectée — suivez les instructions ci-dessus pour configurer
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Mode Info */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Mode d'analyse actuel</CardTitle>
            </CardHeader>
            <CardContent>
              {isConfigured ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="font-medium">Gemini AI (Actif)</span>
                  </div>
                  <ul className="ml-5 space-y-1 text-sm text-muted-foreground list-disc">
                    <li>Comprend l'arabe tunisien (Derja) nativement</li>
                    <li>Pas besoin de traduction avant l'analyse</li>
                    <li>Analyse contextuelle avancée par IA</li>
                    <li>Détection précise des étapes de vente et du sentiment</li>
                    <li>Clé API sécurisée côté serveur (jamais exposée au navigateur)</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <span className="font-medium">Analyse par mots-clés (Fallback)</span>
                  </div>
                  <ul className="ml-5 space-y-1 text-sm text-muted-foreground list-disc">
                    <li>Fonctionne uniquement avec les transcriptions en français</li>
                    <li>Nécessite la traduction NLLB-200 (port 9100)</li>
                    <li>Détection basée sur des mots-clés prédéfinis</li>
                    <li>Résultats moins précis qu'avec Gemini</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue configuration */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-blue-500">
                  <Target className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Objectifs de chiffre d'affaires</CardTitle>
                  <CardDescription>Définissez vos revenus et objectifs annuels</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Année</label>
                  <input
                    type="number"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Devise</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="TND">TND (dinar)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Objectif annuel</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={target ?? ''}
                    onChange={(e) => setTarget(e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="1 000 000"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left">Mois</th>
                      <th className="px-4 py-2 text-left">Revenu ({currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }).map((_, idx) => {
                      const month = idx + 1;
                      return (
                        <tr key={month} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                          <td className="px-4 py-2 font-medium">{new Date(2000, month - 1, 1).toLocaleString('fr-FR', { month: 'short' })}</td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min={0}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={monthly[month] ?? ''}
                              onChange={(e) =>
                                setMonthly((prev) => ({
                                  ...prev,
                                  [month]: e.target.value === '' ? 0 : Number(e.target.value),
                                }))
                              }
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end">
                <Button onClick={handleSaveRevenue} disabled={isSavingRevenue}>
                  {isSavingRevenue ? 'Enregistrement...' : 'Enregistrer les revenus'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
