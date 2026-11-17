import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileCheck2, Loader2, Search, ShieldCheck, XCircle } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { Link, useParams } from 'react-router-dom';
import { PublicFlowShell } from '../components/PublicFlowShell';
import { api } from '../lib/api';
import { maskIdentifier } from '../lib/identifier';

interface CertificateVerification {
  student_name: string;
  student_id?: string | null;
  course_title: string;
  issued_at: string;
  percentage?: number | null;
}

export function VerifyCertificate() {
  const { tokenParam } = useParams();
  const [tokenInput, setTokenInput] = useState(tokenParam || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CertificateVerification | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const verifyToken = useCallback(async (token: string) => {
    setLoading(true);
    setResult(null);
    setErrorMsg('');
    try {
      setResult(await api.get<CertificateVerification>(`/certificates/verify/${encodeURIComponent(token)}`));
    } catch (error: any) {
      setErrorMsg(error.message || 'Certificado não encontrado ou código inválido.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tokenParam) {
      const normalizedToken = tokenParam.trim().toUpperCase();
      setTokenInput(normalizedToken);
      verifyToken(normalizedToken);
    }
  }, [tokenParam, verifyToken]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const token = tokenInput.trim().toUpperCase();
    if (token) verifyToken(token);
  };

  const issuedDate = result?.issued_at ? new Date(result.issued_at) : null;

  return (
    <PublicFlowShell
      eyebrow="Autenticidade"
      title="Verificar certificado"
      description="Consulte o código impresso no certificado ou contido no QR Code."
    >
      <div className="p-5 sm:p-7">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Código de validação</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={tokenInput}
                onChange={event => {
                  setTokenInput(event.target.value.toUpperCase().replace(/\s/g, ''));
                  setErrorMsg('');
                }}
                placeholder="Ex.: A1B2C3D4"
                autoComplete="off"
                className="h-12 w-full rounded-md border border-slate-300 pl-11 pr-4 font-mono text-base uppercase tracking-widest outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </span>
          </label>
          <button type="submit" disabled={loading || !tokenInput.trim()} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />} Verificar autenticidade
          </button>
        </form>

        {errorMsg && (
          <div role="alert" className="mt-6 flex items-start gap-3 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Código não validado</p><p className="mt-1">{errorMsg}</p></div>
          </div>
        )}

        {result && (
          <div className="mt-6 border-t-4 border-emerald-600 bg-emerald-50/60 px-4 py-5 sm:px-5">
            <div className="flex items-start gap-3 border-b border-emerald-200 pb-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span>
              <div><h2 className="font-bold text-emerald-950">Certificado autêntico</h2><p className="mt-1 text-sm text-emerald-800">O documento consta na base oficial de emissão.</p></div>
            </div>

            <dl className="grid gap-x-5 gap-y-4 pt-5 text-sm sm:grid-cols-2">
              <Detail label="Aluno" value={result.student_name} className="sm:col-span-2" />
              <Detail label="Identificação" value={maskIdentifier(result.student_id)} />
              <Detail label="Presença" value={`${Number(result.percentage || 0)}%`} />
              <Detail label="Curso" value={result.course_title} className="sm:col-span-2" />
              <Detail label="Emissão" value={issuedDate && isValid(issuedDate) ? format(issuedDate, 'dd/MM/yyyy') : 'Data não informada'} />
            </dl>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 px-5 py-4 text-xs text-slate-500 sm:px-7">
        <span className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-teal-700" /> Consulta pública</span>
        <Link to="/" className="font-semibold text-teal-700 hover:underline">Ir para o início</Link>
      </div>
    </PublicFlowShell>
  );
}

function Detail({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return <div className={className}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-900">{value}</dd></div>;
}
