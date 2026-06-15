import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { normalizeIdentifier } from '../lib/identifier';
import { CheckCircle2, User, Briefcase, Building2, BookA, AtSign, Clock } from 'lucide-react';

export function RegisterCourse() {
  const { courseId } = useParams();
  const [courseData, setCourseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [identifier, setIdentifier] = useState('');

  useEffect(() => {
    async function loadCourse() {
      if (!courseId) return;
      try {
        const crsData = await api.get(`/public/courses/${courseId}`);
        setCourseData(crsData);
      } catch (err) {
        setError('Curso não encontrado.');
      } finally {
        setLoading(false);
      }
    }
    loadCourse();
  }, [courseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !fullName || !role || !department || !identifier) return;
    
    setLoading(true);
    setError('');
    
    try {
      const res = await api.post(`/public/courses/${courseId}/registrations`, {
        identifier: normalizeIdentifier(identifier),
        full_name: fullName.trim(),
        role: role.trim(),
        department: department.trim(),
      });
      setIsApproved(res.isApproved);
      if (res.isApproved) {
        setSuccess('Cadastro realizado e aprovado com sucesso! Você já tem acesso ao curso e às aulas.');
      } else {
        setSuccess('Pré-cadastro realizado com sucesso! Sua solicitação foi enviada para o professor e está aguardando aprovação.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !courseData) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Carregando informações...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 font-sans">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        
        <div className="bg-teal-600 px-6 py-8 text-white">
          <h1 className="text-2xl font-bold">{courseData?.title || 'Cadastro no Curso'}</h1>
        </div>
        
        <div className="p-8">
          {error ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <p className="text-red-600 font-medium">{error}</p>
            </div>
          ) : success ? (
            <div className="text-center">
              {isApproved ? (
                <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
              ) : (
                <Clock className="w-20 h-20 text-amber-500 mx-auto mb-4" />
              )}
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{isApproved ? 'Ótimo!' : 'Aguarde'}</h3>
              <p className="text-gray-600">{success}</p>
              {isApproved && (
                <p className="text-sm text-gray-500 mt-4 bg-gray-50 p-4 rounded-lg">
                  Agora você pode realizar login com seu usuário para acessar todo o conteúdo. Durante as aulas, basta escanear o QR Code de presença.
                </p>
              )}
              {!isApproved && (
                <p className="text-sm text-gray-500 mt-4 bg-gray-50 p-4 rounded-lg">
                  Assim que o professor aprovar sua inscrição, você receberá seus dados de acesso ao portal do curso.
                </p>
              )}
            </div>
          ) : (
            <>
              {courseData?.description && (
                <div className="mb-8 p-4 bg-teal-50/50 rounded-xl border border-teal-100">
                  <h3 className="text-sm font-bold text-teal-900 mb-2 flex items-center gap-2">
                    <BookA className="w-4 h-4" /> Sobre o Curso
                  </h3>
                  <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{courseData.description}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="text-center mb-6">
                  <p className="text-gray-600 font-medium">Faça sua inscrição para acessar todas as aulas e materiais do curso.</p>
                </div>
                
                <div className="space-y-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <AtSign className="w-5 h-5" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="CPF ou E-mail (Será sua identificação)" 
                      value={identifier} 
                      onChange={e => setIdentifier(e.target.value)} 
                      required 
                      className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all shadow-sm" 
                    />
                  </div>
                  
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <User className="w-5 h-5" />
                    </div>
                    <input type="text" placeholder="Nome Completo" value={fullName} onChange={e => setFullName(e.target.value)} required className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all shadow-sm" />
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <input type="text" placeholder="Função" value={role} onChange={e => setRole(e.target.value)} required className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all shadow-sm" />
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <input type="text" placeholder="Departamento" value={department} onChange={e => setDepartment(e.target.value)} required className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all shadow-sm" />
                  </div>
                </div>
                <button type="submit" disabled={loading || !identifier.trim()} className="w-full py-4 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-md transition-colors disabled:opacity-50 mt-8">
                  Efetuar Cadastro no Curso
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
