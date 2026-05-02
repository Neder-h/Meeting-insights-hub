import { useEffect, useMemo, useState } from 'react';
import { ChevronsUpDown, Plus, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/types/meeting';
import { createClient, getAllClients, searchClients } from '@/lib/clientService';

interface ClientSelectorProps {
  value: Client | null;
  onChange: (client: Client | null) => void;
  placeholder?: string;
  allowCreate?: boolean;
}

export function ClientSelector({ value, onChange, placeholder = 'Sélectionner un client', allowCreate = true }: ClientSelectorProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const [newContact, setNewContact] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = query ? await searchClients(query) : await getAllClients();
    setClients(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [query]);

  const handleSelect = (client: Client) => {
    onChange(client);
    setOpen(false);
  };

  const filtered = useMemo(() => clients, [clients]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast({ variant: 'destructive', title: 'Nom requis', description: 'Ajoutez un nom de client.' });
      return;
    }
    setCreating(true);
    try {
      const client = await createClient({
        id: undefined,
        name: newName.trim(),
        industry: newIndustry || undefined,
        contactPerson: newContact || undefined,
        status: 'prospect',
        tags: [],
        totalMeetings: 0,
        totalRevenue: 0,
      });
      setClients((prev) => [client, ...prev]);
      onChange(client);
      setCreateMode(false);
      setOpen(false);
      setNewName('');
      setNewIndustry('');
      setNewContact('');
      toast({ title: 'Client créé', description: `${client.name} ajouté.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erreur', description: err instanceof Error ? err.message : 'Création impossible' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Client</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{value ? value.name : placeholder}</span>
            </div>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Rechercher un client" value={query} onValueChange={setQuery} />
            <CommandList>
              {loading && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement...
                </div>
              )}
              {!loading && (
                <>
                  <CommandEmpty>Aucun client trouvé</CommandEmpty>
                  <CommandGroup heading="Clients">
                    {filtered.map((client) => (
                      <CommandItem key={client.id} onSelect={() => handleSelect(client)}>
                        <div className="flex flex-col">
                          <span className="font-medium">{client.name}</span>
                          <span className="text-xs text-muted-foreground">{client.industry || client.contactPerson || client.email || 'Aucune info'}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {allowCreate && query && (
                    <CommandGroup>
                      <CommandItem onSelect={() => setCreateMode(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Créer "{query}"
                      </CommandItem>
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {createMode && allowCreate && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <Label>Nom du client</Label>
            <Input value={newName || query} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: ABC Corp" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Industrie</Label>
              <Input value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} placeholder="Technologie" />
            </div>
            <div>
              <Label>Contact principal</Label>
              <Input value={newContact} onChange={(e) => setNewContact(e.target.value)} placeholder="Nom" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? 'Création...' : 'Créer et sélectionner'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreateMode(false)}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  );
}
