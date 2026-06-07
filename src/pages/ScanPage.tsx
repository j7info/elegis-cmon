import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { CheckCircle2, AtSign, Loader2, AlertTriangle, UserPlus } from 'lucide-react';

export function ScanPage() {
  const { classId, step } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [enrollmentCourseId, setEnrollmentCourseId] = useState('');
  
  const getDeviceScannedStatus = (currentClassId: string, currentStep: string) => {
    return localStorage.getItem(`scanned_${currentClassId}_${currentStep}`);
  };

  const setDeviceScannedStatus = (currentClassId: string, currentStep: string) => {
    localStorage.setItem(`scanned_${currentClassId}_${currentStep}`, 'true');
  };

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  useEffect(() => {
    async function loadClass() {
      if (!classId || !step) return;
      try {
        const data = await api.get(`/classes/${classId}`);
        if (data.status !== 'active') {
          setError('Esta aula não está ativa no momento.');
        } else {
          const qrColumn = `qr_${step}_at`;
          const activeAt = data[qrColumn];
          const durationMinutes = data.qr_duration_minutes || 10;
          
          if (!activeAt) {
            setError('O registro de presença para essa etapa ainda não foi ativado pelo professor.');
          } else if (Date.now() > Number(activeAt) + (durationMinutes * 60 * 1000)) {
            setError('O tempo para registro no QR Code desta etapa esgotou.');
          } else {
            setClassData(data);
            if (getDeviceScannedStatus(classId, step)) {
              setSuccess('Você já confirmou sua presença nesta etapa usando este aparelho.');
            }
          }
        }
      } catch (err) {
        setError('Erro ao carregar detalhes da aula.');
      } finally {
        setLoading(false);
      }
    }
    loadClass();
  }, [classId, step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !step || !identifier || !classData) return;
    
    setLoading(true);
    setError('');
    
    try {
      const result = await api.post(`/classes/${classId}/scan/${step}`, {
        identifier: identifier.trim(),
      });
      
      setDeviceScannedStatus(classId, step);
      setSuccess(result.message || `${result.full_name}, sua presença foi confirmada!`);
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        // Redireciona para o pré-cadastro com o CPF e a URL de retorno
        navigate(`/pre-register?identifier=${encodeURIComponent(identifier)}&returnUrl=${encodeURIComponent(window.location.pathname)}`);
      } else if (err.message === 'NOT_ENROLLED') {
        setNeedsEnrollment(true);
        setEnrollmentCourseId(err.course_id || classData?.course_id);
      } else {
        setError(err.message || 'Erro ao marcar presença. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollAndScan = async () => {
    if (!enrollmentCourseId || !identifier) return;
    setLoading(true);
    try {
      // 1. Inscreve no curso
      await api.post(`/courses/${enrollmentCourseId}/enroll`, { identifier });
      // 2. Tenta registrar presença novamente
      const result = await api.post(`/classes/${classId}/scan/${step}`, { identifier });
      
      setDeviceScannedStatus(classId || '', step || '');
      setNeedsEnrollment(false);
      setSuccess(result.message || `${result.full_name}, sua inscrição e presença foram confirmadas!`);
    } catch (err: any) {
      setError(err.message || 'Erro ao tentar se inscrever. Tente novamente.');
      setNeedsEnrollment(false);
    } finally {
      setLoading(false);
    }
  };

  if (!classData && !error) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-teal-600 px-6 py-8 text-center text-white">
          <h1 className="text-xl font-medium opacity-90 tracking-wide uppercase text-sm mb-2">Marcação de Presença</h1>
          <h2 className="text-2xl font-bold">{classData?.title || 'Aula'}</h2>
          <div className="mt-4 inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-semibold tracking-wide">
            ETAPA: {step === 'start' ? 'ENTRADA' : step === 'middle' ? 'MEIO DA AULA' : 'SAÍDA'}
          </div>
        </div>
        
        <div className="p-8">
          {needsEnrollment ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Inscrição Necessária</h3>
              <p className="text-gray-600 mb-6">Você ainda não está inscrito neste curso. Deseja se inscrever agora e confirmar sua presença na aula?</p>
              <div className="space-y-3">
                <button onClick={handleEnrollAndScan} disabled={loading} className="w-full px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium shadow-md transition-colors flex justify-center items-center gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Inscrição e Presença'}
                </button>
                <button onClick={() => setNeedsEnrollment(false)} disabled={loading} className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : error ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <p className="text-red-700 font-medium mb-6">{error}</p>
              <button onClick={() => { setError(''); setIdentifier(''); }} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                Tentar Novamente
              </button>
            </div>
          ) : success ? (
            <div className="text-center">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Confirmado!</h3>
              <p className="text-gray-600">{success}</p>
              <p className="text-sm font-medium text-gray-400 mt-6">Aguardando no dispositivo seguro...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center mb-6">
                <p className="text-gray-600 font-medium">Digite o CPF ou Email utilizado no seu cadastro prévio da aula.</p>
              </div>
              
              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                    <AtSign className="w-6 h-6" />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Seu CPF ou Email" 
                    value={identifier} 
                    onChange={e => setIdentifier(e.target.value)} 
                    required 
                    className="w-full text-lg pl-14 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-teal-100 focus:border-teal-500 outline-none transition-all shadow-sm font-medium" 
                  />
                </div>
              </div>
              
              <button type="submit" disabled={loading || !identifier.trim()} className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-lg shadow-md transition-colors disabled:opacity-50 mt-6">
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                Registrar Presença
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
