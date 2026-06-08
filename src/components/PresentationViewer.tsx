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
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    
    async function loadPDF() {
      try {
        setLoading(true);
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const generatedSlides: string[] = [];
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); // High quality
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (!context) continue;
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          // @ts-ignore
          await page.render({ canvasContext: context, viewport }).promise;
          generatedSlides.push(canvas.toDataURL('image/jpeg', 0.8));
        }
        
        if (isMounted) {
          setSlides(generatedSlides);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Error loading PDF:', err);
        if (isMounted) {
          setError('Erro ao ler o PDF. Certifique-se de que é um arquivo válido.');
          setLoading(false);
        }
      }
    }
    
    loadPDF();
    
    return () => { isMounted = false; };
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

  const total = slides.length;
  // Calculate QR trigger slides
  // start: 0, end: total - 1, middle: floor(total / 2) if total >= 3
  const hasMiddle = total >= 3;
  const startSlide = 0;
  const middleSlide = hasMiddle ? Math.floor(total / 2) : -1;
  const endSlide = total - 1;

  const pStart = classData?.points_start ?? 40;
  const pMiddle = classData?.points_middle ?? 30;
  const pEnd = classData?.points_end ?? 30;

  let activeQR = null;
  if (currentSlide === startSlide) {
    activeQR = { step: 'start', title: `Registre sua Entrada - ${pStart} pts` };
  } else if (currentSlide === middleSlide) {
    activeQR = { step: 'middle', title: `Confirme sua Presença - ${pMiddle} pts` };
  } else if (currentSlide === endSlide && total > 1) { // If total is 1, start handles it
    activeQR = { step: 'end', title: `Registre sua Saída - ${pEnd} pts` };
  }

  useEffect(() => {
    if (activeQR && classData) {
      const step = activeQR.step;
      const activeAt = classData[`qr_${step}_at`];
      if (!activeAt) {
        onActivateQR(step);
      }
    }
  }, [activeQR, classData, onActivateQR]);

  useEffect(() => {
    if (!activeQR || !classData) {
      setTimeLeft(null);
      return;
    }
    const step = activeQR.step;
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
  }, [activeQR, classData]);

  // Filter recent scans for the currently active QR step
  const recentScans = activeQR ? attendances
    .filter(a => {
      if (activeQR.step === 'start') return !!a.scan_start;
      if (activeQR.step === 'middle') return !!a.scan_middle;
      return !!a.scan_end;
    })
    .sort((a, b) => {
      const aTime = activeQR.step === 'start' ? a.scan_start : activeQR.step === 'middle' ? a.scan_middle : a.scan_end;
      const bTime = activeQR.step === 'start' ? b.scan_start : activeQR.step === 'middle' ? b.scan_middle : b.scan_end;
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
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black flex flex-col font-sans select-none overflow-hidden group">
      
      {/* Top Controls Overlay */}
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

      {/* Main Slide Area */}
      <div className="flex-1 w-full h-full relative flex items-center justify-center">
        {/* Slide Image */}
        <img 
          src={slides[currentSlide]} 
          alt={`Slide ${currentSlide + 1}`} 
          className="max-w-full max-h-full object-contain shadow-2xl"
        />

        {/* QR Code Overlay via Slide trigger */}
        {activeQR && (
          <div className="absolute bottom-12 right-12 bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-500 w-80">
            <h3 className="font-bold text-gray-900 mb-4">{activeQR.title}</h3>
            
            <div className="p-2 bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
              <QRCodeSVG 
                value={`${appUrl}/#/s/${classId}/${activeQR.step}`} 
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
            
            {/* Live Names Stream Panel inside Overlay */}
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

    </div>
  );
}
