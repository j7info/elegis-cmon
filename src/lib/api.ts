const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface ApiOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private async request<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const requestHeaders: Record<string, string> = {
      ...headers,
    };

    const token = this.getToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      fetchOptions.headers = requestHeaders;
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, fetchOptions);

    if (response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      
      const currentHash = window.location.hash;
      const isPublicRoute = currentHash.startsWith('#/register/') || 
                            currentHash.startsWith('#/pre-register') || 
                            currentHash.startsWith('#/s/') || 
                            currentHash.startsWith('#/verify') || 
                            currentHash.startsWith('#/reset-password');
      
      if (!isPublicRoute) {
        window.location.hash = '#/';
      }
      
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(data.error || `Erro ${response.status}`);
    }

    return response.json();
  }

  get<T = any>(path: string) {
    return this.request<T>(path);
  }

  post<T = any>(path: string, body?: any) {
    return this.request<T>(path, { method: 'POST', body });
  }

  put<T = any>(path: string, body?: any) {
    return this.request<T>(path, { method: 'PUT', body });
  }

  delete<T = any>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async upload<T = any>(path: string, formData: FormData): Promise<T> {
    // Não definir Content-Type: o browser gera o boundary do multipart.
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(data.error || `Erro ${response.status}`);
    }
    return response.json();
  }
}

export const api = new ApiClient(API_BASE);
