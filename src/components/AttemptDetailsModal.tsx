import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Loader2, CheckCircle2, XCircle, X } from 'lucide-react';
import clsx from 'clsx';

interface AttemptDetailsModalProps {
  evaluationId: string | number;
  identifier: string;
  onClose: () => void;
}

export function AttemptDetailsModal({ evaluationId, identifier, onClose }: AttemptDetailsModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const result = await api.get(`/evaluations/${evaluationId}/online/attempts/${encodeURIComponent(identifier)}/best`);
        setData(result);
      } catch (err: any) {
        setError(err.message || 'Erro ao buscar detalhes da tentativa.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [evaluationId, identifier]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {data ? data.evaluation.title : 'Detalhes da Avaliação'}
            </h3>
            {data && (
              <p className="text-sm text-gray-500 mt-1">
                Tentativa #{data.attempt.attempt_number} • Concluída em {new Date(data.attempt.completed_at).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin mb-4" />
              <p className="text-gray-500">Carregando detalhes...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3">
              <XCircle className="w-5 h-5" />
              {error}
            </div>
          ) : (
            <div className="space-y-8">
              
              {/* Score Summary */}
              <div className="bg-gradient-to-br from-teal-50 to-indigo-50 rounded-2xl p-6 flex items-center justify-between border border-teal-100/50">
                <div>
                  <h4 className="text-sm font-semibold text-teal-800 uppercase tracking-wider mb-1">
                    Nota Final
                  </h4>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-gray-900">{data.attempt.percentage}%</span>
                    <span className="text-gray-500 font-medium">({data.attempt.total_score} de {data.attempt.total_possible} pts)</span>
                  </div>
                </div>
                <div className="w-16 h-16 rounded-full flex items-center justify-center bg-white shadow-sm">
                  {data.attempt.percentage >= 60 ? (
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  ) : (
                    <XCircle className="w-8 h-8 text-red-500" />
                  )}
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-6">
                {data.questions.map((q: any, qIdx: number) => {
                  const studentAltId = q.student_answer?.alternative_id;
                  const isCorrect = q.student_answer?.is_correct;

                  return (
                    <div key={q.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-start justify-between gap-4">
                        <h4 className="font-bold text-gray-800 leading-snug">
                          {qIdx + 1}. {q.text}
                        </h4>
                        <span className="shrink-0 text-sm font-medium px-2.5 py-1 rounded-md bg-gray-200 text-gray-600">
                          {q.points} pts
                        </span>
                      </div>
                      
                      <div className="p-5 space-y-2">
                        {q.alternatives.map((alt: any, aIdx: number) => {
                          const isMyAnswer = studentAltId === alt.id;
                          const isAltCorrect = q.correct_alternative_id === alt.id;
                          
                          let bg = 'bg-white border-gray-200';
                          let textColor = 'text-gray-600';
                          let icon = null;

                          if (isAltCorrect) {
                            bg = 'bg-green-50 border-green-300';
                            textColor = 'text-green-800 font-medium';
                            icon = <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />;
                          } else if (isMyAnswer && !isAltCorrect) {
                            bg = 'bg-red-50 border-red-300';
                            textColor = 'text-red-800 font-medium';
                            icon = <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
                          }

                          return (
                            <div key={alt.id} className={clsx("flex items-center gap-3 px-4 py-3 rounded-lg border", bg)}>
                              <span className={clsx(
                                "inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-sm",
                                isAltCorrect ? "bg-green-500 text-white" : isMyAnswer ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"
                              )}>
                                {String.fromCharCode(65 + aIdx)}
                              </span>
                              <span className={clsx("flex-1", textColor)}>{alt.text}</span>
                              {icon}
                            </div>
                          );
                        })}
                      </div>

                      <div className={clsx(
                        "px-5 py-3 text-sm font-medium flex items-center gap-2",
                        isCorrect ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      )}>
                        {isCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Você acertou (+{q.points} pts)
                          </>
                        ) : studentAltId ? (
                          <>
                            <XCircle className="w-4 h-4" />
                            Você errou (0 pts)
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4" />
                            Não respondida (0 pts)
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
