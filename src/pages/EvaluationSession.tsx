import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Play, CheckCircle2, Clock, Users, Award, HelpCircle } from 'lucide-react';
import clsx from 'clsx';

export function EvaluationSession() {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const pollRef = useRef<any>(null);

  const loadSession = useCallback(async () => {
    if (!evaluationId) return;
    try {
      const data = await api.get(`/evaluations/${evaluationId}/session`);
      setSession(data);
      setLoading(false);
    } catch (err) {
      console.error('Load session error:', err);
    }
  }, [evaluationId]);

  useEffect(() => {
    loadSession();
    pollRef.current = setInterval(loadSession, 2000);
    return () => clearInterval(pollRef.current);
  }, [loadSession]);

  useEffect(() => {
    if (session?.evaluation?.phase === 'question' && session?.evaluation?.phase_started_at) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - session.evaluation.phase_started_at;
        const remaining = (session.evaluation.question_time * 1000) - elapsed;
        setTimeLeft(Math.max(0, Math.floor(remaining / 1000)));
      }, 200);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [session?.evaluation?.phase, session?.evaluation?.phase_started_at, session?.evaluation?.question_time]);

  const handleAction = async (action: string) => {
    try {
      await api.post(`/evaluations/${evaluationId}/${action}`);
    } catch (err) {
      console.error('Action error:', err);
    }
  };

  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const quizUrl = `${appUrl}/#/quiz/${evaluationId}`;

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Carregando sessão...</div>;
  }

  if (!session) {
    return <div className="p-8 text-center text-gray-500">Avaliação não encontrada</div>;
  }

  const { evaluation, participants, current_question, result_data, participant_answers, questions } = session;
  const totalQuestions = questions?.length || 0;
  const answeredCount = participant_answers?.length || 0;

  const getPhaseTitle = () => {
    switch (evaluation.phase) {
      case 'idle': return 'Pronto para iniciar';
      case 'waiting': return 'Sala de Espera';
      case 'question': return `Pergunta ${evaluation.current_question + 1} de ${totalQuestions}`;
      case 'result': return 'Resultado';
      case 'completed': return 'Avaliação Finalizada';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{evaluation.title}</h1>
            <p className="text-sm text-gray-500">{getPhaseTitle()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {evaluation.status === 'draft' && (
            <button
              onClick={() => handleAction('start')}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex items-center gap-2 transition-colors"
            >
              <Play className="w-5 h-5" /> Iniciar Sala de Espera
            </button>
          )}
          {evaluation.status === 'waiting' && (
            <button
              onClick={() => handleAction('begin')}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex items-center gap-2 transition-colors"
            >
              <Play className="w-5 h-5" /> Iniciar Questionário
            </button>
          )}
          {evaluation.status === 'active' && evaluation.phase === 'question' && (
            <button
              onClick={() => handleAction('next-phase')}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 transition-colors"
            >
              Mostrar Resultado
            </button>
          )}
          {evaluation.status === 'active' && evaluation.phase === 'result' && (
            <button
              onClick={() => handleAction('next-phase')}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex items-center gap-2 transition-colors"
            >
              {evaluation.current_question + 1 >= totalQuestions ? 'Finalizar Avaliação' : 'Próxima Pergunta'}
            </button>
          )}
          {evaluation.status === 'active' && (
            <button
              onClick={() => handleAction('end')}
              className="px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-medium transition-colors"
            >
              Encerrar
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {evaluation.phase === 'idle' && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100">
              <HelpCircle className="w-16 h-16 text-teal-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{evaluation.title}</h2>
              <p className="text-gray-500 mb-2">{totalQuestions} pergunta(s) · {evaluation.question_time}s por pergunta</p>
              <p className="text-gray-400 text-sm mb-8">Pronto para iniciar a avaliação.</p>
              <button
                onClick={() => handleAction('start')}
                className="px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-lg flex items-center gap-2 mx-auto transition-colors"
              >
                <Play className="w-5 h-5" /> Iniciar Sala de Espera
              </button>
            </div>
          </div>
        )}

        {evaluation.phase === 'waiting' && (
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
              <h2 className="text-lg font-bold text-gray-900 mb-2">Acesse a Avaliação</h2>
              <p className="text-sm text-gray-500 mb-6">Escaneie o QR Code com o celular</p>
              <div className="p-6 bg-white rounded-xl border-2 border-teal-200">
                <QRCodeSVG value={quizUrl} size={220} level="H" includeMargin={false} />
              </div>
              <a href={quizUrl} target="_blank" rel="noreferrer" className="mt-4 text-sm font-medium text-teal-600 hover:underline">
                Abrir Link Teste
              </a>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-bold text-gray-900">Participantes</h2>
                <span className="ml-auto text-sm font-bold text-teal-600 bg-teal-50 px-3 py-1 rounded-full">
                  {participants?.length || 0}
                </span>
              </div>
              {(!participants || participants.length === 0) ? (
                <p className="text-gray-400 text-center py-8">Aguardando alunos entrarem...</p>
              ) : (
                <div className="space-y-2">
                  {participants.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="font-medium text-gray-800">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {evaluation.phase === 'question' && current_question && (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-full text-sm font-bold">
                <Clock className="w-4 h-4" />
                {timeLeft !== null ? `${timeLeft}s` : `${evaluation.question_time}s`}
              </div>
              <div className="mt-2 text-sm text-gray-500">
                {answeredCount} de {participants?.length || 0} responderam
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2 max-w-md mx-auto">
                <div
                  className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${participants?.length ? (answeredCount / participants.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-6">{current_question.text}</h2>
              <div className="space-y-3">
                {current_question.alternatives.map((alt: any, idx: number) => (
                  <div
                    key={alt.id}
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl text-left text-gray-800 font-medium"
                  >
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-bold text-sm mr-3">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    {alt.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {evaluation.phase === 'result' && result_data && current_question && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-2">{current_question.text}</h2>
              <p className="text-sm text-gray-500 mb-6">
                {result_data.total_answers} resposta(s) · {result_data.correct_count} acertaram
              </p>

              <div className="space-y-3">
                {result_data.alternatives_stats?.map((alt: any) => {
                  const isCorrect = result_data.correct_alternative?.id === alt.id;
                  const pct = result_data.total_answers > 0
                    ? Math.round((alt.count / result_data.total_answers) * 100) : 0;
                  return (
                    <div key={alt.id} className={clsx(
                      "relative overflow-hidden rounded-xl border-2 transition-colors",
                      isCorrect ? "border-green-500 bg-green-50" : "border-gray-200 bg-gray-50"
                    )}>
                      <div
                        className={clsx(
                          "absolute inset-y-0 left-0 transition-all duration-500",
                          isCorrect ? "bg-green-200/50" : "bg-gray-200/50"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative px-6 py-4 flex items-center justify-between">
                        <span className="font-medium text-gray-800 flex items-center gap-2">
                          {alt.text}
                          {isCorrect && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                        </span>
                        <span className="font-bold text-sm">
                          {alt.count} ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-gray-900">Quem Acertou</h3>
                <span className="ml-auto text-sm font-bold text-green-600">
                  {result_data.correct_count} acerto(s)
                </span>
              </div>
              {result_data.correct_participants?.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {result_data.correct_participants.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded-lg text-sm font-medium text-gray-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-4">Ninguém acertou esta questão</p>
              )}
            </div>
          </div>
        )}

        {evaluation.phase === 'completed' && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Avaliação Finalizada</h2>
              <p className="text-gray-500 mb-6">{totalQuestions} pergunta(s) · {participants?.length || 0} participante(s)</p>
              <button
                onClick={() => navigate(-1)}
                className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-colors"
              >
                Voltar para Aula
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
