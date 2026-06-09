import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { normalizeIdentifier } from '../lib/identifier';
import { CheckCircle2, Clock, Loader2, HelpCircle } from 'lucide-react';
import clsx from 'clsx';

const STORAGE_KEY = (eid: string) => `participant_${eid}`;

export function StudentQuiz() {
  const { evaluationId } = useParams();
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [participantId, setParticipantId] = useState<number | null>(() => {
    if (!evaluationId) return null;
    const stored = localStorage.getItem(STORAGE_KEY(evaluationId));
    return stored ? parseInt(stored, 10) : null;
  });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [selectedAlt, setSelectedAlt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const pollRef = useRef<any>(null);

  const loadState = useCallback(async () => {
    if (!evaluationId || !participantId) return;
    try {
      const data = await api.get(`/evaluations/${evaluationId}/state?participant_id=${participantId}`);
      setState(data);
      setLoading(false);

      if (data.status === 'completed') {
        localStorage.removeItem(STORAGE_KEY(evaluationId));
        clearInterval(pollRef.current);
      }

      if (data.phase === 'question') {
        setFeedback(null);
      }

      if (data.phase === 'result') {
        setFeedback(data.got_correct ? 'correct' : 'wrong');
      }
    } catch (err) {
      console.error('Load state error:', err);
    }
  }, [evaluationId, participantId]);

  useEffect(() => {
    if (!participantId) return;
    loadState();
    pollRef.current = setInterval(loadState, 2000);
    return () => clearInterval(pollRef.current);
  }, [participantId, loadState]);

  useEffect(() => {
    if (state?.phase === 'question' && state?.phase_started_at && state?.question_time) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - state.phase_started_at;
        const remaining = (state.question_time * 1000) - elapsed;
        setTimeLeft(Math.max(0, Math.floor(remaining / 1000)));
      }, 200);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [state?.phase, state?.phase_started_at, state?.question_time]);

  useEffect(() => {
    if (state?.phase === 'question') {
      setSelectedAlt(state?.my_answer || null);
    }
  }, [state?.question?.id, state?.phase]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !identifier.trim() || !evaluationId) return;
    setJoining(true);
    setJoinError('');
    try {
      const participant = await api.post(`/evaluations/${evaluationId}/join`, {
        name: name.trim(),
        identifier: normalizeIdentifier(identifier),
      });
      setParticipantId(participant.id);
      localStorage.setItem(STORAGE_KEY(evaluationId), String(participant.id));
    } catch (err: any) {
      setJoinError(err.message || 'Erro ao entrar');
    } finally {
      setJoining(false);
    }
  };

  const handleLogout = () => {
    if (!evaluationId) return;
    localStorage.removeItem(STORAGE_KEY(evaluationId));
    setParticipantId(null);
    setState(null);
    setLoading(true);
  };

  const handleAnswer = async (alternativeId: number) => {
    if (submitting || selectedAlt || state?.my_answer) return;
    setSubmitting(true);
    setSelectedAlt(alternativeId);
    try {
      await api.post(`/evaluations/${evaluationId}/answer`, {
        participant_id: participantId,
        question_id: state.question.id,
        alternative_id: alternativeId,
      });
    } catch (err: any) {
      setSelectedAlt(null);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Tela de login ---
  if (!participantId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <HelpCircle className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Avaliação</h1>
            <p className="text-gray-500 mt-1">Digite seus dados para entrar</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="Seu nome"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF ou Email</label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="Seu CPF ou email"
                required
              />
            </div>

            {joinError && (
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{joinError}</p>
            )}

            <button
              type="submit"
              disabled={joining || !name.trim() || !identifier.trim()}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              Entrar na Avaliação
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Carregando estado ---
  if (!state || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Conectando...</p>
        </div>
      </div>
    );
  }

  // --- Aguardando início da avaliação ---
  if (state.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-teal-200 rounded-full animate-ping opacity-30" />
            <div className="relative w-20 h-20 bg-teal-100 rounded-2xl flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Você está na sala!</h2>
          <p className="text-gray-500 mb-1">
            {state.evaluation?.question_count
              ? `Aguardando o professor iniciar a avaliação (${state.evaluation.question_count} perguntas)...`
              : 'Aguardando o professor iniciar a avaliação...'}
          </p>
          <div className="flex justify-center gap-1.5 mt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <button
            onClick={handleLogout}
            className="mt-8 text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Sair e entrar com outro identificador
          </button>
        </div>
      </div>
    );
  }

  // --- Avaliação finalizada ---
  if (state.status === 'completed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Avaliação Finalizada!</h2>
          <p className="text-gray-500">Obrigado por participar.</p>
        </div>
      </div>
    );
  }

  // --- Pergunta ---
  if (state.phase === 'question' && state.question) {
    const timerRunning = timeLeft !== null && timeLeft > 0;
    const pct = state.question_time > 0
      ? ((state.question_time - (timeLeft ?? 0)) / state.question_time) * 100
      : 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-indigo-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">{state.evaluation.title}</span>
            <div className="flex items-center gap-2">
              <Clock className={clsx("w-4 h-4", timerRunning ? "text-amber-500" : "text-red-500")} />
              <span className={clsx("font-bold", timerRunning ? "text-amber-600" : "text-red-600")}>
                {timeLeft !== null ? `${timeLeft}s` : `${state.question_time}s`}
              </span>
            </div>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={clsx("h-1.5 rounded-full transition-all duration-200", timerRunning ? "bg-teal-500" : "bg-red-500")}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{state.question.text}</h2>
          <div className="space-y-3 flex-1">
            {state.question.alternatives.map((alt: any, idx: number) => {
              const isSelected = selectedAlt === alt.id;
              const isDisabled = !!selectedAlt || submitting;
              return (
                <button
                  key={alt.id}
                  onClick={() => handleAnswer(alt.id)}
                  disabled={isDisabled}
                  className={clsx(
                    "w-full px-5 py-4 rounded-xl text-left font-medium transition-all border-2",
                    isSelected
                      ? "bg-teal-50 border-teal-500 text-teal-800"
                      : "bg-white border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50/50",
                    isDisabled && !isSelected && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span className={clsx(
                    "inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm mr-3",
                    isSelected ? "bg-teal-500 text-white" : "bg-gray-200 text-gray-600"
                  )}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {alt.text}
                </button>
              );
            })}
          </div>

          {selectedAlt && (
            <div className="mt-6 text-center">
              <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1" />
              <p className="text-sm font-medium text-green-600">Resposta registrada!</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Resultado + aguardando próxima ---
  if (state.phase === 'result' && state.question) {
    const hasNext = state.evaluation?.question_count
      ? (state.question.order_index + 1) < state.evaluation.question_count
      : true;

    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-indigo-50 flex flex-col p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{state.question.text}</h2>
          <div className="space-y-2">
            {state.question.alternatives.map((alt: any, idx: number) => {
              const isMyAnswer = alt.id === state.my_answer;
              const isCorrect = alt.is_correct;
              let bg = 'bg-gray-50 border-gray-200';
              let textColor = 'text-gray-700';
              let icon = null;

              if (isCorrect) {
                bg = 'bg-green-50 border-green-400';
                textColor = 'text-green-800';
                icon = <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />;
              } else if (isMyAnswer && !isCorrect) {
                bg = 'bg-red-50 border-red-400';
                textColor = 'text-red-800';
                icon = <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center font-bold text-red-600">✕</span>;
              }

              return (
                <div key={alt.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${bg}`}>
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${isCorrect ? 'bg-green-500 text-white' : isMyAnswer ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className={`font-medium flex-1 ${textColor}`}>{alt.text}</span>
                  {icon}
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-center mb-6">
          <div className={clsx(
            "inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-lg",
            feedback === 'correct' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          )}>
            {feedback === 'correct' ? (
              <>✓ Você acertou!</>
            ) : (
              <>✕ Você errou</>
            )}
          </div>
        </div>

        {state.status === 'active' && hasNext && (
          <div className="text-center mt-auto">
            <div className="flex items-center justify-center gap-2 text-teal-600 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="font-medium text-sm">Aguardando próxima pergunta...</span>
            </div>
            <div className="flex justify-center gap-1.5 mt-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
