import React from 'react';
import { GraduationCap, ShieldCheck } from 'lucide-react';
import { useSettings } from '../lib/useSettings';

export function PublicFlowShell({
  eyebrow,
  title,
  description,
  children,
  width = 'max-w-lg',
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: 'max-w-lg' | 'max-w-2xl';
}) {
  const { settings } = useSettings();

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <header className="border-t-4 border-teal-700 bg-white">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt={settings.appName || 'Instituição'} className="h-11 w-11 object-contain" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-700 text-white"><GraduationCap className="h-6 w-6" /></span>
          )}
          <span className="min-w-0">
            <strong className="block truncate text-sm text-slate-950">{settings.appName || 'Câmara Municipal'}</strong>
            <span className="block text-xs text-slate-500">Formação e presença</span>
          </span>
        </div>
      </header>

      <main className="px-4 py-8 sm:px-6 sm:py-12">
        <div className={`mx-auto w-full ${width}`}>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase text-teal-700">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>}
          </div>

          <section className="border border-slate-200 bg-white shadow-sm">{children}</section>

          <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-teal-700" /> Ambiente oficial de formação
          </p>
        </div>
      </main>
    </div>
  );
}
