import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock, LogIn, LogOut, Maximize, Minimize, Play, X } from 'lucide-react';
import clsx from 'clsx';

type PracticalStep = 'start' | 'end';

interface PracticalAttendanceViewerProps {
  onClose: () => void;
  classId: string;
  appUrl: string;
  attendances: any[];
  onActivateQR: (step: PracticalStep) => Promise<void> | void;
  classData: any;
}

const stepConfig = {
  start: { label: 'Entrada', action: 'Abrir QR de Entrada', icon: LogIn },
  end: { label: 'Saída', action: 'Abrir QR de Saída', icon: LogOut },
} as const;

export function PracticalAttendanceViewer({
  onClose,
  classId,
  appUrl,
  attendances,
  onActivateQR,
  classData,
}: PracticalAttendanceViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<PracticalStep>(classData.qr_end_at ? 'end' : 'start');
  const [localActiveAt, setLocalActiveAt] = useState<Partial<Record<PracticalStep, number>>>({});
  const [now, setNow] = useState(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activating, setActivating] = useState(false);

  const durationMs = (classData.qr_duration_minutes || 10) * 60 * 1000;
  const activeAt = Number(localActiveAt[step] || classData[`qr_${step}_at`] || 0);
  const timeLeft = activeAt ? Math.max(0, Math.ceil((activeAt + durationMs - now) / 1000)) : null;
  const isOpen = timeLeft != null && timeLeft > 0;
  const isExpired = Boolean(activeAt) && timeLeft === 0;
  const config = stepConfig[step];
  const StepIcon = config.icon;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const confirmed = useMemo(() => {
    const scanKey = step === 'start' ? 'scan_start' : 'scan_end';
    return attendances
      .filter(attendance => Number(attendance[scanKey]) > 0)
      .sort((a, b) => Number(b[scanKey]) - Number(a[scanKey]));
  }, [attendances, step]);

  const activate = async () => {
    if (isOpen || activating) return;
    setActivating(true);
    const activatedAt = Date.now();
    try {
      await onActivateQR(step);
      setLocalActiveAt(current => ({ ...current, [step]: activatedAt }));
      setNow(activatedAt);
    } finally {
      setActivating(false);
    }
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current?.requestFullscreen();
    }
  };

  const minutes = timeLeft == null ? 0 : Math.floor(timeLeft / 60);
  const seconds = timeLeft == null ? 0 : timeLeft % 60;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] flex flex-col bg-gray-950 text-white">
      <header className="flex min-h-20 items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal-300">Aula Prática</p>
          <h1 className="truncate text-2xl font-bold">{classData.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleFullscreen} title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'} className="p-3 text-gray-300 hover:bg-white/10 hover:text-white rounded-md">
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
          <button type="button" onClick={onClose} title="Fechar apresentação" className="p-3 text-gray-300 hover:bg-white/10 hover:text-white rounded-md">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex items-center justify-center gap-2 border-b border-white/10 px-4 py-3">
        {(['start', 'end'] as PracticalStep[]).map(option => {
          const OptionIcon = stepConfig[option].icon;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setStep(option)}
              className={clsx(
                'flex min-w-36 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors',
                step === option ? 'bg-teal-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'
              )}
            >
              <OptionIcon className="h-4 w-4" /> {stepConfig[option].label}
            </button>
          );
        })}
      </div>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-h-0 items-center justify-center p-6 lg:p-10">
          {isOpen ? (
            <div className="flex w-full max-w-3xl flex-col items-center text-center">
              <div className="mb-4 flex items-center gap-3">
                <StepIcon className="h-8 w-8 text-teal-300" />
                <h2 className="text-3xl font-bold">Registro de {config.label}</h2>
              </div>
              <div className="bg-white p-5 shadow-2xl">
                <QRCodeSVG value={`${appUrl}/#/s/${classId}/${step}`} size={440} level="M" className="h-[min(50vh,440px)] w-[min(50vh,440px)]" />
              </div>
              <div className="mt-5 flex items-center gap-2 text-2xl font-semibold text-teal-200">
                <Clock className="h-6 w-6" />
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </div>
              <p className="mt-2 text-lg text-gray-300">Leia o QR Code ou registre a presença pelo curso.</p>
            </div>
          ) : (
            <div className="max-w-xl text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-teal-500/15 text-teal-300">
                <StepIcon className="h-10 w-10" />
              </div>
              <h2 className="text-4xl font-bold">Chamada de {config.label}</h2>
              <p className="mt-4 text-lg text-gray-400">
                {activeAt ? 'A janela anterior foi encerrada.' : `O QR ficará disponível por ${classData.qr_duration_minutes || 10} minutos.`}
              </p>
              {isExpired ? (
                <div className="mt-8 rounded-md border border-red-400/30 bg-red-500/10 px-6 py-4 text-red-200">
                  QR encerrado. Novos registros desta etapa somente por justificativa do professor.
                </div>
              ) : (
                <button type="button" onClick={activate} disabled={activating} className="mt-8 inline-flex items-center gap-3 rounded-md bg-teal-600 px-8 py-4 text-xl font-bold hover:bg-teal-500 disabled:opacity-60">
                  <Play className="h-6 w-6" /> {activating ? 'Abrindo...' : config.action}
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="min-h-0 border-t border-white/10 bg-gray-900 p-5 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Presenças confirmadas</h3>
            <span className="rounded-full bg-teal-500/15 px-3 py-1 text-sm font-bold text-teal-300">{confirmed.length}</span>
          </div>
          <div className="max-h-full space-y-2 overflow-y-auto pb-6">
            {confirmed.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">Aguardando registros</p>
            ) : confirmed.map(attendance => (
              <div key={`${step}-${attendance.id || attendance.identifier}`} className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2.5 text-sm text-gray-200">
                <CheckCircle2 className="h-4 w-4 flex-none text-teal-400" />
                <span className="truncate">{attendance.full_name || attendance.identifier}</span>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
