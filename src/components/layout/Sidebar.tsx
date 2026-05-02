import { NavLink } from 'react-router-dom';
import {
  Mic,
  LayoutDashboard,
  FileText, 
  Settings,
  Brain,
  TrendingUp,
  Shield,
  LogOut,
  User,
  Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ mobile = false, onNavigate }: SidebarProps = {}) {
  const { profile, isAdmin, signOut } = useAuth();

  const navItems = [
    { icon: Mic, label: 'Enregistrer', path: '/' },
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: Building2, label: 'Clients', path: '/clients' },
    { icon: FileText, label: 'Toutes les réunions', path: '/meetings' },
    { icon: TrendingUp, label: 'Performance', path: '/performance' },
    { icon: Settings, label: 'Paramètres', path: '/settings' },
    ...(isAdmin ? [{ icon: Shield, label: 'Administration', path: '/admin' }] : []),
  ];

  const asideClass = mobile
    ? 'h-full w-full border-r-0 bg-sidebar/90 backdrop-blur-2xl'
    : 'fixed left-0 top-0 z-40 h-screen w-72 border-r border-border/80 bg-sidebar/85 backdrop-blur-2xl';

  return (
    <aside className={asideClass}>
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border/80 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-md shadow-primary/25">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">SalesAI</h1>
            <p className="text-xs text-muted-foreground">Meeting intelligence</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ease-out',
                  isActive
                    ? 'bg-primary/18 text-primary shadow-[inset_0_1px_0_hsl(var(--foreground)/0.12),0_8px_18px_hsl(var(--primary)/0.2)]'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground hover:shadow-[inset_0_1px_0_hsl(var(--foreground)/0.08)]'
                )
              }
            >
              <item.icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-105" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info & Logout */}
        <div className="border-t border-border/80 p-4 space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/30 px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              {isAdmin ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {profile?.full_name || profile?.email || 'Utilisateur'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {isAdmin ? 'Admin' : 'Utilisateur'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start rounded-xl text-muted-foreground hover:text-destructive"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Déconnexion
          </Button>
        </div>
      </div>
    </aside>
  );
}
