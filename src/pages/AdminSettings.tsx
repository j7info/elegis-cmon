import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Pencil,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { filterAdminUsers, summarizeAdminUsers, type AdminUserSummaryInput } from '../lib/adminSettingsModel';

type AdminTab = 'users' | 'identity' | 'security';
type Feedback = { tone: 'success' | 'error'; text: string } | null;

interface AdminUser extends AdminUserSummaryInput {
  id: number;
  name: string;
  matricula?: string | null;
  email?: string | null;
  cargo?: string | null;
  funcao_confianca?: string | null;
  departamento?: string | null;
  cpf?: string | null;
  orgao?: string | null;
  status?: string | null;
  system_role?: string | null;
  is_pre_registered?: boolean | null;
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  COORDENADOR: 'Coordenação',
  PROFESSOR: 'Professor',
  ALUNO: 'Aluno',
};

const inputClass = 'h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

export function AdminSettings() {
  const { user, changePassword } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [logoBase64, setLogoBase64] = useState('');
  const [appName, setAppName] = useState('Câmara de Ourilândia do Norte');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<Feedback>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('TODOS');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newMatricula, setNewMatricula] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [userFeedback, setUserFeedback] = useState<Feedback>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdFeedback, setPwdFeedback] = useState<Feedback>(null);
  const [changingPwd, setChangingPwd] = useState(false);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const loadUsers = async () => {
    const data = await api.get<AdminUser[]>('/users');
    setUsers(data);
  };

  useEffect(() => {
    const load = async () => {
      setLoadingData(true);
      setLoadError('');
      try {
        const [settingsData, usersData] = await Promise.all([
          api.get<{ logoUrl?: string; appName?: string }>('/settings'),
          api.get<AdminUser[]>('/users'),
        ]);
        setLogoBase64(settingsData.logoUrl || '');
        setAppName(settingsData.appName || 'Câmara de Ourilândia do Norte');
        setUsers(usersData);
      } catch (error: any) {
        setLoadError(error.message || 'Não foi possível carregar a administração.');
      } finally {
        setLoadingData(false);
      }
    };

    load();
  }, []);

  const summary = useMemo(() => summarizeAdminUsers(users), [users]);
  const filteredUsers = useMemo(
    () => filterAdminUsers(users, search, roleFilter, statusFilter) as AdminUser[],
    [users, search, roleFilter, statusFilter],
  );

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSettingsFeedback(null);

    if (file.size > 2 * 1024 * 1024) {
      setSettingsFeedback({ tone: 'error', text: 'A imagem deve ter no máximo 2 MB.' });
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = result => setLogoBase64(result.target?.result as string);
    reader.readAsDataURL(file);
  };

  const saveGlobalSettings = async () => {
    setSavingSettings(true);
    setSettingsFeedback(null);
    try {
      await api.put('/settings', { logoUrl: logoBase64, appName });
      setSettingsFeedback({ tone: 'success', text: 'Identidade institucional atualizada.' });
    } catch (error: any) {
      setSettingsFeedback({ tone: 'error', text: error.message || 'Não foi possível salvar a identidade.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newMatricula.trim() || !newUserName.trim() || !newUserRole.trim()) return;

    setAddingUser(true);
    setUserFeedback(null);
    try {
      const newUser = await api.post<AdminUser>('/users', {
        matricula: newMatricula.trim(),
        name: newUserName.trim(),
        email: newUserEmail.trim() || null,
        cargo: newUserRole.trim(),
      });
      setUsers(current => [...current, newUser].sort((a, b) => a.name.localeCompare(b.name)));
      setNewMatricula('');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('');
      setShowAddUser(false);
      setUserFeedback({ tone: 'success', text: `${newUser.name} foi adicionado ao sistema.` });
    } catch (error: any) {
      setUserFeedback({ tone: 'error', text: error.message || 'Não foi possível adicionar o usuário.' });
    } finally {
      setAddingUser(false);
    }
  };

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUserFeedback(null);

    try {
      const buffer = await file.arrayBuffer();
      let csvText = '';
      try {
        csvText = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        csvText = new TextDecoder('windows-1252').decode(buffer);
      }

      const result = await api.post<{ imported: number; errors: number }>('/users/import-csv', { csvText });
      await loadUsers();
      setUserFeedback({
        tone: result.errors ? 'error' : 'success',
        text: `${result.imported} usuário(s) importado(s). ${result.errors} registro(s) ignorado(s).`,
      });
    } catch (error: any) {
      setUserFeedback({ tone: 'error', text: error.message || 'Não foi possível importar o arquivo.' });
    } finally {
      event.target.value = '';
    }
  };

  const handleRemoveUser = async (target: AdminUser) => {
    if (target.id === user?.id) {
      setUserFeedback({ tone: 'error', text: 'Você não pode excluir seu próprio usuário.' });
      return;
    }
    if (!window.confirm(`Remover ${target.name}? Essa pessoa perderá o acesso ao sistema.`)) return;

    try {
      await api.delete(`/users/${target.id}`);
      setUsers(current => current.filter(item => item.id !== target.id));
      setUserFeedback({ tone: 'success', text: `${target.name} foi removido.` });
    } catch (error: any) {
      setUserFeedback({ tone: 'error', text: error.message || 'Não foi possível remover o usuário.' });
    }
  };

  const handleResetPassword = async (target: AdminUser) => {
    if (!window.confirm(`Enviar um link de recuperação para ${target.name}?`)) return;
    try {
      const result = await api.post<{ message?: string }>(`/users/${target.id}/reset-password`);
      setUserFeedback({ tone: 'success', text: result.message || 'E-mail de recuperação enviado.' });
    } catch (error: any) {
      setUserFeedback({ tone: 'error', text: error.message || 'Não foi possível enviar a recuperação.' });
    }
  };

  const handleAssignMatricula = async (target: AdminUser) => {
    const matricula = window.prompt(`Digite a matrícula oficial para ${target.name} (formato LLLLNNNNN):`);
    if (!matricula) return;
    try {
      const result = await api.post<{ message?: string }>(`/users/${target.id}/assign-matricula`, { matricula });
      await loadUsers();
      setUserFeedback({ tone: 'success', text: result.message || 'Matrícula atribuída com sucesso.' });
    } catch (error: any) {
      setUserFeedback({ tone: 'error', text: error.message || 'Não foi possível atribuir a matrícula.' });
    }
  };

  const handleEditUserSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;
    setEditSaving(true);
    try {
      const updated = await api.put<AdminUser>(`/users/${editingUser.id}`, {
        name: editingUser.name,
        email: editingUser.email,
        cargo: editingUser.cargo,
        funcao_confianca: editingUser.funcao_confianca,
        departamento: editingUser.departamento,
        status: editingUser.status,
        cpf: editingUser.cpf,
        system_role: editingUser.system_role,
      });
      setUsers(current => current.map(item => (item.id === updated.id ? { ...item, ...updated } : item)));
      setUserFeedback({ tone: 'success', text: `${updated.name} foi atualizado.` });
      setEditingUser(null);
    } catch (error: any) {
      setUserFeedback({ tone: 'error', text: error.message || 'Não foi possível atualizar o usuário.' });
    } finally {
      setEditSaving(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPwdFeedback(null);
    if (newPassword !== confirmPassword) {
      setPwdFeedback({ tone: 'error', text: 'As senhas não coincidem.' });
      return;
    }
    if (newPassword.length < 6) {
      setPwdFeedback({ tone: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    setChangingPwd(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdFeedback({ tone: 'success', text: 'Senha alterada com sucesso.' });
    } catch (error: any) {
      setPwdFeedback({ tone: 'error', text: error.message || 'Não foi possível alterar a senha.' });
    } finally {
      setChangingPwd(false);
    }
  };

  const tabs = [
    { id: 'users' as const, label: 'Usuários', icon: Users },
    { id: 'identity' as const, label: 'Identidade', icon: Building2 },
    { id: 'security' as const, label: 'Minha segurança', icon: KeyRound },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-teal-700">Administração</p>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Configurações e acessos</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Organize pessoas, identidade institucional e segurança sem misturar as tarefas.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <ShieldCheck className="h-5 w-5 text-teal-700" /> Acesso de administrador
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Áreas administrativas">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors',
              activeTab === id ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-900',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {loadError && <FeedbackBanner feedback={{ tone: 'error', text: loadError }} />}

      {loadingData ? (
        <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando administração...</div>
      ) : activeTab === 'users' ? (
        <section className="space-y-6" aria-label="Usuários do sistema">
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-y border-slate-200 bg-white sm:grid-cols-4 sm:divide-y-0">
            <Metric label="Cadastrados" value={summary.total} />
            <Metric label="Ativos" value={summary.active} tone="success" />
            <Metric label="Pré-cadastros" value={summary.pending} tone={summary.pending ? 'attention' : 'neutral'} />
            <Metric label="Administradores" value={summary.admins} />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
              <label className="relative min-w-0 flex-1 lg:max-w-md">
                <span className="sr-only">Buscar usuário</span>
                <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome, matrícula, CPF ou e-mail" className={`${inputClass} pl-10`} />
              </label>
              <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className={`${inputClass} sm:w-44`} aria-label="Filtrar por papel">
                <option value="TODOS">Todos os papéis</option>
                <option value="ALUNO">Alunos</option>
                <option value="PROFESSOR">Professores</option>
                <option value="COORDENADOR">Coordenação</option>
                <option value="ADMIN">Administradores</option>
              </select>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={`${inputClass} sm:w-44`} aria-label="Filtrar por situação">
                <option value="TODOS">Todas as situações</option>
                <option value="Ativo">Ativos</option>
                <option value="Inativo">Inativos</option>
                <option value="PENDENTE">Pré-cadastros</option>
              </select>
            </div>

            <div className="flex gap-2">
              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Upload className="h-4 w-4" /> Importar CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
              </label>
              <button type="button" onClick={() => setShowAddUser(current => !current)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 sm:flex-none">
                {showAddUser ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {showAddUser ? 'Fechar' : 'Adicionar'}
              </button>
            </div>
          </div>

          {userFeedback && <FeedbackBanner feedback={userFeedback} />}

          {showAddUser && (
            <form onSubmit={handleAddUser} className="border-y border-slate-200 bg-slate-100/70 px-4 py-5 sm:px-6">
              <div className="mb-4">
                <h2 className="font-bold text-slate-950">Adicionar usuário</h2>
                <p className="mt-1 text-sm text-slate-500">A senha inicial será a matrícula em letras minúsculas.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <LabeledInput label="Matrícula" value={newMatricula} onChange={value => setNewMatricula(value.toUpperCase())} placeholder="CMON10001" required />
                <LabeledInput label="Nome completo" value={newUserName} onChange={setNewUserName} required />
                <LabeledInput label="E-mail" type="email" value={newUserEmail} onChange={setNewUserEmail} placeholder="Opcional" />
                <LabeledInput label="Cargo ou função" value={newUserRole} onChange={setNewUserRole} required />
              </div>
              <div className="mt-4 flex justify-end">
                <button type="submit" disabled={addingUser} className="flex h-10 items-center gap-2 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                  {addingUser && <Loader2 className="h-4 w-4 animate-spin" />} Criar acesso
                </button>
              </div>
            </form>
          )}

          <div className="hidden overflow-hidden border-y border-slate-200 bg-white md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="w-[34%] px-4 py-3">Pessoa</th>
                  <th className="w-[20%] px-4 py-3">Matrícula</th>
                  <th className="w-[18%] px-4 py-3">Papel</th>
                  <th className="w-[12%] px-4 py-3">Situação</th>
                  <th className="w-[16%] px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="truncate font-semibold text-slate-950">{item.name}</p>
                      <p className="truncate text-xs text-slate-500">{item.email || item.cargo || 'Sem informação complementar'}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{item.is_pre_registered ? <StatusBadge label="Pré-cadastro" tone="attention" /> : item.matricula || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{roleLabels[item.system_role || 'ALUNO'] || item.system_role}</td>
                    <td className="px-4 py-3"><StatusBadge label={item.status || 'Ativo'} tone={item.status === 'Inativo' ? 'danger' : 'success'} /></td>
                    <td className="px-4 py-3"><UserActions target={item} currentUserId={user?.id} onAssign={handleAssignMatricula} onReset={handleResetPassword} onEdit={setEditingUser} onRemove={handleRemoveUser} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white md:hidden">
            {filteredUsers.map(item => (
              <article key={item.id} className="space-y-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{item.name}</p>
                    <p className="truncate text-sm text-slate-500">{item.email || item.cargo || 'Sem informação complementar'}</p>
                  </div>
                  <StatusBadge label={item.status || 'Ativo'} tone={item.status === 'Inativo' ? 'danger' : 'success'} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span>{roleLabels[item.system_role || 'ALUNO']}</span><span aria-hidden="true">•</span>
                  {item.is_pre_registered ? <StatusBadge label="Pré-cadastro" tone="attention" /> : <span className="font-mono">{item.matricula || '-'}</span>}
                </div>
                <UserActions target={item} currentUserId={user?.id} onAssign={handleAssignMatricula} onReset={handleResetPassword} onEdit={setEditingUser} onRemove={handleRemoveUser} mobile />
              </article>
            ))}
          </div>

          {filteredUsers.length === 0 && <div className="border-y border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">Nenhum usuário corresponde aos filtros.</div>}
        </section>
      ) : activeTab === 'identity' ? (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-label="Identidade institucional">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Identidade institucional</h2>
              <p className="mt-1 text-sm text-slate-500">Essas informações aparecem na navegação, apresentações e certificados.</p>
            </div>
            {settingsFeedback && <FeedbackBanner feedback={settingsFeedback} />}
            <LabeledInput label="Nome da instituição" value={appName} onChange={setAppName} required />
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Marca institucional</label>
              <div className="flex flex-col gap-4 border-y border-slate-200 py-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
                  {logoBase64 ? <img src={logoBase64} alt="Prévia da marca" className="h-full w-full object-contain p-2" /> : <ImageIcon className="h-8 w-8 text-slate-300" />}
                </div>
                <div className="space-y-2">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Upload className="h-4 w-4" /> Escolher imagem
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  <p className="text-xs text-slate-500">PNG transparente, JPG ou SVG. Tamanho máximo de 2 MB.</p>
                  {logoBase64 && <button type="button" onClick={() => setLogoBase64('')} className="text-xs font-semibold text-red-700 hover:underline">Remover imagem</button>}
                </div>
              </div>
            </div>
            <button type="button" onClick={saveGlobalSettings} disabled={savingSettings || !appName.trim()} className="flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50 sm:w-fit">
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar identidade
            </button>
          </div>

          <aside className="h-fit border border-slate-200 bg-white p-5" aria-label="Prévia da identidade">
            <p className="text-xs font-semibold uppercase text-slate-400">Prévia</p>
            <div className="mt-5 flex items-center gap-3 border-b border-slate-100 pb-5">
              {logoBase64 ? <img src={logoBase64} alt="" className="h-12 w-12 object-contain" /> : <span className="flex h-12 w-12 items-center justify-center rounded-md bg-teal-700 text-white"><Building2 className="h-6 w-6" /></span>}
              <div className="min-w-0"><p className="truncate font-bold text-slate-950">{appName || 'Nome da instituição'}</p><p className="text-xs text-slate-500">Formação e presença</p></div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">A marca será aplicada sem alterar cursos, históricos, presenças ou certificados já emitidos.</p>
          </aside>
        </section>
      ) : (
        <section className="max-w-2xl space-y-6" aria-label="Segurança da conta">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Minha segurança</h2>
            <p className="mt-1 text-sm text-slate-500">Altere apenas a senha da sua conta administrativa atual.</p>
          </div>
          {pwdFeedback && <FeedbackBanner feedback={pwdFeedback} />}
          <form onSubmit={handleChangePassword} className="space-y-5 border-y border-slate-200 py-6">
            {!user?.must_change_password && <LabeledInput label="Senha atual" type="password" value={currentPassword} onChange={setCurrentPassword} required />}
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledInput label="Nova senha" type="password" value={newPassword} onChange={setNewPassword} required minLength={6} />
              <LabeledInput label="Confirmar nova senha" type="password" value={confirmPassword} onChange={setConfirmPassword} required minLength={6} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500">Use pelo menos 6 caracteres.</p>
              <button type="submit" disabled={changingPwd} className="flex h-10 items-center gap-2 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {changingPwd && <Loader2 className="h-4 w-4 animate-spin" />} Alterar senha
              </button>
            </div>
          </form>
        </section>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4">
          <div className="my-8 w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><p className="text-xs font-semibold uppercase text-teal-700">Cadastro e permissão</p><h2 className="text-lg font-bold text-slate-950">Editar {editingUser.name}</h2></div>
              <button type="button" onClick={() => setEditingUser(null)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleEditUserSubmit} className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledInput label="Nome" value={editingUser.name} onChange={value => setEditingUser({ ...editingUser, name: value })} required />
                <LabeledInput label="E-mail" type="email" value={editingUser.email || ''} onChange={value => setEditingUser({ ...editingUser, email: value })} />
                <LabeledInput label="CPF" value={editingUser.cpf || ''} onChange={value => setEditingUser({ ...editingUser, cpf: value })} />
                <LabeledInput label="Cargo" value={editingUser.cargo || ''} onChange={value => setEditingUser({ ...editingUser, cargo: value })} />
                <LabeledInput label="Função de confiança" value={editingUser.funcao_confianca || ''} onChange={value => setEditingUser({ ...editingUser, funcao_confianca: value })} />
                <LabeledInput label="Departamento" value={editingUser.departamento || ''} onChange={value => setEditingUser({ ...editingUser, departamento: value })} />
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Papel no sistema</span><select value={editingUser.system_role || 'ALUNO'} onChange={event => setEditingUser({ ...editingUser, system_role: event.target.value })} className={inputClass}><option value="ALUNO">Aluno</option><option value="PROFESSOR">Professor</option><option value="COORDENADOR">Coordenação</option><option value="ADMIN">Administrador</option></select></label>
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Situação</span><select value={editingUser.status || 'Ativo'} onChange={event => setEditingUser({ ...editingUser, status: event.target.value })} className={inputClass}><option value="Ativo">Ativo</option><option value="Inativo">Inativo</option></select></label>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setEditingUser(null)} className="h-10 px-4 text-sm font-semibold text-slate-600 hover:text-slate-950">Cancelar</button>
                <button type="submit" disabled={editSaving} className="flex h-10 items-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{editSaving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'success' | 'attention' }) {
  return <div className="px-4 py-5 sm:px-5"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className={clsx('mt-1 text-2xl font-bold', tone === 'success' ? 'text-emerald-700' : tone === 'attention' ? 'text-amber-700' : 'text-slate-950')}>{value}</p></div>;
}

function FeedbackBanner({ feedback }: { feedback: NonNullable<Feedback> }) {
  const Icon = feedback.tone === 'success' ? CheckCircle2 : AlertTriangle;
  return <div role="status" className={clsx('flex items-start gap-2 border px-4 py-3 text-sm', feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800')}><Icon className="mt-0.5 h-4 w-4 shrink-0" />{feedback.text}</div>;
}

function StatusBadge({ label, tone }: { label: string; tone: 'success' | 'attention' | 'danger' }) {
  return <span className={clsx('inline-flex rounded-full px-2 py-1 text-[11px] font-bold', tone === 'success' ? 'bg-emerald-50 text-emerald-700' : tone === 'attention' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>{label}</span>;
}

function LabeledInput({ label, value, onChange, type = 'text', placeholder, required, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; minLength?: number }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} minLength={minLength} className={inputClass} /></label>;
}

function UserActions({ target, currentUserId, onAssign, onReset, onEdit, onRemove, mobile = false }: { target: AdminUser; currentUserId?: number; onAssign: (user: AdminUser) => void; onReset: (user: AdminUser) => void; onEdit: (user: AdminUser) => void; onRemove: (user: AdminUser) => void; mobile?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-1', mobile ? 'justify-between border-t border-slate-100 pt-3' : 'justify-end')}>
      {target.is_pre_registered ? (
        <button type="button" onClick={() => onAssign(target)} className="flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50" title="Definir matrícula"><BadgeCheck className="h-4 w-4" /> Definir matrícula</button>
      ) : (
        <button type="button" onClick={() => onReset(target)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-teal-50 hover:text-teal-700" title="Enviar recuperação de senha" aria-label={`Enviar recuperação de senha para ${target.name}`}><KeyRound className="h-4 w-4" /></button>
      )}
      <button type="button" onClick={() => onEdit({ ...target })} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-blue-50 hover:text-blue-700" title="Editar usuário" aria-label={`Editar ${target.name}`}><Pencil className="h-4 w-4" /></button>
      {target.id !== currentUserId && <button type="button" onClick={() => onRemove(target)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700" title="Remover usuário" aria-label={`Remover ${target.name}`}><Trash2 className="h-4 w-4" /></button>}
      {mobile && <span className="ml-auto flex items-center gap-1 text-xs text-slate-400"><UserCog className="h-4 w-4" /> Gerenciar</span>}
    </div>
  );
}
