import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { Save, UserPlus, Trash2, Shield, Image as ImageIcon, KeyRound, CheckCircle2, Edit2, X } from 'lucide-react';

export function AdminSettings() {
  const { user, changePassword } = useAuth();
  
  const [logoBase64, setLogoBase64] = useState('');
  const [appName, setAppName] = useState('Câmara de Ourilândia do Norte');
  const [savingSettings, setSavingSettings] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [newMatricula, setNewMatricula] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [userError, setUserError] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // Edit User State
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await api.get('/settings');
        if (data.logoUrl) setLogoBase64(data.logoUrl);
        if (data.appName) setAppName(data.appName);
      } catch (e) {
        console.error("Error loading settings", e);
      }
    };
    
    const loadUsers = async () => {
      try {
        const data = await api.get('/users');
        setUsers(data);
      } catch (e) {
        console.error("Error loading users", e);
      }
    };

    loadSettings();
    loadUsers();
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setLogoBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const saveGlobalSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put('/settings', { logoUrl: logoBase64, appName });
      alert("Configurações salvas com sucesso!");
    } catch (e) {
      alert("Erro ao salvar configurações.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatricula.trim() || !newUserName.trim() || !newUserRole.trim()) return;
    
    setAddingUser(true);
    setUserError('');
    try {
      const newUser = await api.post('/users', {
        matricula: newMatricula.trim(),
        name: newUserName.trim(),
        email: newUserEmail.trim() || null,
        cargo: newUserRole.trim(),
      });
      setUsers([...users, newUser].sort((a, b) => a.name.localeCompare(b.name)));
      setNewMatricula('');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('');
    } catch (err: any) {
      setUserError(err.message || "Erro ao adicionar usuário");
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async (id: number) => {
    if (id === user?.id) {
      alert("Você não pode excluir seu próprio usuário.");
      return;
    }
    if (!window.confirm("Remover este usuário? Ele perderá acesso ao sistema.")) return;
    
    try {
      await api.delete(`/users/${id}`);
      setUsers(users.filter(u => u.id !== id));
    } catch (error) {
      alert("Erro ao remover usuário.");
    }
  };

  const handleResetPassword = async (id: number, matricula: string) => {
    if (!window.confirm(`Deseja enviar um e-mail com link de recuperação de senha para o usuário (${matricula})?`)) return;
    
    try {
      const res = await api.post(`/users/${id}/reset-password`);
      alert(res.data?.message || "E-mail de recuperação enviado com sucesso!");
    } catch (error: any) {
      alert(error.response?.data?.error || "Erro ao solicitar recuperação de senha.");
    }
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditSaving(true);
    try {
      const res = await api.put(`/users/${editingUser.id}`, {
        name: editingUser.name,
        email: editingUser.email,
        cargo: editingUser.cargo,
        funcao_confianca: editingUser.funcao_confianca,
        departamento: editingUser.departamento,
        status: editingUser.status,
        cpf: editingUser.cpf,
        system_role: editingUser.system_role,
      });
      // Atualizar a lista localmente
      setUsers(users.map(u => (u.id === editingUser.id ? { ...u, ...res.data } : u)));
      setEditingUser(null);
      alert("Usuário atualizado com sucesso!");
    } catch (error: any) {
      alert(error.response?.data?.error || "Erro ao atualizar usuário.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleAssignMatricula = async (id: number, name: string) => {
    const matricula = window.prompt(`Digite a matrícula oficial para ${name} (formato LLLLNNNNN):`);
    if (!matricula) return;
    try {
      await api.post(`/users/${id}/assign-matricula`, { matricula });
      alert("Matrícula atribuída com sucesso! A senha temporária agora é a própria matrícula em minúsculo.");
      // Recarregar a lista
      const data = await api.get('/users');
      setUsers(data);
    } catch (error: any) {
      alert(error.message || "Erro ao atribuir matrícula.");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    
    if (newPassword !== confirmPassword) {
      setPwdError("As senhas não coincidem");
      return;
    }
    
    if (newPassword.length < 6) {
      setPwdError("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }

    setChangingPwd(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwdSuccess("Senha alterada com sucesso!");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwdError(err.message || "Erro ao alterar senha");
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações do Sistema</h1>
        <p className="text-gray-500 mt-1">Gerencie a identidade visual, segurança e o acesso dos usuários à aplicação.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        
        {/* Visual Identity Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-medium text-gray-900">Identidade Visual</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Logo (Topo, Apresentação e Certificados)</label>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
              <div className="w-24 h-24 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoBase64 ? (
                  <img src={logoBase64} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div className="flex-1 space-y-2 w-full text-center sm:text-left">
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/svg+xml"
                  onChange={handleLogoUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                />
                <p className="text-xs text-gray-400">Recomendado: Imagem PNG transparente, máx 2MB.</p>
                {logoBase64 && (
                  <button onClick={() => setLogoBase64('')} className="text-xs text-red-500 font-medium hover:underline">
                    Remover logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Instituição (App Name)</label>
            <input 
              type="text" 
              value={appName}
              onChange={e => setAppName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <button 
              onClick={saveGlobalSettings}
              disabled={savingSettings}
              className="flex justify-center items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {savingSettings ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>

        {/* Change Password Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-medium text-gray-900">Alterar Senha</h2>
          </div>
          <p className="text-sm text-gray-500">Mantenha sua conta segura atualizando sua senha regularmente.</p>

          <form onSubmit={handleChangePassword} className="space-y-4">
            {pwdError && <div className="p-2 text-sm text-red-700 bg-red-50 rounded border border-red-100">{pwdError}</div>}
            {pwdSuccess && <div className="p-2 text-sm text-green-700 bg-green-50 rounded border border-green-100 flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> {pwdSuccess}</div>}
            
            {(!user?.must_change_password) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha Atual</label>
                <input 
                  type="password" 
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nova Senha</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                required
                minLength={6}
              />
            </div>

            <button 
              type="submit"
              disabled={changingPwd}
              className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {changingPwd ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>

        {/* Users Section */}
        <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-medium text-gray-900">Usuários do Sistema</h2>
            </div>
            
            <div className="flex items-center">
              <label className="cursor-pointer bg-teal-50 hover:bg-teal-100 text-teal-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-teal-200">
                Importar CSV
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const buffer = await file.arrayBuffer();
                      let text = '';
                      try {
                        const decoder = new TextDecoder('utf-8', { fatal: true });
                        text = decoder.decode(buffer);
                      } catch (e) {
                        const decoder = new TextDecoder('windows-1252');
                        text = decoder.decode(buffer);
                      }

                      const res = await api.post('/users/import-csv', { csvText: text });
                      alert(`Importação concluída! Novos: ${res.imported}. Erros/Ignorados: ${res.errors}.`);
                      // Recarregar a lista
                      const data = await api.get('/users');
                      setUsers(data);
                    } catch (err: any) {
                      alert(err.message || 'Erro ao importar CSV');
                    }
                    e.target.value = ''; // reseta o input
                  }}
                />
              </label>
            </div>
          </div>
          <p className="text-sm text-gray-500">Usuários cadastrados podem acessar o sistema administrativo. O login é feito com a Matrícula e a senha padrão inicial é a matrícula em letras minúsculas.</p>

          <form onSubmit={handleAddUser} className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-3">
            {userError && <div className="p-2 text-sm text-red-700 bg-red-50 rounded border border-red-100">{userError}</div>}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <input 
                type="text" 
                placeholder="Matrícula (LLLLNNNNN)" 
                value={newMatricula}
                onChange={e => setNewMatricula(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none uppercase"
                required
              />
              <input 
                type="text" 
                placeholder="Nome Completo" 
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                required
              />
              <input 
                type="email" 
                placeholder="E-mail (Opcional)" 
                value={newUserEmail}
                onChange={e => setNewUserEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
              />
              <input 
                type="text" 
                placeholder="Cargo/Função" 
                value={newUserRole}
                onChange={e => setNewUserRole(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                required
              />
            </div>
            <button 
              type="submit"
              disabled={addingUser}
              className="w-full sm:w-auto flex justify-center items-center gap-2 px-6 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" /> {addingUser ? 'Adicionando...' : 'Adicionar Usuário'}
            </button>
          </form>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 border-y border-gray-100 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Matrícula</th>
                  <th className="px-4 py-3">Nome / E-mail</th>
                  <th className="px-4 py-3">Cargo / Papel</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center text-gray-500 italic">Nenhum usuário.</td></tr>
                ) : (
                  users.map((u: any) => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono font-medium">
                        {u.is_pre_registered ? (
                          <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-bold tracking-wide">PRÉ-CADASTRO</span>
                        ) : (
                          u.matricula
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{u.name}</div>
                        {u.email && <div className="text-xs text-gray-500">{u.email}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">{u.cargo || '-'}</div>
                        <div className="text-xs font-bold mt-0.5 text-teal-700">{u.system_role || 'ALUNO'}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-full ${u.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {u.is_pre_registered ? (
                          <button 
                            onClick={() => handleAssignMatricula(u.id, u.name)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                            title="Atribuir matrícula"
                          >
                            Definir Matrícula
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleResetPassword(u.id, u.matricula)}
                            className="text-xs font-medium text-teal-600 hover:text-teal-800 transition-colors"
                            title="Enviar E-mail de Senha"
                          >
                            Resetar Senha
                          </button>
                        )}
                        <button 
                          onClick={() => setEditingUser({ ...u })}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors inline-flex align-middle"
                          title="Editar usuário"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {u.id !== user?.id && (
                          <button 
                            onClick={() => handleRemoveUser(u.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors inline-flex align-middle"
                            title="Remover usuário"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                Editar Usuário
              </h2>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditUserSubmit} className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input type="text" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input type="email" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                  <input type="text" value={editingUser.cpf || ''} onChange={e => setEditingUser({...editingUser, cpf: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input type="text" value={editingUser.cargo || ''} onChange={e => setEditingUser({...editingUser, cargo: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Função de Confiança</label>
                  <input type="text" value={editingUser.funcao_confianca || ''} onChange={e => setEditingUser({...editingUser, funcao_confianca: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
                  <input type="text" value={editingUser.departamento || ''} onChange={e => setEditingUser({...editingUser, departamento: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Permissão / Papel</label>
                  <select value={editingUser.system_role || 'ALUNO'} onChange={e => setEditingUser({...editingUser, system_role: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none">
                    <option value="ALUNO">Aluno (Padrão)</option>
                    <option value="PROFESSOR">Professor (Cria Cursos/Aulas)</option>
                    <option value="COORDENADOR">Coordenador (Cria Cursos/Aulas)</option>
                    <option value="ADMIN">Administrador Geral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none">
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors">Cancelar</button>
                <button type="submit" disabled={editSaving} className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                  {editSaving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
