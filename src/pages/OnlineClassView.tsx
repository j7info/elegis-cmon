import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Clock, CheckCircle2, BarChart, BookOpen, LogIn, Loader2, HelpCircle, Award } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../lib/AuthContext';

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
  const [step, setStep] = useState<'join' | 'loading' | 'intro' | 'viewing' | 'completed' | 'evaluation'>('join');

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
  const [onlineEvalState, setOnlineEvalState] = useState<any>(null);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState<number | null>(null);
  const [evalTimerLeft, setEvalTimerLeft] = useState<number | null>(null);
  const [evalSubmitting, setEvalSubmitting] = useState(false);
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
  const isHistoricalSlide = progress && currentSlide < progress.current_slide;
  const canAdvance = isHistoricalSlide || (elapsed >= minRequired && !advancing);

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
          
          if ((progress?.current_slide || 0) === 0 && !progress?.completed_at) {
            setStep('intro');
          } else {
            setStep('viewing');
            startSlideTimer();
          }
        } catch (err) {
          console.error('Load PDF error:', err);
        }
      };
      loadPdf();
    }
  }, [step, classData?.presentation_url, progress]);

  // Go to previous slide
  const handleBack = () => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
      setAdvanceError(null);
    }
  };

  // Advance to next slide
  const handleAdvance = async () => {
    if (isHistoricalSlide) {
      setCurrentSlide(prev => prev + 1);
      setAdvanceError(null);
      return;
    }

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

  const refreshEvaluationState = useCallback(async () => {
    if (!loadEvalId || !identifier.trim()) return;
    const stateRes = await api.get(`/evaluations/${loadEvalId}/online/state?identifier=${encodeURIComponent(identifier.trim())}`);
    setOnlineEvalState(stateRes);
    setSelectedAlternativeId(null);
  }, [loadEvalId, identifier]);

  useEffect(() => {
    if (step !== 'evaluation' || onlineEvalState?.status !== 'in_progress') return;

    const interval = setInterval(() => {
      const startedAt = onlineEvalState.question_started_at || Date.now();
      const questionTime = onlineEvalState.evaluation?.question_time || 30;
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, questionTime - elapsed);
      setEvalTimerLeft(remaining);

      if (remaining === 0) {
        refreshEvaluationState().catch(() => {});
      }
    }, 500);

    return () => clearInterval(interval);
  }, [step, onlineEvalState, refreshEvaluationState]);

  // Start evaluation
  const handleStartEvaluation = async (forceNewAttempt = false) => {
    if (!classId) return;
    setEvalError(null);
    setEvalSubmitting(true);
    try {
      const onlineEval = await api.get(`/classes/${classId}/online/evaluation`);
      const startRes = await api.post(`/evaluations/${onlineEval.id}/online/start`, {
        identifier: identifier.trim(),
        force_new_attempt: forceNewAttempt,
      });
      setLoadEvalId(onlineEval.id);
      setOnlineEvalState(startRes);
      setSelectedAlternativeId(null);
      setEvalTimerLeft(startRes.time_left_seconds ?? startRes.evaluation?.question_time ?? null);
      setStep('evaluation');
    } catch (err: any) {
      setEvalError(err?.message || 'Erro ao iniciar avaliação');
    } finally {
      setEvalSubmitting(false);
    }
  };

  const handleAnswerEvaluation = async (alternativeId: number) => {
    if (!loadEvalId || !onlineEvalState?.attempt || !onlineEvalState?.question || evalSubmitting || selectedAlternativeId) return;
    setEvalSubmitting(true);
    setEvalError(null);
    setSelectedAlternativeId(alternativeId);
    try {
      const res = await api.post(`/evaluations/${loadEvalId}/online/answer`, {
        identifier: identifier.trim(),
        attempt_id: onlineEvalState.attempt.id,
        question_id: onlineEvalState.question.id,
        alternative_id: alternativeId,
      });
      setOnlineEvalState(res);
      setSelectedAlternativeId(null);
      setEvalTimerLeft(res.time_left_seconds ?? res.evaluation?.question_time ?? null);
    } catch (err: any) {
      setEvalError(err?.message || 'Não foi possível registrar a resposta');
      await refreshEvaluationState().catch(() => {});
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

  // Intro screen
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
          <div className="bg-teal-600 p-8 text-white text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4" />
            <h2 className="text-2xl font-bold">Como funciona a Aula Online</h2>
          </div>
          <div className="p-8 space-y-5 text-gray-600">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 font-bold text-sm">1</div>
              <p>Leia atentamente o conteúdo de cada slide da apresentação.</p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 font-bold text-sm">2</div>
              <p>Você precisará permanecer um <strong>tempo mínimo</strong> em cada slide (indicado no topo da tela).</p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 font-bold text-sm">3</div>
              <p>O botão de <strong>Avançar</strong> será liberado assim que esse tempo mínimo for atingido.</p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 font-bold text-sm">4</div>
              <p>Você pode usar o botão <strong>Voltar</strong> a qualquer momento para revisar slides anteriores.</p>
            </div>
            
            <button
              onClick={() => {
                setStep('viewing');
                startSlideTimer();
              }}
              className="w-full mt-8 py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition-colors text-lg"
            >
              Começar Aula
            </button>
          </div>
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
                  onClick={() => handleStartEvaluation()}
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
    const question = onlineEvalState?.question;
    const bestAttempt = onlineEvalState?.best_attempt;
    const attemptsRemaining = onlineEvalState?.attempts_remaining ?? 0;
    const questionTime = onlineEvalState?.evaluation?.question_time || 30;
    const timeLeft = evalTimerLeft ?? onlineEvalState?.time_left_seconds ?? questionTime;
    const timerPct = questionTime > 0 ? Math.max(0, Math.min(100, ((questionTime - timeLeft) / questionTime) * 100)) : 0;
    const isFinished = onlineEvalState?.status === 'idle' || onlineEvalState?.status === 'attempts_exhausted';

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-6 text-white">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <HelpCircle className="w-6 h-6" /> Avaliação
            </h1>
            <p className="text-sm text-teal-100 mt-1">
              {onlineEvalState?.evaluation?.title || classData?.title}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {isFinished ? (
              <div className="text-center py-8">
                <Award className="w-16 h-16 text-teal-500 mx-auto mb-4" />
                <h2 className="text-2xl font-black text-gray-900 mb-2">Avaliação concluída</h2>
                <p className="text-gray-500">
                  Melhor nota: <strong className="text-teal-700">{bestAttempt?.percentage ?? 0}%</strong>
                  {' '}({bestAttempt?.total_score ?? 0} de {bestAttempt?.total_possible ?? 0} pontos)
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Tentativas usadas: {onlineEvalState?.attempts_used ?? 0} de 3
                </p>
                {attemptsRemaining > 0 && (
                  <button
                    onClick={() => handleStartEvaluation(true)}
                    disabled={evalSubmitting}
                    className="mt-6 px-6 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                  >
                    Fazer nova tentativa ({attemptsRemaining} restante{attemptsRemaining > 1 ? 's' : ''})
                  </button>
                )}
              </div>
            ) : !question ? (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 text-teal-600 animate-spin mx-auto mb-3" />
                <p className="text-gray-400">Carregando questão...</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <span className="text-sm font-bold text-teal-700">
                      Questão {(onlineEvalState?.question_index ?? 0) + 1} de {onlineEvalState?.evaluation?.question_count || 0}
                    </span>
                    <span className={clsx(
                      'text-sm font-black tabular-nums',
                      timeLeft > 10 ? 'text-teal-700' : timeLeft > 0 ? 'text-amber-600' : 'text-red-600'
                    )}>
                      {timeLeft}s
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 transition-all" style={{ width: `${timerPct}%` }} />
                  </div>
                </div>

                <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="font-bold text-gray-900 leading-relaxed flex-1">{question.text}</h3>
                    <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                      {question.points} pts
                    </span>
                  </div>
                  <div className="space-y-2">
                    {question.alternatives.map((alt: any, aIdx: number) => (
                      <button
                        key={alt.id}
                        onClick={() => handleAnswerEvaluation(alt.id)}
                        disabled={evalSubmitting || timeLeft <= 0 || selectedAlternativeId !== null}
                        className={clsx(
                          'w-full text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all disabled:cursor-not-allowed',
                          selectedAlternativeId === alt.id
                            ? 'border-teal-500 bg-teal-50 text-teal-800'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 disabled:opacity-60'
                        )}
                      >
                        <span className="mr-2 font-bold text-xs">{String.fromCharCode(65 + aIdx)}</span>
                        {alt.text}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100">
            {evalError && (
              <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                {evalError}
              </div>
            )}
            {isFinished ? (
              <Link
                to="/"
                className="block w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-center transition-colors"
              >
                Voltar ao Início
              </Link>
            ) : (
              <p className="text-sm text-gray-500 text-center">
                Ao selecionar uma alternativa, o sistema avança para a próxima questão.
              </p>
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
            ) : isHistoricalSlide ? (
              <span className="text-xs text-teal-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Lido
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
        
        {/* Left: Back button & Progress bar */}
        <div className="flex-1 flex items-center gap-4">
          <button
            onClick={handleBack}
            disabled={currentSlide === 0}
            className={clsx(
              'px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1 transition-all',
              currentSlide > 0
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-transparent text-gray-600 cursor-not-allowed opacity-50'
            )}
          >
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          
          <div className="hidden sm:block max-w-[150px] w-full">
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-300"
                style={{ width: `${slidePct}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 mt-1 block">{slidePct}% lido</span>
          </div>
        </div>

        {/* Center: Error messages */}
        <div className="flex-1 text-center">
          {advanceError && (
            <p className="text-xs text-amber-400">{advanceError}</p>
          )}
        </div>

        {/* Right: Advance button */}
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
              ) : isHistoricalSlide ? (
                <span className="text-sm">Avançar</span>
              ) : (
                <span className="text-sm">{canAdvance ? 'Avançar' : `Aguarde ${formatTime(Math.max(0, minRequired - elapsed))}`}</span>
              )}
              {!advancing && <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
