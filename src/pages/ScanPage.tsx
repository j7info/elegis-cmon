import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  IdCard,
  Loader2,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { PublicFlowShell } from '../components/PublicFlowShell';
import { api } from '../lib/api';
import { normalizeIdentifier } from '../lib/identifier';
import {
  buildScanReturnPath,
  evaluateAttendanceWindow,
  getAttendanceStepLabel,
  getAttendanceSteps,
  type AttendanceWindowState,
} from '../lib/publicAttendanceModel';

interface PublicClassData {
  id: number;
  course_id: number;
  title: string;
  status: string;
  type?: string | null;
  qr_duration_minutes?: number | null;
  qr_start_at?: number | string | null;
  qr_middle_at?: number | string | null;
  qr_end_at?: number | string | null;
}

export function ScanPage() {
  const { classId, step } = useParams();
  const navigate = useNavigate();
  const [classData, setClassData] = useState<PublicClassData | null>(null);
  const [windowState, setWindowState] = useState<AttendanceWindowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [enrollmentCourseId, setEnrollmentCourseId] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const loadClass = async () => {
      if (!classId || !step) {
        setError('O endereço desta presença está incompleto.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const data = await api.get<PublicClassData>(`/classes/${classId}`);
        const state = evaluateAttendanceWindow(data, step);
        setClassData(data);
        setWindowState(state);
        if (state.state !== 'open') setError(state.message);
      } catch (requestError: any) {
        setError(requestError.message || 'Não foi possível carregar os dados da aula.');
      } finally {
        setLoading(false);
      }
    };

    loadClass();
  }, [classId, step, reloadToken]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!classId || !step || !identifier.trim() || !classData || windowState?.state !== 'open') return;

    setLoading(true);
    setError('');
    try {
      const result = await api.post<{ message?: string; full_name?: string }>(`/classes/${classId}/scan/${step}`, {
        identifier: identifier.trim(),
      });
      setSuccess(result.message || `${result.full_name}, sua presença foi confirmada!`);
    } catch (requestError: any) {
      if (requestError.message === 'USER_NOT_FOUND') {
        const returnPath = buildScanReturnPath(classId, step);
        navigate(`/pre-register?identifier=${encodeURIComponent(normalizeIdentifier(identifier))}&returnUrl=${encodeURIComponent(returnPath)}`);
      } else if (requestError.message === 'NOT_ENROLLED') {
        setNeedsEnrollment(true);
        setEnrollmentCourseId(String(requestError.response?.data?.course_id || classData.course_id || ''));
      } else {
        setError(requestError.message || 'Não foi possível registrar a presença. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollAndScan = async () => {
    const cleanIdentifier = identifier.trim();
    if (!enrollmentCourseId || !cleanIdentifier || !classId || !step) return;

    setLoading(true);
    setError('');
    try {
      await api.post(`/courses/${enrollmentCourseId}/enroll`, { identifier: cleanIdentifier });
      const result = await api.post<{ message?: string; full_name?: string }>(`/classes/${classId}/scan/${step}`, { identifier: cleanIdentifier });
      setNeedsEnrollment(false);
      setSuccess(result.message || `${result.full_name}, sua inscrição e presença foram confirmadas!`);
    } catch (requestError: any) {
      setError(requestError.message || 'Não foi possível concluir a inscrição.');
      setNeedsEnrollment(false);
    } finally {
      setLoading(false);
    }
  };

  const stepLabel = getAttendanceStepLabel(step);

  return (
    <PublicFlowShell
      eyebrow="Registro de presença"
      title={classData?.title || 'Aula presencial'}
      description={classData ? `${stepLabel} · janela de ${classData.qr_duration_minutes || 10} minutos` : 'Validando esta janela de presença.'}
    >
      {classData && <AttendanceProgress type={classData.type} currentStep={step} />}

      <div className="p-5 sm:p-7">
        {loading && !classData ? (
          <div className="flex min-h-56 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verificando presença...</div>
        ) : needsEnrollment ? (
          <StateMessage
            icon={UserPlus}
            tone="info"
            title="Inscrição necessária"
            message="Seu cadastro foi localizado, mas ainda falta o vínculo com este curso. Confirme para registrar também esta presença."
          >
            <button type="button" onClick={handleEnrollAndScan} disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar inscrição e presença
            </button>
            <button type="button" onClick={() => setNeedsEnrollment(false)} disabled={loading} className="h-10 w-full text-sm font-semibold text-slate-600 hover:text-slate-950">Voltar</button>
          </StateMessage>
        ) : success ? (
          <StateMessage icon={CheckCircle2} tone="success" title="Presença confirmada" message={success}>
            <p className="text-xs text-slate-500">Você já pode fechar esta página.</p>
          </StateMessage>
        ) : error ? (
          <StateMessage icon={AlertTriangle} tone="danger" title={windowState?.state === 'expired' ? 'Janela encerrada' : 'Não foi possível continuar'} message={error}>
            <button type="button" onClick={() => setReloadToken(current => current + 1)} disabled={loading} className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} /> Atualizar situação
            </button>
          </StateMessage>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"><Clock3 className="h-5 w-5" /></span>
              <div><p className="text-sm font-semibold text-slate-950">Janela aberta</p><p className="text-xs text-slate-500">Etapa: {stepLabel}</p></div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">CPF, e-mail ou matrícula</span>
              <span className="relative block">
                <IdCard className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  autoComplete="username"
                  inputMode="text"
                  value={identifier}
                  onChange={event => setIdentifier(event.target.value)}
                  placeholder="Digite sua identificação"
                  required
                  className="h-12 w-full rounded-md border border-slate-300 pl-11 pr-4 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </span>
            </label>

            <p className="text-xs leading-5 text-slate-500">Use a mesma identificação vinculada ao seu cadastro na plataforma.</p>

            <button type="submit" disabled={loading || !identifier.trim()} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Registrar presença
            </button>
          </form>
        )}
      </div>
    </PublicFlowShell>
  );
}

function AttendanceProgress({ type, currentStep }: { type?: string | null; currentStep?: string }) {
  const steps = getAttendanceSteps(type);
  return (
    <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((item, index) => {
        const active = item === currentStep;
        return (
          <div key={item} className={clsx('flex min-w-0 items-center justify-center gap-2 border-r border-slate-200 px-2 py-3 text-xs font-semibold last:border-r-0', active ? 'bg-teal-50 text-teal-800' : 'text-slate-400')}>
            <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]', active ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-600')}>{index + 1}</span>
            <span className="truncate">{getAttendanceStepLabel(item)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StateMessage({ icon: Icon, tone, title, message, children }: { icon: React.ElementType; tone: 'success' | 'danger' | 'info'; title: string; message: string; children: React.ReactNode }) {
  return (
    <div className="py-3 text-center">
      <span className={clsx('mx-auto flex h-16 w-16 items-center justify-center rounded-full', tone === 'success' ? 'bg-emerald-50 text-emerald-700' : tone === 'danger' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700')}><Icon className="h-8 w-8" /></span>
      <h2 className="mt-4 text-xl font-bold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">{message}</p>
      <div className="mx-auto mt-6 max-w-sm space-y-2">{children}</div>
    </div>
  );
}
