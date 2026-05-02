import { Link } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Filter, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MeetingCard } from '@/components/dashboard/MeetingCard';
import { useMeetingsPaginated } from '@/hooks/useMeetings';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SalesStage, Sentiment } from '@/types/meeting';
import { VirtualizedList } from '@/components/common/VirtualizedList';
import { searchMeetingsKeyword } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

export default function MeetingsListPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStages, setSelectedStages] = useState<SalesStage[]>([]);
  const [selectedSentiments, setSelectedSentiments] = useState<Sentiment[]>([]);
  const [page, setPage] = useState(1);
  const [advancedSearch, setAdvancedSearch] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const stageFilter = selectedStages.length === 1 ? selectedStages[0] : undefined;
  const sentimentFilter = selectedSentiments.length === 1 ? selectedSentiments[0] : undefined;

  const {
    data: meetingsPage,
    isLoading,
    error,
    isFetching,
  } = useMeetingsPaginated({
    page,
    limit: 18,
    search: debouncedSearch || undefined,
    stage: stageFilter,
    sentiment: sentimentFilter,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const {
    data: searchPage,
    isLoading: loadingSearch,
    isFetching: fetchingSearch,
    error: searchError,
  } = useQuery({
    queryKey: ['meetings', 'search-keyword', debouncedSearch, page],
    queryFn: () => searchMeetingsKeyword({ q: debouncedSearch, page, limit: 18 }),
    enabled: advancedSearch && debouncedSearch.length > 1,
    staleTime: 20_000,
  });

  const effectivePage = (advancedSearch && debouncedSearch.length > 1) ? searchPage : meetingsPage;
  const meetings = effectivePage?.items || [];
  const total = effectivePage?.pagination.total || 0;
  const totalPages = effectivePage?.pagination.totalPages || 1;
  const isSearchMode = advancedSearch && debouncedSearch.length > 1;

  const handleDeleteMeeting = async () => {
    await queryClient.invalidateQueries({ queryKey: ['meetings'] });
    await queryClient.refetchQueries({ queryKey: ['meetings', 'paginated'] });
  };

  const toggleStage = (stage: SalesStage) => {
    setSelectedStages(prev =>
      prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]
    );
    setPage(1);
  };

  const toggleSentiment = (sentiment: Sentiment) => {
    setSelectedSentiments(prev =>
      prev.includes(sentiment) ? prev.filter(s => s !== sentiment) : [...prev, sentiment]
    );
    setPage(1);
  };

  const clearFilters = () => {
    setSelectedStages([]);
    setSelectedSentiments([]);
    setPage(1);
  };

  const activeFiltersCount = selectedStages.length + selectedSentiments.length + (isSearchMode ? 1 : 0);

  return (
    <MainLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Mes Réunions</h1>
            <p className="mt-1 text-muted-foreground">
              {total || 0} réunion{total > 1 ? 's' : ''} {debouncedSearch || activeFiltersCount > 0 ? 'trouvée' + (total > 1 ? 's' : '') : 'enregistrée' + (total > 1 ? 's' : '')}
            </p>
          </div>
          <Button asChild variant="gradient">
            <Link to="/">
              <Plus className="h-5 w-5" />
              Nouvelle réunion
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-8 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher une réunion..."
              className="pl-10 bg-muted/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant={advancedSearch ? 'default' : 'outline'}
            onClick={() => setAdvancedSearch((v) => !v)}
          >
            Recherche texte avancée
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter className="h-4 w-4" />
                Filtres
                {activeFiltersCount > 0 && (
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Étape de vente</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={selectedStages.includes('contact_visits')}
                onCheckedChange={() => toggleStage('contact_visits')}
              >
                Visites & Contacts
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedStages.includes('value_proposition')}
                onCheckedChange={() => toggleStage('value_proposition')}
              >
                Proposition de valeur
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedStages.includes('offer_negotiation')}
                onCheckedChange={() => toggleStage('offer_negotiation')}
              >
                Négociation
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedStages.includes('closing')}
                onCheckedChange={() => toggleStage('closing')}
              >
                Clôture
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedStages.includes('closed_lost')}
                onCheckedChange={() => toggleStage('closed_lost')}
              >
                Perdu
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel>Sentiment</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={selectedSentiments.includes('positive')}
                onCheckedChange={() => toggleSentiment('positive')}
              >
                Positif
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedSentiments.includes('neutral')}
                onCheckedChange={() => toggleSentiment('neutral')}
              >
                Neutre
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={selectedSentiments.includes('negative')}
                onCheckedChange={() => toggleSentiment('negative')}
              >
                Négatif
              </DropdownMenuCheckboxItem>

              {activeFiltersCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={clearFilters}
                  >
                    Réinitialiser
                  </Button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Loading State */}
        {(isLoading || loadingSearch) && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Error State */}
        {(error || searchError) && (
          <div className="glass-card rounded-xl p-8 text-center">
            <p className="text-destructive">
              Erreur lors du chargement des réunions
            </p>
          </div>
        )}

        {/* Meetings Grid */}
        {meetings.length > 0 && (
          <>
            {meetings.length > 10 ? (
              <VirtualizedList
                items={meetings}
                itemHeight={320}
                height={960}
                className="rounded-xl"
                renderItem={(meeting) => (
                  <div className="pb-6">
                    <MeetingCard meeting={meeting} onDelete={handleDeleteMeeting} />
                    {isSearchMode && Array.isArray((meeting as any).searchMatches) && (meeting as any).searchMatches.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(meeting as any).searchMatches.slice(0, 5).map((m: string, idx: number) => (
                          <span key={`${meeting.id}-match-${idx}`} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              />
            ) : (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {meetings.map((meeting, index) => (
                  <div
                    key={meeting.id}
                    className="animate-slide-up"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <MeetingCard meeting={meeting} onDelete={handleDeleteMeeting} />
                    {isSearchMode && Array.isArray((meeting as any).searchMatches) && (meeting as any).searchMatches.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(meeting as any).searchMatches.slice(0, 5).map((m: string, idx: number) => (
                          <span key={`${meeting.id}-match-grid-${idx}`} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} / {totalPages} · {total} total
                {isFetching || fetchingSearch ? ' · mise à jour…' : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching || fetchingSearch}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isFetching || fetchingSearch}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </>
        )}

        {/* No Results State */}
        {total === 0 && (debouncedSearch || activeFiltersCount > 0) && (
          <div className="mt-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Aucun résultat</h2>
            <p className="mt-2 text-muted-foreground">
              Essayez de modifier vos critères de recherche
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => {
                setSearchQuery('');
                clearFilters();
              }}
            >
              Réinitialiser les filtres
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && total === 0 && !debouncedSearch && activeFiltersCount === 0 && (
          <div className="mt-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Aucune réunion</h2>
            <p className="mt-2 text-muted-foreground">
              Commencez par enregistrer votre première réunion
            </p>
            <Button asChild variant="gradient" className="mt-6">
              <Link to="/">
                <Plus className="h-5 w-5" />
                Nouvelle réunion
              </Link>
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
