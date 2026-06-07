import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Search, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import { useSettings } from '../lib/useSettings';

export function VerifyCertificate() {
  const { tokenParam } = useParams();
  const { settings } = useSettings();
  
  const [tokenInput, setTokenInput] = useState(tokenParam || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (tokenParam) {
      verifyToken(tokenParam);
    }
  }, [tokenParam]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    verifyToken(tokenInput.trim().toUpperCase());
  };

  const verifyToken = async (token: string) => {
    setLoading(true);
    setResult(null);
    setErrorMsg('');
    try {
      const data = await api.get(`/certificates/verify/${token}`);
      setResult(data);
    } catch (e: any) {
      setErrorMsg(e.message || 'Certificado não encontrado ou código inválido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        
        <div className="bg-teal-900 p-8 text-center text-white relative">
          {settings.logoUrl && (
             <img src={settings.logoUrl} alt="Logo" className="h-16 mx-auto mb-4 object-contain drop-shadow" />
          )}
          <h1 className="text-xl font-bold mb-1">Verificação de Certificado</h1>
          <p className="text-teal-100 text-sm">{settings.appName || 'Sistema de Emissão'}</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código de Validação</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value.toUpperCase())}
                  placeholder="Ex: A1B2C3D4"
                  className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 font-mono tracking-widest text-center uppercase outline-none"
                />
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
              </div>
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-gray-900 hover:bg-black text-white font-medium py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verificar Autenticidade'}
            </button>
          </form>

          {errorMsg && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 animate-in fade-in">
              <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium">{errorMsg}</p>
            </div>
          )}

          {result && (
            <div className="p-5 bg-green-50 border border-green-100 rounded-xl relative animate-in zoom-in-95 duration-300">
              <div className="absolute -top-4 -right-4 bg-white rounded-full p-1 shadow-sm">
                 <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              
              <h3 className="font-bold text-green-800 border-b border-green-200 pb-2 mb-3">Certificado Válido</h3>
              
              <div className="space-y-2 text-sm text-gray-700">
                 <p><span className="font-semibold text-gray-900 block">Aluno:</span> {result.student_name}</p>
                 <p><span className="font-semibold text-gray-900 block">Identificação/CPF:</span> {result.student_id}</p>
                 <p><span className="font-semibold text-gray-900 block">Curso:</span> {result.course_title}</p>
                 <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-green-200/50">
                    <p><span className="font-semibold text-gray-900">Emissão:</span><br/> {format(new Date(result.issued_at), 'dd/MM/yyyy')}</p>
                    <p><span className="font-semibold text-gray-900">Presença:</span><br/> {result.percentage}%</p>
                 </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="bg-gray-50 border-t border-gray-100 p-4 text-center">
          <Link to="/" className="text-sm text-teal-600 font-medium hover:underline">Ir para a página inicial</Link>
        </div>

      </div>
    </div>
  );
}
