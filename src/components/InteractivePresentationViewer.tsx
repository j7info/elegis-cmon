import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Maximize, Minimize, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';

interface InteractivePresentationViewerProps {
  onClose: () => void;
  classId: string;
  appUrl: string;
  attendances: any[];
  onActivateQR: (step: string) => void;
  classData: any;
}

type QRStep = 'start' | 'middle' | 'end';

const stepLabels: Record<QRStep, string> = {
  start: 'Registre sua entrada',
  middle: 'Confirme sua presença',
  end: 'Registre sua saída',
};

export function InteractivePresentationViewer({
  onClose,
  classId,
  appUrl,
  attendances,
  onActivateQR,
  classData,
}: InteractivePresentationViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const introducedRef = useRef<Set<QRStep>>(new Set(['start']));
  const activatedRef = useRef<Set<QRStep>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [htmlUrl, setHtmlUrl] = useState('');
  const [currentSlide, setCurrentSlide] = useState(1);
  const [totalSlides, setTotalSlides] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qrIntroStep, setQrIntroStep] = useState<QRStep | null>('start');
  const [persistentQR, setPersistentQR] = useState<QRStep | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInteractiveLesson() {
      try {
        const config = await api.get(`/classes/${classId}/interactive`);
        if (!config?.html_url) throw new Error('Arquivo HTML não configurado');

        const apiBase = (import.meta as any).env?.VITE_API_URL || '/api';
        const rawUrl = String(config.html_url).replace(/^\/api/, apiBase);
        const separator = rawUrl.includes('?') ? '&' : '?';
        const presenterParams = new URLSearchParams({
          min_seconds: '0',
          review: '1',
          unlocked_slides: '9999',
          presenter: '1',
        });

        if (!cancelled) setHtmlUrl(`${rawUrl}${separator}${presenterParams.toString()}`);
      } catch (err) {
        console.error('Erro ao carregar aula interativa para apresentação:', err);
        if (!cancelled) setError('Não foi possível abrir o conteúdo da aula interativa.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInteractiveLesson();
    return () => { cancelled = true; };
  }, [classId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;

      const message = event.data;
      if (!message || typeof message !== 'object') return;
      if (!['INTERACTIVE_SLIDE_START', 'INTERACTIVE_VIEW_PROGRESS'].includes(message.type)) return;

      const slide = Number(message.data?.slide ?? message.data?.current_slide ?? 0);
      const total = Number(message.data?.total_slides ?? 0);
      if (slide > 0) setCurrentSlide(slide);
      if (total > 0) setTotalSlides(total);
      if (slide <= 0 || total <= 0) return;

      const middleSlide = Math.max(2, Math.ceil(total / 2));
      if (slide >= total && total > 1 && !introducedRef.current.has('end')) {
        introducedRef.current.add('end');
        setQrIntroStep('end');
      } else if (slide >= middleSlide && !introducedRef.current.has('middle')) {
        introducedRef.current.add('middle');
        setQrIntroStep('middle');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!qrIntroStep || activatedRef.current.has(qrIntroStep)) return;
    activatedRef.current.add(qrIntroStep);
    if (!classData?.[`qr_${qrIntroStep}_at`]) onActivateQR(qrIntroStep);
  }, [qrIntroStep, classData, onActivateQR]);

  useEffect(() => {
    const activeStep = qrIntroStep || persistentQR;
    if (!activeStep) {
      setTimeLeft(null);
      return;
    }

    const activeAt = Number(classData?.[`qr_${activeStep}_at`]);
    if (!activeAt) return;
    const durationMs = Number(classData?.qr_duration_minutes || 10) * 60_000;

    const updateCountdown = () => {
      setTimeLeft(Math.max(0, activeAt + durationMs - Date.now()));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [qrIntroStep, persistentQR, classData]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen().catch(err => console.error('Erro ao ativar tela cheia:', err));
  }, []);

  const dismissQrIntro = () => {
    if (!qrIntroStep) return;
    setPersistentQR(qrIntroStep);
    setQrIntroStep(null);
  };

  const showQR = (step: QRStep) => {
    introducedRef.current.add(step);
    setQrIntroStep(step);
  };

  const activeQR = qrIntroStep || persistentQR;
  const points = activeQR === 'start'
    ? classData?.points_start ?? 40
    : activeQR === 'middle'
      ? classData?.points_middle ?? 30
      : classData?.points_end ?? 30;

  const recentScans = activeQR ? attendances
    .filter(attendance => Boolean(attendance[`scan_${activeQR}`]))
    .sort((a, b) => (Number(b[`scan_${activeQR}`]) || 0) - (Number(a[`scan_${activeQR}`]) || 0))
    .slice(0, 8) : [];

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin text-teal-400 mb-4" />
        <p className="text-lg">Preparando aula interativa...</p>
        <button onClick={onClose} className="mt-8 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20">Cancelar</button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center text-white p-6">
        <p className="max-w-md text-center text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl p-5">{error}</p>
        <button onClick={onClose} className="mt-6 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20">Voltar</button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-gray-950 text-white overflow-hidden group">
      <iframe
        ref={iframeRef}
        src={htmlUrl}
        title="Apresentação da aula interativa"
        className="absolute inset-0 w-full h-full border-0 bg-gray-950"
        allowFullScreen
      />

      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-4 p-4 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pointer-events-none">
        <div className="pointer-events-auto drop-shadow-lg">
          <p className="font-semibold">Apresentação presencial</p>
          <p className="text-xs text-gray-300">Slide {currentSlide}{totalSlides ? ` de ${totalSlides}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="hidden md:flex items-center gap-1 rounded-full bg-black/35 p-1 backdrop-blur-sm">
            {(['start', 'middle', 'end'] as QRStep[]).map(step => (
              <button
                key={step}
                onClick={() => showQR(step)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-white/15"
              >
                {step === 'start' ? 'Entrada' : step === 'middle' ? 'Meio' : 'Saída'}
              </button>
            ))}
          </div>
          <button onClick={toggleFullscreen} className="p-2.5 rounded-full bg-white/15 hover:bg-white/25" title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
          <button onClick={onClose} className="p-2.5 rounded-full bg-red-500/80 hover:bg-red-500" title="Fechar apresentação">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {qrIntroStep && (
        <div className="absolute inset-0 z-20 bg-gray-950 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-5 text-center">
            <div>
              <p className="text-teal-300 uppercase tracking-[0.2em] text-xs font-bold mb-2">Presença presencial</p>
              <h2 className="text-3xl md:text-4xl font-bold">{stepLabels[qrIntroStep]} — {points} pts</h2>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-2xl">
              <QRCodeSVG value={`${appUrl}/#/s/${classId}/${qrIntroStep}`} size={320} level="H" />
            </div>
            <div className="h-7">
              {timeLeft !== null && timeLeft > 0 ? (
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-900 rounded-full text-sm font-bold">
                  <Clock className="w-4 h-4" /> Expira em {formatTime(timeLeft)}
                </span>
              ) : timeLeft === 0 ? (
                <span className="text-red-300 font-bold">QR Code expirado</span>
              ) : null}
            </div>
            <div className="w-80 min-h-20 rounded-xl border border-white/15 bg-white/5 p-3">
              {recentScans.length === 0 ? (
                <p className="text-sm text-gray-400 py-3">Aguardando leituras...</p>
              ) : recentScans.map(attendance => (
                <div key={attendance.identifier} className="flex items-center gap-2 text-sm text-left px-2 py-1">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="truncate">{attendance.full_name}</span>
                </div>
              ))}
            </div>
            <button onClick={dismissQrIntro} className="px-6 py-3 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold">
              Continuar apresentação
            </button>
          </div>
        </div>
      )}

      {!qrIntroStep && persistentQR && (
        <div className="absolute right-5 bottom-5 z-10 bg-white text-gray-900 rounded-2xl shadow-2xl p-3 w-48">
          <p className="text-xs font-bold text-center mb-2">{stepLabels[persistentQR]}</p>
          <div className="flex justify-center">
            <QRCodeSVG value={`${appUrl}/#/s/${classId}/${persistentQR}`} size={140} level="H" />
          </div>
          {timeLeft !== null && (
            <p className="text-[11px] text-center mt-2 font-medium text-amber-700">
              {timeLeft > 0 ? `Expira em ${formatTime(timeLeft)}` : 'QR Code expirado'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
