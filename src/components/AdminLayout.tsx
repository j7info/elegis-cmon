import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, LogIn, LayoutDashboard, Settings as SettingsIcon, X, Loader2, KeyRound } from 'lucide-react';
import { useSettings } from '../lib/useSettings';

export function AdminLayout() {
  const { user, login, logout, loading, error, clearError } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [matricula, setMatricula] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  React.useEffect(() => {
    const state = location.state as { from?: string } | null;
    if (state?.from && !user && !loading) {
      setShowLoginModal(true);
    }
  }, [location.state, user, loading]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matricula.trim() || !password) return;
    
    setLoginLoading(true);
    try {
      await login(matricula.trim(), password);
      setShowLoginModal(false);
      setMatricula('');
      setPassword('');
      
      const state = location.state as { from?: string } | null;
      if (state?.from) {
        navigate(state.from, { replace: true });
      }
    } catch (err) {
      // Error is handled by AuthContext and displayed below
    } finally {
      setLoginLoading(false);
    }
  };

  const openLogin = () => {
    clearError();
    setShowLoginModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans overflow-x-hidden w-full relative">
      <div className="bg-teal-900 text-teal-50 py-1.5 px-4 text-xs font-medium tracking-wide flex justify-between items-center sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-2">
          <span className="text-center sm:text-left">Portal Oficial da Câmara Municipal</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white transition-colors">Acessibilidade</a>
            <a href="#" className="hover:text-white transition-colors">Transparência</a>
          </div>
        </div>
      </div>
      
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 to-teal-400"></div>
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-14 md:h-16 object-contain" />
            ) : (
              <div className="w-12 h-12 bg-teal-50 text-teal-800 rounded-full flex items-center justify-center">
                <LayoutDashboard className="w-6 h-6" />
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight uppercase leading-tight font-serif">
                {settings.appName || 'Câmara Municipal'}
              </h1>
              <span className="text-sm text-gray-500 font-medium">Sistema de Certificação e Presença</span>
            </div>
          </Link>
          <div className="flex-shrink-0">
            {!loading && user ? (
              <div className="flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                {user.system_role === 'ADMIN' && (
                  <Link to="/settings" className="text-gray-500 hover:text-teal-700 transition-colors bg-white p-1.5 rounded-full shadow-sm hover:shadow" title="Configurações">
                    <SettingsIcon className="w-4 h-4" />
                  </Link>
                )}
                <span className="text-sm font-medium text-gray-700 hidden md:inline-block px-2">{user.name}</span>
                <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors bg-white rounded-full shadow-sm hover:shadow" title="Sair">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : !loading && !user ? (
              <button onClick={openLogin} className="px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2">
                <LogIn className="w-4 h-4" /> Acesso Restrito
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-teal-600" /> Acesso Restrito
              </h2>
              <button onClick={() => setShowLoginModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Matrícula</label>
                <input 
                  type="text" 
                  value={matricula}
                  onChange={e => setMatricula(e.target.value.toUpperCase())}
                  placeholder="Ex: CMON10010"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none uppercase font-mono"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
                <div className="flex justify-between mt-2">
                  <p className="text-xs text-gray-500">
                    * No primeiro acesso, sua senha é sua matrícula em letras minúsculas.
                  </p>
                  <button 
                    type="button" 
                    onClick={async () => {
                      if (!matricula.trim()) {
                        alert('Digite sua matrícula para recuperar a senha');
                        return;
                      }
                      setLoginLoading(true);
                      try {
                        const api = (await import('../lib/api')).default;
                        const res = await api.post('/auth/forgot-password', { matricula });
                        alert(res.data.message || 'E-mail enviado');
                      } catch (err: any) {
                        alert(err.response?.data?.error || 'Erro ao enviar e-mail');
                      } finally {
                        setLoginLoading(false);
                      }
                    }}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    Esqueci a senha
                  </button>
                </div>
              </div>

              <button 
                type="submit"
                disabled={loginLoading || !matricula.trim() || !password}
                className="w-full mt-4 flex justify-center items-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
              >
                {loginLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar no Sistema'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
