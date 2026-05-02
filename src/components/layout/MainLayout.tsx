import { ReactNode, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SyncStatusIndicator } from '@/components/common/SyncStatusIndicator';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="liquid-shell min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute right-[-6rem] top-1/3 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] p-0 border-r border-border/70 bg-sidebar">
          <Sidebar mobile onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="min-h-screen lg:ml-72">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <p className="text-sm font-semibold tracking-wide">SalesAI</p>
            <div className="flex items-center gap-2">
              <SyncStatusIndicator />
              <Button variant="ghost" size="icon" aria-label="Ouvrir le menu" onClick={() => setMobileOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-4 hidden justify-end lg:flex">
            <SyncStatusIndicator />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
