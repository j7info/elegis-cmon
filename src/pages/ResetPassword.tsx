import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2, KeyRound, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!token) {
      setError('Token inválido ou ausente.');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess('Senha alterada com sucesso! Você já pode fazer login.');
      setTimeout(() => navigate('/'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao redefinir a senha. O link pode ter expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border border-gray-100">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-teal-50 rounded-full text-teal-600">
            <KeyRound className="w-10 h-10" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Redefinir Senha</h2>
        <p className="text-gray-500 mb-6">Crie uma nova senha segura para acessar o sistema.</p>

        {success ? (
          <div className="p-4 bg-green-50 text-green-700 rounded-lg flex flex-col items-center gap-3 border border-green-100">
            <CheckCircle2 className="w-8 h-8" />
            <p className="font-medium">{success}</p>
            <p className="text-sm">Redirecionando para o login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-100">{error}</div>}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                required
                minLength={6}
                placeholder="Mínimo de 6 caracteres"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nova Senha</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                required
                minLength={6}
                placeholder="Repita a nova senha"
              />
            </div>

            <button 
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full mt-4 flex justify-center items-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar Nova Senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
