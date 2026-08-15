import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User } from '../lib/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem('fleetToken')
  );
  const [user, setUser] = useState<User | null>(() => {
    const stored = sessionStorage.getItem('fleetUser');
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback((newToken: string, newUser: User) => {
    sessionStorage.setItem('fleetToken', newToken);
    sessionStorage.setItem('fleetUser', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('fleetToken');
    sessionStorage.removeItem('fleetUser');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    // Listen for storage changes from other tabs
    const handler = () => {
      const t = sessionStorage.getItem('fleetToken');
      if (!t) {
        setToken(null);
        setUser(null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
