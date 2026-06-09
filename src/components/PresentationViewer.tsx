import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { QRCodeSVG } from 'qrcode.react';
import { X, ChevronLeft, ChevronRight, Maximize, Minimize, Loader2, CheckCircle2, Clock } from 'lucide-react';
import clsx from 'clsx';
import { useSettings } from '../lib/useSettings';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PresentationViewerProps {
  file: File;
  onClose: () => void;
  classId: string;
  appUrl: string;
  attendances: any[];
  onActivateQR: (step: string) => void;
  classData: any;
}

export function PresentationViewer({ file, onClose, classId, appUrl, attendances, onActivateQR, classData }: PresentationViewerProps) {
  const { settings } = useSettings();
  const [slides, setSlides] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [persistentQR, setPersistentQR] = useState<{step: string, title: string} | null>(null);
  const [qrIntroStep, setQrIntroStep] = useState<string | null>(null);
  const introducedRef = useRef<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    
    async function loadPDF() {
      try {
        setLoading(true);
        let arrayBuffer: ArrayBuffer;
        try {
          arrayBuffer = await file.arrayBuffer();
        } catch {
          if (!cancelled) setError('Não foi possível ler o arquivo.');
          setLoading(false);
          return;
        }
        
        let pdf: any;
        try {
          pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        } catch {
          if (!cancelled) setError('Erro ao processar o PDF. O arquivo pode estar corrompido.');
          setLoading(false);
          return;
        }
        
        const generatedSlides: string[] = [];
        
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          
          let page: any;
          try {
            page = await pdf.getPage(i);
          } catch {
            continue;
          }
          
          const viewport = page.getViewport({ scale: 1.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (!context) continue;
          
          canvas.width = Math.min(viewport.width, 4096);
          canvas.height = Math.min(viewport.height, 4096);
          
          try {
            // @ts-ignore
            await page.render({ canvasContext: context, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            generatedSlides.push(dataUrl);
          } catch (e) {
            console.warn('Erro ao renderizar página', i, e);
            continue;
          }
        }
        
        if (!cancelled) {
          if (generatedSlides.length === 0) {
            setError('Não foi possível gerar slides a partir do PDF.');
          } else {
            setSlides(generatedSlides);
          }
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Erro inesperado no PDF:', err);
        if (!cancelled) {
          setError('Erro ao ler o PDF. Certifique-se de que é um arquivo válido.');
          setLoading(false);
        }
      }
    }
    
    loadPDF();
    
    return () => { cancelled = true; };
  }, [file]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'Space' || e.key === ' ') {
      setCurrentSlide(prev => Math.min(slides.length - 1, prev + 1));
    } else if (e.key === 'ArrowLeft') {
      setCurrentSlide(prev => Math.max(0, prev - 1));
    } else if (e.key === 'Escape') {
      setIsFullscreen(false);
    }
  }, [slides.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error('Error attempting to enable full-screen mode:', err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const total = slides.length;
  const hasMiddle = total >= 3;
  const startSlide = 0;
  const middleSlide = hasMiddle ? Math.floor(total / 2) : -1;
  const endSlide = total - 1;

  const pStart = classData?.points_start ?? 40;
  const pMiddle = classData?.points_middle ?? 30;
  const pEnd = classData?.points_end ?? 30;

  let slideQR: {step: string, title: string} | null = null;
  if (currentSlide === startSlide) {
    slideQR = { step: 'start', title: `Registre sua Entrada - ${pStart} pts` };
  } else if (currentSlide === middleSlide) {
    slideQR = { step: 'middle', title: `Confirme sua Presença - ${pMiddle} pts` };
  } else if (currentSlide === endSlide && total > 1) {
    slideQR = { step: 'end', title: `Registre sua Saída - ${pEnd} pts` };
  }

  // Mostra QR em tela cheia antes de cada etapa
  useEffect(() => {
    if (slides.length === 0) return;
    // Inicia com QR de entrada
    if (qrIntroStep === null && !introducedRef.current.has('start')) {
      introducedRef.current.add('start');
      setQrIntroStep('start');
    }
  }, [slides.length, qrIntroStep]);

  useEffect(() => {
    const steps = ['middle', 'end'] as const;
    const indices: Record<string, number> = { middle: middleSlide, end: endSlide };
    for (const step of steps) {
      if (currentSlide === indices[step] && !introducedRef.current.has(step)) {
        introducedRef.current.add(step);
        setQrIntroStep(step);
        break;
      }
    }
  }, [currentSlide, middleSlide, endSlide]);

  useEffect(() => {
    // Só ativa o QR no canto quando não estiver em tela cheia
    if (slideQR && !qrIntroStep) {
      setPersistentQR(slideQR);
    }
  }, [slideQR?.step, qrIntroStep]);

  useEffect(() => {
    if (timeLeft === 0) {
      setPersistentQR(null);
    }
  }, [timeLeft]);

  useEffect(() => {
    const activeStep = qrIntroStep || persistentQR?.step || null;
    if (activeStep && classData) {
      const step = activeStep;
      const activeAt = classData[`qr_${step}_at`];
      if (!activeAt) {
        onActivateQR(step);
      }
    }
  }, [qrIntroStep, persistentQR?.step, classData, onActivateQR]);

  useEffect(() => {
    const activeStep = qrIntroStep || persistentQR?.step || null;
    if (!activeStep || !classData) {
      setTimeLeft(null);
      return;
    }
    const step = activeStep;
    const activeAt = classData[`qr_${step}_at`];
    const durationMinutes = classData.qr_duration_minutes || 10;

    if (!activeAt) return;
    const interval = setInterval(() => {
      const expiresAt = Number(activeAt) + (durationMinutes * 60 * 1000);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [qrIntroStep, persistentQR?.step, classData]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin text-teal-500 mb-4" />
        <p className="text-lg">Processando apresentação...</p>
        <p className="text-gray-400 text-sm mt-2">Convertendo páginas em slides. Isso pode levar alguns segundos.</p>
        <button onClick={onClose} className="mt-8 px-4 py-2 bg-gray-800 rounded-md hover:bg-gray-700 transition-colors text-sm">
          Cancelar
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center justify-center text-white">
        <div className="bg-red-500/20 text-red-500 p-4 rounded-xl max-w-md text-center">
          <p className="font-medium text-lg">{error}</p>
        </div>
        <button onClick={onClose} className="mt-8 px-4 py-2 bg-gray-800 rounded-md hover:bg-gray-700 transition-colors text-sm">
          Voltar
        </button>
      </div>
    );
  }

  // Filter recent scans for the currently active QR step
  const dismissQrIntro = () => {
    if (!qrIntroStep) return;
    if (qrIntroStep === 'end') return; // End QR fica até expirar
    const step = qrIntroStep;
    setQrIntroStep(null);
    // Ativa o QR no servidor se ainda não estiver ativo
    if (classData) {
      const activeAt = classData[`qr_${step}_at`];
      if (!activeAt) {
        onActivateQR(step);
      }
    }
    // Garante que o slide correspondente seja mostrado
    if (step === 'start') setCurrentSlide(0);
    else if (step === 'middle' && middleSlide >= 0) setCurrentSlide(middleSlide);
    else if (step === 'end') setCurrentSlide(endSlide);
  };

  const activeQrStep = qrIntroStep || persistentQR?.step || null;
  const stepTitle = qrIntroStep === 'start'
    ? `Registre sua Entrada - ${pStart} pts`
    : qrIntroStep === 'middle'
    ? `Confirme sua Presença - ${pMiddle} pts`
    : qrIntroStep === 'end'
    ? `Registre sua Saída - ${pEnd} pts`
    : '';

  const recentScans = activeQrStep ? attendances
    .filter(a => {
      if (activeQrStep === 'start') return !!a.scan_start;
      if (activeQrStep === 'middle') return !!a.scan_middle;
      return !!a.scan_end;
    })
    .sort((a, b) => {
      const aTime = persistentQR.step === 'start' ? a.scan_start : persistentQR.step === 'middle' ? a.scan_middle : a.scan_end;
      const bTime = persistentQR.step === 'start' ? b.scan_start : persistentQR.step === 'middle' ? b.scan_middle : b.scan_end;
      return bTime - aTime; // descending
    })
    .slice(0, 8) : []; // Max 8 recent names

  const formatMinSec = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-gray-900 flex flex-col font-sans select-none overflow-hidden group">
      
      {/* Top Controls Overlay */}
      {!qrIntroStep && (
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-4 text-white">
            {settings.logoUrl && (
              <img src={settings.logoUrl} alt="Logo" className="h-10 max-w-[120px] object-contain drop-shadow-md bg-white rounded p-1" />
            )}
            <div>
              <p className="font-medium">Modo Apresentação</p>
              <p className="text-sm text-gray-300">Slide {currentSlide + 1} de {total}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={toggleFullscreen} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition-colors">
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
            <button onClick={onClose} className="bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-full backdrop-blur-md transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* QR Fullscreen */}
      {qrIntroStep ? (
          <div className="flex-1 w-full h-full relative flex items-center justify-center" onClick={dismissQrIntro}>
            <div className="flex flex-col items-center gap-6">
              <h2 className="text-white text-3xl font-bold text-center px-4">{stepTitle}</h2>
              <div className="bg-white p-8 rounded-3xl shadow-2xl">
                <QRCodeSVG 
                  value={`${appUrl}/#/s/${classId}/${qrIntroStep}`} 
                  size={360} 
                  level="H" 
                  includeMargin={false} 
                />
              </div>
              <div className="h-8">
                {timeLeft !== null && timeLeft > 0 ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100/90 text-amber-900 rounded-full text-sm font-bold animate-pulse">
                    <Clock className="w-4 h-4" /> Expira em {formatMinSec(timeLeft)}
                  </div>
                ) : timeLeft === 0 ? (
                  <span className="text-sm font-bold text-red-400">QR CODE EXPIRADO</span>
                ) : (
                  <span className="text-gray-400 text-sm">{qrIntroStep !== 'end' ? 'Clique para continuar' : 'Aguardando...'}</span>
                )}
              </div>
              {/* Live Names no QR cheio */}
              <div className="w-80">
                <div className="relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-100 text-green-700 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider flex items-center gap-1 border border-green-200 z-10">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> AO VIVO
                  </div>
                  <div className="bg-white/10 backdrop-blur border border-white/20 rounded-lg p-3 pt-5 w-full min-h-[100px] flex flex-col gap-1.5 overflow-hidden">
                    {recentScans.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center italic mt-2">Aguardando leituras...</p>
                    ) : (
                      recentScans.map(s => (
                        <div key={s.identifier} className="flex items-center gap-2 text-sm text-gray-100 bg-white/10 border border-white/10 px-3 py-1.5 rounded-md">
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span className="truncate font-medium flex-1 text-left">{s.full_name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
      ) : (
        <>
          {/* Main Slide Area */}
          <div className="flex-1 w-full h-full relative bg-gray-50">
            <img 
              src={slides[currentSlide]} 
              alt={`Slide ${currentSlide + 1}`} 
              className="w-full h-full object-contain shadow-lg"
              draggable={false}
            />

            {/* QR Code Overlay no canto */}
            {persistentQR && (
              <div className="absolute bottom-12 right-12 bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-500 w-80">
                <h3 className="font-bold text-gray-900 mb-4">{persistentQR.title}</h3>
                
                <div className="p-2 bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
                  <QRCodeSVG 
                    value={`${appUrl}/#/s/${classId}/${persistentQR.step}`} 
                    size={200} 
                    level="H" 
                    includeMargin={false} 
                  />
                </div>

                <div className="mb-4 h-6">
                  {timeLeft !== null && timeLeft > 0 ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold animate-pulse">
                      <Clock className="w-3.5 h-3.5" /> Expira em {formatMinSec(timeLeft)}
                    </div>
                  ) : timeLeft === 0 ? (
                    <span className="text-xs font-bold text-red-500">QR CODE EXPIRADO</span>
                  ) : null}
                </div>
                
                {/* Live Names Stream Panel */}
                <div className="w-full relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-100 text-green-700 px-3 py-0.5 rounded-full text-[10px] font-bold tracking-wider flex items-center gap-1 border border-green-200">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> AO VIVO
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 pt-5 w-full min-h-[140px] flex flex-col gap-1.5 overflow-hidden">
                    {recentScans.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center italic mt-4">Aguardando leituras...</p>
                    ) : (
                      recentScans.map(s => (
                        <div key={s.identifier} className="flex items-center gap-2 text-sm text-gray-700 bg-white shadow-sm border border-gray-100 px-3 py-1.5 rounded-md animate-in slide-in-from-top-2 fade-in duration-300">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="truncate font-medium flex-1 text-left">{s.full_name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Navigation Areas (Click to progress) */}
          <div className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize z-0" onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))} />
          <div className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize z-0" onClick={() => setCurrentSlide(prev => Math.min(total - 1, prev + 1))} />

          {/* Bottom Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div 
              className="h-full bg-teal-500 transition-all duration-300 ease-out"
              style={{ width: `${((currentSlide + 1) / total) * 100}%` }}
            />
          </div>
        </>
      )}

    </div>
  );
}
