import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/lib/apiClient';
import { runBackgroundSync } from '@/services/syncService';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  session: boolean;
  user: Profile | null;
  profile: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapUser(raw: any): Profile {
  return {
    id: raw.id || raw._id,
    email: raw.email,
    full_name: raw.full_name || null,
    role: raw.role || 'user',
    created_at: raw.created_at || raw.createdAt || '',
    updated_at: raw.updated_at || raw.updatedAt || '',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, validate existing token
  useEffect(() => {
    const token = apiClient.getToken();
    if (token) {
      apiClient
        .get<{ user: any }>('/auth/me')
        .then(async ({ user: raw }) => {
          setUser(mapUser(raw));
          await runBackgroundSync().catch(() => {});
        })
        .catch(() => apiClient.setToken(null))
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => {
      if (!apiClient.getToken()) return;
      runBackgroundSync().catch(() => {});
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { token, user: raw } = await apiClient.post<{ token: string; user: any }>(
        '/auth/login',
        { email, password }
      );
      apiClient.setToken(token);
      setUser(mapUser(raw));
      await runBackgroundSync().catch(() => {});
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Échec de connexion' };
    }
  };

  const signOut = () => {
    apiClient.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session: !!user,
        user,
        profile: user,
        isAdmin: user?.role === 'admin',
        isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
