import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

export interface AuthUser {
  id: number;
  matricula: string;
  name: string;
  email: string | null;
  cpf: string | null;
  cargo: string | null;
  funcao_confianca: string | null;
  departamento: string | null;
  orgao: string | null;
  status: string;
  must_change_password: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (matricula: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  changePassword: async () => {},
  error: null,
  clearError: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        // Validate token with backend
        api.get('/auth/me')
          .then((data) => {
            setUser(data);
            localStorage.setItem('auth_user', JSON.stringify(data));
          })
          .catch(() => {
            // Token invalid
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            setUser(null);
          })
          .finally(() => setLoading(false));
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (matricula: string, password: string) => {
    setError(null);
    try {
      const data = await api.post('/auth/login', { matricula, password });
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (err: any) {
      const msg = err.message || 'Erro ao fazer login';
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors on logout
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    // Update user to reflect must_change_password = false
    if (user) {
      const updated = { ...user, must_change_password: false };
      setUser(updated);
      localStorage.setItem('auth_user', JSON.stringify(updated));
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword, error, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
