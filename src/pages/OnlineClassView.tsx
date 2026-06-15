import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { normalizeIdentifier } from '../lib/identifier';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Clock, CheckCircle2, BarChart, BookOpen, LogIn, Loader2, HelpCircle, Award } from 'lucide-react';
import clsx from 'clsx';import { useAuth } from '../lib/AuthContext';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function OnlineClassView() {
  const { classId } = useParams();
  const { user } = useAuth();
  const [step, setStep] = useState<'join' | 'loading' | 'viewing' | 'completed' | 'evaluation'>('join');

  // Join form
  const [identifier, setIdentifier] = useState(user?.cpf || user?.email || '');
  const [fullName, setFullName] = useState(user?.name || '');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);

  // Class data
  const [classData, setClassData] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [totalSlides, setTotalSlides] = useState(0);
  const [slideImages, setSlideImages] = useState<string[]>([]);
  const [presencePct, setPresencePct] = useState<number | null>(null);

  // Evaluation state
  const [evalQuestions, setEvalQuestions] = useState<any[]>([]);
  const [evalParticipant, setEvalParticipant] = useState<any>(null);
  const [evalAnswers, setEvalAnswers] = useState<Record<number, number>>({});
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [loadEvalId, setLoadEvalId] = useState<number | null>(null);

  // Slide viewing
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideStartedAt, setSlideStartedAt] = useState<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minRequired = classData?.slide_minimum_seconds ?? 30;
  const canAdvance = elapsed >= minRequired && !advancing;

  // Timer: update elapsed time every second
  useEffect(() => {
    if (step !== 'viewing' || progress?.completed_at) return;
    const interval = setInterval(() => {
      setElapsed((Date.now() - slideStartedAt) / 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [step, slideStartedAt, progress?.completed_at]);

  // Render PDF slide
  const renderSlide = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      if (pageNum >= pdfDoc.numPages) return;

      const page = await pdfDoc.getPage(pageNum + 1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error('Render slide error:', err);
    }
  }, [pdfDoc]);

  useEffect(() => {
    if (step === 'viewing') {
      renderSlide(currentSlide);
    }
  }, [step, currentSlide, renderSlide]);

  // Timer per slide
  const startSlideTimer = () => {
    const now = Date.now();
    setSlideStartedAt(now);
    setElapsed(0);
  };

  // Join class
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !fullName.trim() || !classId) return;

    setJoinLoading(true);
    setJoinError(null);

    try {
      const res = await api.post(`/classes/${classId}/online/join`, {
        identifier: identifier.trim(),
        full_name: fullName.trim(),
      });
      setProgress(res.progress);
      setClassData({
        expected_duration_minutes: res.expected_duration_minutes,
        slide_minimum_seconds: res.slide_minimum_seconds,
        presentation_url: null, // Will load below
      });

      // Load class data
      const stateRes = await api.get(`/classes/${classId}/online/state?identifier=${encodeURIComponent(identifier.trim())}`);
      setClassData(stateRes.class);
      setProgress(stateRes.progress);
      setPresencePct(stateRes.presence_percentage);

      if (stateRes.progress?.completed_at) {
        setStep('completed');
        setPresencePct(stateRes.presence_percentage);
      } else {
        setCurrentSlide(stateRes.progress?.current_slide || 0);
        setStep('loading');
      }
    } catch (err: any) {
      setJoinError(err?.response?.data?.error || 'Erro ao acessar aula');
    } finally {
      setJoinLoading(false);
    }
  };

  // After loading slide count, start viewing
  useEffect(() => {
    if (step === 'loading' && classData?.presentation_url) {
      const loadPdf = async () => {
        try {
          const apiBase = import.meta.env.VITE_API_URL || '/api';
          const fileUrl = String(classData.presentation_url).replace(/^\/api/, apiBase);
          const pdf = await pdfjsLib.getDocument({ url: fileUrl }).promise;
          setPdfDoc(pdf);
          setTotalSlides(pdf.numPages);
          setStep('viewing');
          startSlideTimer();
        } catch (err) {
          console.error('Load PDF error:', err);
        }
      };
      loadPdf();
    }
  }, [step, classData?.presentation_url]);

  // Advance to next slide
  const handleAdvance = async () => {
    if (!canAdvance || !classId) return;
    setAdvancing(true);
    setAdvanceError(null);

    try {
      const res = await api.post(`/classes/${classId}/online/advance`, {
        identifier: identifier.trim(),
      });
      setProgress(res.progress);

      if (res.progress.current_slide >= totalSlides) {
        // All slides viewed — complete
        await handleComplete();
      } else {
        setCurrentSlide(res.progress.current_slide);
        startSlideTimer();
      }
    } catch (err: any) {
      if (err?.status === 429) {
        const remaining = err?.response?.data?.remaining_seconds || minRequired;
        setAdvanceError(`Aguarde mais ${remaining} segundo(s)`);
      } else {
        setAdvanceError(err?.response?.data?.error || 'Erro ao avançar');
      }
    } finally {
      setAdvancing(false);
    }
  };

  const handleComplete = async () => {
    try {
      const res = await api.post(`/classes/${classId}/online/complete`, {
        identifier: identifier.trim(),
      });
      setProgress(res.progress);
      setPresencePct(res.presence_percentage);
      setStep('completed');
    } catch (err: any) {
      setAdvanceError(err?.response?.data?.error || 'Erro ao concluir');
    }
  };

  // Start evaluation
  const handleStartEvaluation = async () => {
    if (!classId) return;
    setEvalError(null);
    try {
      // Encontra a primeira avaliação online vinculada a esta aula
      const evals = await api.get(`/classes/${classId}/evaluations`);
      const onlineEval = evals.find((e: any) => e.type === 'online');
      if (!onlineEval) {
        setEvalError('Nenhuma avaliação disponível para esta aula');
        return;
      }

      // Inicia a avaliação
      const startRes = await api.post(`/evaluations/${onlineEval.id}/online/start`, {
        identifier: identifier.trim(),
      });
      setEvalParticipant(startRes.participant);
      setLoadEvalId(onlineEval.id);

      // Carrega perguntas
      const qRes = await api.get(`/evaluations/${onlineEval.id}/online/questions?identifier=${encodeURIComponent(identifier.trim())}`);
      if (qRes.already_answered) {
        setEvalResult({ ...qRes, total_possible: qRes.total_possible || 1 });
        setEvalQuestions([]);
        setStep('evaluation');
        return;
      }
      setEvalQuestions(qRes.questions || []);
      setEvalAnswers({});
      setStep('evaluation');
    } catch (err: any) {
      setEvalError(err?.response?.data?.error || 'Erro ao iniciar avaliação');
    }
  };

  // Submit evaluation
  const handleSubmitEvaluation = async () => {
    if (!loadEvalId || !classId) return;
    setEvalSubmitting(true);
    setEvalError(null);
    try {
      const answers = Object.entries(evalAnswers).map(([qId, altIdx]) => {
        const question = evalQuestions.find((q: any) => q.id === parseInt(qId));
        const alt = question?.alternatives[altIdx];
        return { question_id: parseInt(qId), alternative_id: alt?.id || null };
      });

      const res = await api.post(`/evaluations/${loadEvalId}/online/submit`, {
        identifier: identifier.trim(),
        answers,
      });
      setEvalResult(res);
    } catch (err: any) {
      setEvalError(err?.response?.data?.error || 'Erro ao enviar respostas');
    } finally {
      setEvalSubmitting(false);
    }
  };

  const canAccessEval = (presencePct ?? 0) >= 60;

  // Joining screen
  if (step === 'join') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-6 text-white text-center">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-90" />
            <h1 className="text-xl font-bold">Aula Online</h1>
            <p className="text-sm text-teal-100 mt-1">Insira seus dados para começar</p>
          </div>

          <form onSubmit={handleJoin} className="p-6 space-y-4">
            {joinError && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                {joinError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="Seu nome"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF ou E-mail</label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="Seu CPF ou e-mail"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Usado para identificar sua presença</p>
            </div>

            <button
              type="submit"
              disabled={joinLoading || !identifier.trim() || !fullName.trim()}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              {joinLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {joinLoading ? 'Entrando...' : 'Acessar Aula'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Loading screen
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Preparando aula...</p>
        </div>
      </div>
    );
  }

  // Completed screen
  if (step === 'completed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden text-center">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-8 text-white">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-3" />
            <h1 className="text-2xl font-bold">Aula Concluída!</h1>
            <p className="text-green-100 mt-1">Você finalizou a leitura dos slides.</p>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-2">
                <BarChart className="w-4 h-4" /> Sua presença nesta aula
              </div>
              <div className={clsx(
                'text-4xl font-black',
                (presencePct ?? 0) >= 75 ? 'text-green-600' :
                (presencePct ?? 0) >= 50 ? 'text-amber-600' : 'text-red-600'
              )}>
                {presencePct ?? 0}%
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mt-3">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-500',
                    (presencePct ?? 0) >= 75 ? 'bg-green-500' :
                    (presencePct ?? 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${Math.min(presencePct ?? 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Tempo total: {progress ? formatTime(progress.total_time_spent_seconds) : '0:00'} · Esperado: {classData?.expected_duration_minutes || '?'} min
              </p>
            </div>

            {canAccessEval && (
              <>
                {evalError && (
                  <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                    {evalError}
                  </div>
                )}
                <button
                  onClick={handleStartEvaluation}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <HelpCircle className="w-5 h-5" /> Iniciar Avaliação
                </button>
              </>
            )}

            {!canAccessEval && (
              <div className="p-3 bg-amber-50 text-amber-700 text-sm rounded-lg border border-amber-100">
                Presença mínima de 60% necessária para realizar a avaliação.
              </div>
            )}

            <Link
              to="/"
              className="block w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition-colors"
            >
              Voltar ao Início
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Evaluation screen
  if (step === 'evaluation') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-6 text-white">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <HelpCircle className="w-6 h-6" /> Avaliação
            </h1>
            <p className="text-sm text-teal-100 mt-1">{classData?.title} — Responda todas as questões</p>
          </div>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {evalResult ? (
              <div className="text-center py-8">
                <Award className="w-16 h-16 text-teal-500 mx-auto mb-4" />
                <h2 className="text-2xl font-black text-gray-900 mb-2">
                  {evalResult.percentage}%
                </h2>
                <p className="text-gray-500">
                  {evalResult.total_score} de {evalResult.total_possible} pontos
                </p>
              </div>
            ) : evalQuestions.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Carregando perguntas...</p>
            ) : (
              evalQuestions.map((q: any, qIdx: number) => {
                const selectedAltIdx = evalAnswers[q.id] ?? -1;
                return (
                  <div key={q.id} className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-bold text-gray-900 text-sm leading-relaxed flex-1">
                        <span className="text-teal-600 mr-2">{qIdx + 1}.</span>
                        {q.text}
                      </h3>
                      <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                        {q.points} pts
                      </span>
                    </div>
                    <div className="space-y-2">
                      {q.alternatives.map((alt: any, aIdx: number) => (
                        <button
                          key={alt.id}
                          onClick={() => setEvalAnswers(prev => ({ ...prev, [q.id]: aIdx }))}
                          className={clsx(
                            'w-full text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all',
                            selectedAltIdx === aIdx
                              ? 'border-teal-500 bg-teal-50 text-teal-800'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                          )}
                        >
                          <span className="mr-2 font-bold text-xs">
                            {String.fromCharCode(65 + aIdx)}
                          </span>
                          {alt.text}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100">
            {evalError && (
              <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                {evalError}
              </div>
            )}
            {evalResult ? (
              <Link
                to="/"
                className="block w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-center transition-colors"
              >
                Voltar ao Início
              </Link>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {Object.keys(evalAnswers).length} de {evalQuestions.length} respondidas
                </span>
                <button
                  onClick={handleSubmitEvaluation}
                  disabled={evalSubmitting || Object.keys(evalAnswers).length < evalQuestions.length}
                  className="px-8 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                >
                  {evalSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {evalSubmitting ? 'Enviando...' : 'Finalizar Avaliação'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Slide viewer
  const slidePct = totalSlides > 0 ? Math.round(((currentSlide) / totalSlides) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Top bar */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-teal-400" />
          <span className="text-sm font-medium text-gray-200 truncate max-w-[300px]">
            {classData?.title || 'Aula Online'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Timer / elapsed */}
          <div className="flex items-center gap-2">
            {progress?.completed_at ? (
              <span className="text-xs text-green-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Concluído
              </span>
            ) : (
              <>
                <Clock className="w-4 h-4 text-gray-400" />
                <span className={clsx(
                  'text-sm font-mono font-bold',
                  elapsed < minRequired ? 'text-amber-400' : 'text-green-400'
                )}>
                  {formatTime(elapsed)}
                </span>
                {elapsed < minRequired && (
                  <span className="text-xs text-amber-500">
                    ({formatTime(minRequired - elapsed)})
                  </span>
                )}
              </>
            )}
          </div>

          {/* Progress */}
          <div className="text-xs text-gray-400">
            {currentSlide + 1} / {totalSlides}
          </div>
        </div>
      </header>

      {/* Slide area */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
          style={{ maxHeight: 'calc(100vh - 160px)' }}
        />
      </div>

      {/* Bottom bar */}
      <footer className="bg-gray-800 border-t border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
        {/* Progress bar */}
        <div className="flex-1 max-w-[200px]">
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${slidePct}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">{slidePct}% lido</span>
        </div>

        {/* Navigation info */}
        <div className="flex-1 text-center">
          {advanceError && (
            <p className="text-xs text-amber-400">{advanceError}</p>
          )}
        </div>

        {/* Advance button */}
        <div className="flex-1 flex justify-end">
          {currentSlide >= totalSlides - 1 ? (
            <button
              onClick={handleComplete}
              disabled={!canAdvance}
              className={clsx(
                'px-6 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all',
                canAdvance
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              )}
            >
              <CheckCircle2 className="w-4 h-4" /> Concluir
            </button>
          ) : (
            <button
              onClick={handleAdvance}
              disabled={!canAdvance || advancing}
              className={clsx(
                'px-6 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition-all',
                canAdvance
                  ? 'bg-teal-600 hover:bg-teal-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              )}
            >
              {advancing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              {canAdvance ? 'Avançar' : `Aguarde ${formatTime(Math.max(0, minRequired - elapsed))}`}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
