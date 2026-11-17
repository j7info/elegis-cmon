import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import {
  normalizeAvailableProfiles,
  resolveActiveProfile,
  type SystemProfile,
} from './profileModel';

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
  system_role: SystemProfile;
  available_profiles: SystemProfile[];
}

interface AuthContextType {
  user: AuthUser | null;
  activeProfile: SystemProfile | null;
  loading: boolean;
  login: (matricula: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  switchProfile: (profile: SystemProfile) => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  activeProfile: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  changePassword: async () => {},
  switchProfile: () => {},
  error: null,
  clearError: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeProfile, setActiveProfile] = useState<SystemProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyAuthenticatedUser = (rawUser: AuthUser) => {
    const normalizedUser: AuthUser = {
      ...rawUser,
      available_profiles: normalizeAvailableProfiles(rawUser.system_role, rawUser.available_profiles),
    };
    const profileStorageKey = `auth_active_profile:${normalizedUser.id}`;
    const nextProfile = resolveActiveProfile(
      normalizedUser.system_role,
      normalizedUser.available_profiles,
      localStorage.getItem(profileStorageKey),
    );

    setUser(normalizedUser);
    setActiveProfile(nextProfile);
    localStorage.setItem('auth_user', JSON.stringify(normalizedUser));
    localStorage.setItem(profileStorageKey, nextProfile);
  };

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');

    if (token && savedUser) {
      try {
        applyAuthenticatedUser(JSON.parse(savedUser));
        // Validate token with backend
        api.get('/auth/me')
          .then(applyAuthenticatedUser)
          .catch(() => {
            // Token invalid
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            setUser(null);
            setActiveProfile(null);
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
      applyAuthenticatedUser(data.user);
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
    setActiveProfile(null);
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

  const switchProfile = (profile: SystemProfile) => {
    if (!user?.available_profiles.includes(profile)) return;
    setActiveProfile(profile);
    localStorage.setItem(`auth_active_profile:${user.id}`, profile);
  };

  return (
    <AuthContext.Provider value={{ user, activeProfile, loading, login, logout, changePassword, switchProfile, error, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
