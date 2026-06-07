import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { UserPlus, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function PreRegister() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const identifierParam = searchParams.get('identifier') || '';
  const returnUrl = searchParams.get('returnUrl') || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    cpf: identifierParam,
    email: '',
    cargo: '',
    departamento: '',
    orgao: 'CMON'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/public/pre-register', formData);
      setSuccess('Pré-cadastro realizado com sucesso!');
      
      // Se houver uma URL de retorno (ex: a tela de Scan), redireciona após 2s
      if (returnUrl) {
        setTimeout(() => navigate(returnUrl), 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar pré-cadastro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-teal-600 px-6 py-8 text-center text-white">
          <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-90" />
          <h1 className="text-2xl font-bold">Pré-Cadastro de Aluno</h1>
          <p className="text-teal-100 mt-2 text-sm">Seus dados não constam em nossa base. Preencha o formulário rápido para continuar.</p>
        </div>

        <div className="p-8">
          {success ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Tudo certo!</h3>
              <p className="text-gray-600">{success}</p>
              {returnUrl && <p className="text-sm font-medium text-teal-600 mt-6">Redirecionando de volta...</p>}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-3 text-sm">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                <input 
                  type="text" required 
                  value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" 
                  placeholder="Seu nome completo" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                  <input 
                    type="text" required 
                    value={formData.cpf} onChange={e => setFormData({ ...formData, cpf: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" 
                    placeholder="000.000.000-00" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input 
                    type="email" 
                    value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" 
                    placeholder="voce@email.com" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input 
                    type="text" 
                    value={formData.cargo} onChange={e => setFormData({ ...formData, cargo: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lotação (Setor)</label>
                  <input 
                    type="text" 
                    value={formData.departamento} onChange={e => setFormData({ ...formData, departamento: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" 
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-md transition-colors disabled:opacity-50 mt-4">
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                Finalizar Pré-Cadastro
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
