import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpenCheck, Loader2, LogIn } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PublicFlowShell } from '../components/PublicFlowShell';
import { api } from '../lib/api';

interface PublicClassSummary {
  id: number;
  title: string;
  description?: string | null;
}

export function RegisterClass() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState<PublicClassSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadClass = async () => {
      if (!classId) {
        setLoading(false);
        return;
      }
      try {
        setClassData(await api.get<PublicClassSummary>(`/classes/${classId}`));
      } catch {
        // O link antigo continua útil mesmo quando a aula já não está disponível.
      } finally {
        setLoading(false);
      }
    };
    loadClass();
  }, [classId]);

  return (
    <PublicFlowShell
      eyebrow="Inscrição em cursos"
      title={classData?.title || 'Acesse seus cursos pela plataforma'}
      description="As inscrições foram centralizadas no dashboard para evitar cadastros duplicados e manter seu histórico em um único usuário."
    >
      <div className="p-5 sm:p-7">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verificando o link...</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700"><BookOpenCheck className="h-6 w-6" /></span>
              <div>
                <h2 className="font-bold text-slate-950">Inscrição pelo dashboard</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Entre com sua matrícula, abra a área de cursos disponíveis e escolha a formação desejada.</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <p><strong className="text-slate-900">Já participa do curso?</strong> Ele aparecerá entre os cursos matriculados após o acesso.</p>
              <p><strong className="text-slate-900">Ainda não possui cadastro?</strong> Durante uma aula presencial, o QR Code poderá encaminhar você ao pré-cadastro.</p>
            </div>

            <button type="button" onClick={() => navigate('/')} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800">
              <LogIn className="h-5 w-5" /> Acessar a plataforma <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </PublicFlowShell>
  );
}
