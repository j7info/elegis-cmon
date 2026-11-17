import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  GraduationCap,
  Home,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { useSettings } from '../lib/useSettings';
import { canAlternateStaffStudent } from '../lib/profileModel';

const roleLabels = {
  ADMIN: 'Administrador',
  COORDENADOR: 'Coordenação',
  PROFESSOR: 'Professor',
  ALUNO: 'Aluno',
};

export function AdminLayout() {
  const { user, activeProfile, switchProfile, login, logout, loading, error, clearError } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [matricula, setMatricula] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  React.useEffect(() => {
    const state = location.state as { from?: string } | null;
    if (state?.from && !user && !loading) setShowLoginModal(true);
  }, [location.state, user, loading]);

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!matricula.trim() || !password) return;

    setLoginLoading(true);
    try {
      await login(matricula.trim(), password);
      setShowLoginModal(false);
      setMatricula('');
      setPassword('');

      const state = location.state as { from?: string } | null;
      if (state?.from) navigate(state.from, { replace: true });
    } catch {
      // O AuthContext mantém a mensagem que será exibida no formulário.
    } finally {
      setLoginLoading(false);
    }
  };

  const openLogin = () => {
    clearError();
    setShowLoginModal(true);
  };

  const requestPasswordRecovery = async () => {
    if (!matricula.trim()) {
      alert('Digite sua matrícula para recuperar a senha');
      return;
    }

    setLoginLoading(true);
    try {
      const response = await api.post<{ message?: string }>('/auth/forgot-password', { matricula });
      alert(response.message || 'E-mail enviado');
    } catch (requestError: any) {
      alert(requestError.response?.data?.error || requestError.message || 'Erro ao enviar e-mail');
    } finally {
      setLoginLoading(false);
    }
  };

  const isStudent = activeProfile === 'ALUNO';
  const canAlternateProfile = Boolean(user && canAlternateStaffStudent(user.available_profiles));
  const staffModeLabel = user ? roleLabels[user.system_role].toLowerCase() : '';
  const alternateProfile = () => {
    if (!user) return;
    switchProfile(isStudent ? user.system_role : 'ALUNO');
    navigate('/');
  };
  const navItems = user
    ? [
        { to: '/', label: 'Início', icon: Home, exact: true },
        ...(isStudent ? [{ to: '/me', label: 'Desempenho', icon: BarChart3, exact: false }] : []),
        ...(user.system_role === 'ADMIN'
          ? [{ to: '/settings', label: 'Configurações', icon: SettingsIcon, exact: false }]
          : []),
      ]
    : [];

  const isActive = (to: string, exact: boolean) => exact
    ? location.pathname === to
    : location.pathname.startsWith(to);

  const Brand = ({ compact = false }: { compact?: boolean }) => (
    <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Ir para o início">
      {settings.logoUrl ? (
        <img
          src={settings.logoUrl}
          alt={settings.appName || 'Câmara Municipal'}
          className={clsx('object-contain', compact ? 'h-9 w-9' : 'h-11 w-11')}
        />
      ) : (
        <span className={clsx(
          'flex shrink-0 items-center justify-center rounded-md bg-teal-700 text-white',
          compact ? 'h-9 w-9' : 'h-11 w-11',
        )}>
          <GraduationCap className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-slate-950">
          {settings.appName || 'Câmara Municipal'}
        </span>
        {!compact && <span className="block text-xs text-slate-500">Formação e presença</span>}
      </span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {user ? (
        <>
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:flex lg:flex-col">
            <div className="border-b border-slate-100 px-5 py-5"><Brand /></div>

            <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Navegação principal">
              <p className="px-3 pb-2 text-xs font-semibold uppercase text-slate-400">Área de trabalho</p>
              {navItems.map(({ to, label, icon: Icon, exact }) => {
                const active = isActive(to, exact);
                return (
                  <Link
                    key={to}
                    to={to}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                      active ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-slate-100 p-4">
              <div className="mb-3 min-w-0 px-2">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">Modo {roleLabels[activeProfile || user.system_role]}</p>
              </div>
              {canAlternateProfile && (
                <button
                  type="button"
                  onClick={alternateProfile}
                  className="mb-2 flex min-h-10 w-full items-center gap-3 rounded-md bg-teal-50 px-3 text-left text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100"
                >
                  <ArrowLeftRight className="h-4 w-4 shrink-0" />
                  {isStudent ? `Voltar ao modo ${staffModeLabel}` : 'Acessar como aluno'}
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </aside>

          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
            <Brand compact />
            <div className="flex items-center gap-1">
              {canAlternateProfile && (
                <button
                  type="button"
                  onClick={alternateProfile}
                  className="flex h-10 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                  title={isStudent ? `Voltar ao modo ${staffModeLabel}` : 'Acessar como aluno'}
                  aria-label={isStudent ? `Voltar ao modo ${staffModeLabel}` : 'Acessar como aluno'}
                >
                  <ArrowLeftRight className="h-5 w-5" />
                  <span className="hidden sm:inline">{isStudent ? roleLabels[user.system_role] : 'Aluno'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700"
                title="Sair"
                aria-label="Sair"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </header>

          <main className="min-h-screen px-4 pb-24 pt-6 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
            <div className="mx-auto w-full max-w-7xl"><Outlet /></div>
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
            style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
            aria-label="Navegação móvel"
          >
            {navItems.map(({ to, label, icon: Icon, exact }) => {
              const active = isActive(to, exact);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-2 text-xs font-medium',
                    active ? 'text-teal-700' : 'text-slate-500',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </>
      ) : (
        <>
          <header className="border-t-4 border-teal-700 bg-white shadow-sm">
            <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              <Brand />
              {!loading && (
                <button
                  type="button"
                  onClick={openLogin}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  <LogIn className="h-4 w-4" />
                  Entrar
                </button>
              )}
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><Outlet /></main>
        </>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                <KeyRound className="h-5 w-5 text-teal-700" /> Acesso restrito
              </h2>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4 p-5">
              {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Matrícula</label>
                <input
                  type="text"
                  value={matricula}
                  onChange={event => setMatricula(event.target.value.toUpperCase())}
                  placeholder="Ex: CMON10010"
                  className="w-full rounded-md border border-slate-300 px-4 py-2.5 font-mono uppercase outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="Sua senha"
                  className="w-full rounded-md border border-slate-300 px-4 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  required
                />
                <div className="mt-2 flex items-start justify-between gap-4">
                  <p className="text-xs text-slate-500">No primeiro acesso, use sua matrícula em letras minúsculas.</p>
                  <button type="button" onClick={requestPasswordRecovery} className="shrink-0 text-xs font-medium text-teal-700 hover:underline">
                    Esqueci a senha
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading || !matricula.trim() || !password}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {loginLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar no sistema'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
