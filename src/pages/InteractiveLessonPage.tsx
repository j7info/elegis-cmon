import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { InteractiveLesson_ExcelBasico } from './InteractiveLesson_ExcelBasico';
import SigadocSimulador from '../components/interactive/SigadocSimulador/SigadocSimulador';
import { useAuth } from '../lib/AuthContext';
import { BookOpen, LogIn, Loader2, CheckCircle2, BarChart, ArrowLeft, HelpCircle, Award } from 'lucide-react';
import clsx from 'clsx';

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function InteractiveLessonPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [step, setStep] = useState<'join' | 'viewing' | 'completed' | 'evaluation'>('join');
  const [identifier, setIdentifier] = useState(user?.cpf || user?.email || '');
  const [fullName, setFullName] = useState(user?.name || '');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [onlineEvalState, setOnlineEvalState] = useState<any>(null);
  const [interactiveProgress, setInteractiveProgress] = useState<any>(null);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState<number | null>(null);
  const [evalTimerLeft, setEvalTimerLeft] = useState<number | null>(null);
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [loadEvalId, setLoadEvalId] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.lang = 'pt-BR';
    document.documentElement.classList.add('notranslate');
    document.documentElement.setAttribute('translate', 'no');
    document.body.classList.add('notranslate');
    document.body.setAttribute('translate', 'no');
    document.getElementById('root')?.setAttribute('translate', 'no');
  }, []);

  useEffect(() => {
    if (!user) return;
    setIdentifier(prev => prev || user.cpf || user.email || user.matricula || '');
    setFullName(prev => prev || user.name || '');
  }, [user]);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const data = await api.get(`/classes/${classId}/interactive`);
        setConfig(data);
      } catch (err: any) {
        if (err.status === 404) {
          setError('Aula interativa não configurada.');
        } else {
          setError('Erro ao carregar aula interativa.');
        }
      } finally {
        setLoading(false);
      }
    }
    if (classId) fetchConfig();
  }, [classId]);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (step !== 'viewing') return;

      if (e.data?.type === 'INTERACTIVE_SLIDE_END') {
        if (reviewMode || e.data.data?.review_mode) return;

        try {
          const res = await api.post(`/classes/${classId}/online/advance`, {
            identifier,
            slide_index: e.data.data?.slide_index,
            total_slides: e.data.data?.total_slides,
          });
          if (res?.progress) setInteractiveProgress(res.progress);
        } catch (err: any) {
          // If the backend rejects a premature event, keep the lesson usable and log it.
          console.warn('Interactive slide progress was not recorded', err);
        }
        return;
      }

      if (e.data?.type === 'INTERACTIVE_COMPLETE' || e.data?.type === 'LESSON_PROGRESS') {
        if (e.data.data?.score === 100 || !e.data.data?.score) {
          try {
            await api.post(`/classes/${classId}/interactive/complete`, {
              identifier,
            });
            setReviewMode(false);
            setStep('completed');
          } catch (err) {
            console.error('Error completing interactive lesson', err);
            alert('Não foi possível registrar a conclusão da aula. Verifique a conexão.');
          }
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [classId, step, identifier, reviewMode]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !fullName.trim() || !classId) return;

    setJoinLoading(true);
    setJoinError(null);

    try {
      await api.post(`/classes/${classId}/interactive/join`, {
        identifier: identifier.trim(),
        full_name: fullName.trim(),
      });
      // Try to check state to see if it's already completed
      try {
        const stateRes = await api.get(`/classes/${classId}/interactive/state?identifier=${encodeURIComponent(identifier.trim())}`);
        setInteractiveProgress(stateRes.progress || null);
        if (stateRes.progress?.completed_at) {
          setReviewMode(false);
          setStep('completed');
          return;
        }
      } catch(e) {
        // Ignore state error, it might not be a standard online class
      }
      
      setReviewMode(false);
      setStep('viewing');
    } catch (err: any) {
      setJoinError(err?.message || 'Erro ao acessar aula');
    } finally {
      setJoinLoading(false);
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

  if (loading) return <div translate="no" className="notranslate p-8 text-center text-gray-500 flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>;
  if (error) return <div translate="no" className="notranslate p-8 text-center text-red-600 min-h-screen flex items-center justify-center">{error}</div>;
  if (!config) return null;

  const buildHtmlUrl = () => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const rawUrl = String(config.html_url || '').replace(/^\/api/, apiBase);
    const separator = rawUrl.includes('?') ? '&' : '?';
    const minSeconds = Math.max(0, Number(config.slide_minimum_seconds ?? 0) || 0);
    const unlockedSlides = Math.max(0, Number(interactiveProgress?.current_slide ?? 0) || 0);
    const params = new URLSearchParams({
      min_seconds: String(minSeconds),
      review: reviewMode ? '1' : '0',
      unlocked_slides: String(unlockedSlides),
    });
    return `${rawUrl}${separator}${params.toString()}`;
  };

  if (step === 'join') {
    return (
      <main key="join" translate="no" className="notranslate min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative">
          <button onClick={() => navigate(-1)} className="absolute top-4 left-4 text-white/80 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white text-center">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-90" />
            <h1 className="text-xl font-bold">Aula Interativa</h1>
            <p className="text-sm text-purple-100 mt-1">Identifique-se para iniciar a simulação</p>
          </div>

          <form onSubmit={handleJoin} className="p-6 space-y-4">
            <div className={`p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100 ${!joinError ? 'hidden' : ''}`}>
              {joinError || 'Erro'}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                maxLength={255}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
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
                maxLength={255}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                placeholder="Seu CPF ou e-mail"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Sua presença de 100% será vinculada a este identificador</p>
            </div>

            <button
              type="submit"
              disabled={joinLoading || !identifier.trim() || !fullName.trim()}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              {joinLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {joinLoading ? 'Entrando...' : 'Acessar Aula'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (step === 'completed') {
    return (
      <main key="completed" translate="no" className="notranslate min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden text-center">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-8 text-white">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-3" />
            <h1 className="text-2xl font-bold">Aula Concluída!</h1>
            <p className="text-green-100 mt-1">Você finalizou a simulação interativa.</p>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-2">
                <BarChart className="w-4 h-4" /> Sua presença nesta aula
              </div>
              <div className="text-4xl font-black text-green-600">
                100%
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mt-3">
                <div className="h-full bg-green-500 transition-all duration-500" style={{ width: '100%' }} />
              </div>
            </div>

            <button
              onClick={() => handleStartEvaluation()}
              disabled={evalSubmitting}
              className="block w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
            >
              {evalSubmitting ? 'Carregando avaliação...' : 'Responder Questionário'}
            </button>
            {evalError && (
              <div className="p-3 bg-amber-50 text-amber-700 text-sm rounded-lg border border-amber-100">
                {evalError}
              </div>
            )}
            <button
              onClick={() => navigate(-1)}
              className="block w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition-colors"
            >
              Voltar ao Início
            </button>
            <button
              onClick={() => {
                setReviewMode(true);
                setStep('viewing');
              }}
              className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors"
            >
              Rever Aula
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (step === 'evaluation') {
    const question = onlineEvalState?.question;
    const bestAttempt = onlineEvalState?.best_attempt;
    const attemptsRemaining = onlineEvalState?.attempts_remaining ?? 0;
    const questionTime = onlineEvalState?.evaluation?.question_time || 30;
    const timeLeft = evalTimerLeft ?? onlineEvalState?.time_left_seconds ?? questionTime;
    const timerPct = questionTime > 0 ? Math.max(0, Math.min(100, ((questionTime - timeLeft) / questionTime) * 100)) : 0;
    const isFinished = onlineEvalState?.status === 'idle' || onlineEvalState?.status === 'attempts_exhausted';

    return (
      <main key="evaluation" translate="no" className="notranslate min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-6 text-white">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <HelpCircle className="w-6 h-6" /> Questionário da Aula
            </h1>
            <p className="text-sm text-teal-100 mt-1">
              {onlineEvalState?.evaluation?.title || config?.title || 'Avaliação'}
            </p>
          </div>

          <div className="p-6 space-y-6">
            {isFinished ? (
              <div className="text-center py-8">
                <Award className="w-16 h-16 text-teal-500 mx-auto mb-4" />
                <h2 className="text-2xl font-black text-gray-900 mb-2">Questionário concluído</h2>
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
                      {formatTime(timeLeft)}
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

          <div className="p-6 border-t border-gray-100">
            {evalError && (
              <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                {evalError}
              </div>
            )}
            {isFinished ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setStep('completed')}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition-colors"
                >
                  Voltar à Aula
                </button>
                <Link
                  to="/"
                  className="block w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-center transition-colors"
                >
                  Voltar ao Início
                </Link>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center">
                Ao selecionar uma alternativa, o sistema avança para a próxima questão.
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Step viewing
  if (config.type === 'html') {
    return (
      <main key="html" translate="no" className="notranslate w-full h-screen bg-gray-100 flex flex-col">
        <div className="bg-white border-b p-4 flex justify-between items-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-800">Aula Interativa</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-teal-600 bg-teal-50 px-3 py-1 rounded-full animate-pulse">
              Em andamento...
            </span>
            <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-medium transition-colors">
              Voltar
            </button>
          </div>
        </div>
        <div className="flex-1 w-full relative">
          {config.html_url ? (
            <iframe
              src={buildHtmlUrl()}
              className="absolute top-0 left-0 w-full h-full border-none"
              sandbox="allow-scripts allow-forms allow-popups"
              title="Aula Interativa"
            />
          ) : (
            <iframe
              srcDoc={config.html_content}
              className="absolute top-0 left-0 w-full h-full border-none"
              sandbox="allow-scripts allow-forms allow-popups"
              title="Aula Interativa"
            />
          )}
        </div>
      </main>
    );
  }

  if (config.type === 'react') {
    if (config.definition?.id === 'excel-basico') {
      return (
        <main key="react-excel" translate="no" className="notranslate relative">
          <button onClick={() => navigate(-1)} className="absolute top-4 right-4 px-4 py-2 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-sm font-medium z-10">
            Voltar
          </button>
          <InteractiveLesson_ExcelBasico />
        </main>
      );
    }

    if (config.definition?.id === 'sigadoc-001') {
      return (
        <main key="react-sigadoc" translate="no" className="notranslate relative h-screen w-full">
          <button onClick={() => navigate(-1)} className="absolute top-4 left-4 px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-md hover:bg-slate-50 text-sm font-semibold text-slate-700 z-50 transition-all">
            ← Voltar
          </button>
          <SigadocSimulador />
        </main>
      );
    }

    return (
      <main key="react-unknown" translate="no" className="notranslate p-8 text-center text-gray-600">
        Componente React não mapeado para ID: {config.definition?.id}
      </main>
    );
  }

  return <div translate="no" className="notranslate p-8 text-center text-gray-600">Tipo de aula desconhecido: {config.type}</div>;
}
