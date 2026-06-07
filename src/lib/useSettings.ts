import { useState, useEffect } from 'react';
import { api } from './api';

export interface Settings {
  logoUrl?: string;
  appName?: string;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({ appName: 'Câmara de Ourilândia do Norte' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/settings')
      .then((data) => {
        setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch((err) => {
        console.error('Error loading settings:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  return { settings, loading };
}
