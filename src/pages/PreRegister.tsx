import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, UserPlus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PublicFlowShell } from '../components/PublicFlowShell';
import { api } from '../lib/api';
import { normalizeIdentifier } from '../lib/identifier';
import { getSafePublicReturnPath } from '../lib/publicAttendanceModel';

const inputClass = 'h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

export function PreRegister() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const identifierParam = searchParams.get('identifier') || '';
  const returnPath = getSafePublicReturnPath(searchParams.get('returnUrl'));
  const identifierIsEmail = identifierParam.includes('@');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    cpf: identifierIsEmail ? '' : identifierParam,
    email: identifierIsEmail ? identifierParam.toLowerCase() : '',
    cargo: '',
    departamento: '',
    orgao: 'CMON',
  });

  useEffect(() => {
    if (!success || !returnPath) return undefined;
    const timeout = window.setTimeout(() => navigate(returnPath, { replace: true }), 1800);
    return () => window.clearTimeout(timeout);
  }, [navigate, returnPath, success]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/public/pre-register', {
        ...formData,
        name: formData.name.trim(),
        cpf: normalizeIdentifier(formData.cpf),
        email: formData.email.trim().toLowerCase(),
        cargo: formData.cargo.trim(),
        departamento: formData.departamento.trim(),
      });
      setSuccess(returnPath ? 'Dados recebidos. Você voltará para a presença em instantes.' : 'Pré-cadastro realizado. Aguarde a confirmação do responsável.');
    } catch (requestError: any) {
      if (returnPath && requestError.message === 'Usuário já cadastrado no sistema') {
        setSuccess('Cadastro localizado. Você voltará para a presença em instantes.');
      } else {
        setError(requestError.message || 'Não foi possível concluir o pré-cadastro.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicFlowShell
      eyebrow="Identificação do aluno"
      title="Complete seu pré-cadastro"
      description={returnPath ? 'Seus dados serão enviados para aprovação e você retornará à presença desta aula.' : 'Informe seus dados para entrar na fila de aprovação.'}
      width="max-w-2xl"
    >
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium text-slate-500 sm:px-7">
        <span className="font-semibold text-teal-800">1. Identificação</span>
        <span className="px-2 text-slate-300">/</span>
        <span>2. Aprovação</span>
        {returnPath && <><span className="px-2 text-slate-300">/</span><span>3. Presença</span></>}
      </div>

      <div className="p-5 sm:p-7">
        {success ? (
          <div className="py-6 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-8 w-8" /></span>
            <h2 className="mt-4 text-xl font-bold text-slate-950">Dados recebidos</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{success}</p>
            {returnPath ? (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-teal-700"><Loader2 className="h-4 w-4 animate-spin" /> Retornando para a aula...</div>
            ) : (
              <button type="button" onClick={() => navigate('/')} className="mt-6 h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Voltar ao início</button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div role="alert" className="flex items-start gap-3 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" required className="sm:col-span-2">
                <input type="text" autoComplete="name" required value={formData.name} onChange={event => setFormData(current => ({ ...current, name: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="CPF" required>
                <input type="text" inputMode="numeric" autoComplete="off" required value={formData.cpf} onChange={event => setFormData(current => ({ ...current, cpf: event.target.value }))} placeholder="000.000.000-00" className={inputClass} />
              </Field>
              <Field label="E-mail">
                <input type="email" autoComplete="email" value={formData.email} onChange={event => setFormData(current => ({ ...current, email: event.target.value }))} placeholder="nome@exemplo.com" className={inputClass} />
              </Field>
              <Field label="Cargo ou função">
                <input type="text" value={formData.cargo} onChange={event => setFormData(current => ({ ...current, cargo: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Lotação ou setor">
                <input type="text" value={formData.departamento} onChange={event => setFormData(current => ({ ...current, departamento: event.target.value }))} className={inputClass} />
              </Field>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-500">O responsável pelo curso poderá revisar e completar seu cadastro.</p>
              <button type="submit" disabled={loading || !formData.name.trim() || !formData.cpf.trim()} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Enviar pré-cadastro
              </button>
            </div>
          </form>
        )}
      </div>
    </PublicFlowShell>
  );
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}{required && <span className="ml-1 text-red-600">*</span>}</span>{children}</label>;
}
