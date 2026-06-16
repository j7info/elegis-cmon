import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle,
  BarChart, BookOpen, Award, Clock, GraduationCap, FileText,
  HelpCircle,
} from 'lucide-react';
import clsx from 'clsx';

interface Attendance {
  present: boolean;
  justification: number | null;
  source?: 'online' | 'presential';
  earned_points?: number;
  max_points?: number;
  percentage?: number;
  total_time_spent_seconds?: number | null;
  completed_at?: string | null;
}

interface Evaluation {
  evaluation_id: number;
  title: string;
  score: number;
  max_score: number;
  percentage: number;
  justification: number | null;
}

interface ClassPerf {
  id: number;
  title: string;
  date: string;
  order_index?: number;
  attendance: Attendance | null;
  evaluation_count: number;
  evaluations: Evaluation[];
}

interface Overall {
  total_classes: number;
  classes_attended: number;
  attendance_percentage: number;
  total_evaluations: number;
  average_evaluation_score: number | null;
  approved: boolean;
}

interface CoursePerf {
  id: number;
  title: string;
  total_hours: number;
  created_at: string;
  overall: Overall;
  classes: ClassPerf[];
}

function pctColor(pct: number): string {
  if (pct >= 75) return 'text-green-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function pctBgColor(pct: number): string {
  if (pct >= 75) return 'bg-green-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function PctBadge({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-xs text-gray-400">N/D</span>;
  const color = pctColor(value);
  return (
    <span className={clsx('font-bold', color)}>
      {value}%{label && <span className="font-normal text-gray-500 ml-1">{label}</span>}
    </span>
  );
}

function AttendanceIcon({ att }: { att: Attendance | null }) {
  if (!att) return <XCircle className="w-4 h-4 text-gray-300 flex-shrink-0" title="Sem registro" />;
  if (att.present) return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" title="Presente" />;
  if (att.justification != null) return <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" title={`Justificado (${att.justification}%)`} />;
  return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" title="Ausente" />;
}

function ClassRow({ cl, defaultOpen }: { cl: ClassPerf; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasEvals = cl.evaluations.length > 0;
  const attLabel = cl.attendance
    ? cl.attendance.source === 'online'
      ? cl.attendance.present
        ? `Slides concluídos (${cl.attendance.percentage ?? 100}%)`
        : 'Em leitura'
      : cl.attendance.present
        ? cl.attendance.percentage != null
          ? `Presente (${cl.attendance.percentage}%)`
          : 'Presente'
      : cl.attendance.justification != null
        ? `Justificado (${cl.attendance.justification}%)`
        : 'Ausente'
    : 'Sem registro';

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <AttendanceIcon att={cl.attendance} />
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate block">{cl.title}</span>
          <span className="text-xs text-gray-400">
            {cl.date ? format(new Date(cl.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : `Aula ${(cl.order_index ?? 0) + 1}`}
          </span>
        </span>
        <span className={clsx(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          cl.attendance?.present ? 'bg-green-50 text-green-700' :
          cl.attendance?.justification != null ? 'bg-amber-50 text-amber-700' :
          'bg-gray-50 text-gray-400'
        )}>
          {attLabel}
        </span>
        {hasEvals && (
          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
            {cl.evaluation_count} {cl.evaluation_count === 1 ? 'prova' : 'provas'}
          </span>
        )}
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>

      {open && hasEvals && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-50">
          <div className="space-y-1.5 mt-2">
            {cl.evaluations.map(ev => {
              const maxPts = ev.max_score || 1;
              const evPct = Math.round((ev.score / maxPts) * 100);
              return (
                <div key={ev.evaluation_id} className="flex items-center gap-2 text-sm pl-8">
                  {evPct >= 70 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  )}
                  <span className="text-gray-600 flex-1 truncate">{ev.title}</span>
                  <span className={clsx('font-bold text-xs', pctColor(evPct))}>
                    {ev.score}/{ev.max_score || 0}
                  </span>
                  <span className={clsx('text-xs font-medium', pctColor(evPct))}>
                    ({evPct}%)
                  </span>
                  {ev.justification != null && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                      Justif. {ev.justification}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && !hasEvals && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-50">
          <p className="text-xs text-gray-400 italic pl-8">Nenhuma avaliação nesta aula</p>
        </div>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: CoursePerf }) {
  const [expanded, setExpanded] = useState(false);
  const { overall } = course;
  const attPct = overall.attendance_percentage;
  const hasFailing = course.classes.some(
    c => c.attendance && !c.attendance.present && c.attendance.justification == null
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Cabeçalho do curso */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <h2 className="text-lg font-bold text-gray-900 truncate">{course.title}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {overall.total_classes} {overall.total_classes === 1 ? 'aula' : 'aulas'}
              </span>
              <span className="flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" />
                {course.total_hours || 0}h
              </span>
            </div>
          </div>

          {/* Status badge */}
          <div className={clsx(
            'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide border',
            overall.approved
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-50 text-gray-500 border-gray-200'
          )}>
            {overall.approved ? 'APROVADO' : 'EM ANDAMENTO'}
          </div>
        </div>

        {/* Indicadores principais */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {/* Presença */}
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
              <BarChart className="w-3.5 h-3.5" /> Presença
            </div>
            <div className="flex items-baseline justify-center gap-1">
              <span className={clsx('text-2xl font-black', pctColor(attPct))}>{attPct}%</span>
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {overall.classes_attended}/{overall.total_classes}
            </div>
          </div>

          {/* Avaliação */}
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
              <Award className="w-3.5 h-3.5" /> Avaliação
            </div>
            <div className="flex items-baseline justify-center gap-1">
              {overall.average_evaluation_score != null ? (
                <span className={clsx('text-2xl font-black', pctColor(overall.average_evaluation_score))}>
                  {overall.average_evaluation_score}%
                </span>
              ) : (
                <span className="text-lg font-bold text-gray-300">—</span>
              )}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {overall.total_evaluations} {overall.total_evaluations === 1 ? 'prova' : 'provas'}
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-gray-50 rounded-lg p-3 flex flex-col justify-center">
            <div className="text-[10px] text-gray-500 font-medium mb-1 text-center">
              {overall.approved ? 'Progresso' : 'Progresso'}
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all duration-500', pctBgColor(attPct))}
                style={{ width: `${Math.min(attPct, 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5 text-center">
              {overall.approved ? '✅ Meta atingida' : `${75 - attPct > 0 ? `Faltam ${75 - attPct}%` : 'Quase lá!'}`}
            </div>
          </div>
        </div>

        {/* Aulas com falta */}
        {hasFailing && (
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              Você possui faltas não justificadas. Consulte o professor para regularizar sua situação.
            </p>
          </div>
        )}
      </div>

      {/* Lista de aulas (expansível) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50/50 hover:bg-gray-100/50 border-t border-gray-100 transition-colors"
      >
        <span className="text-sm font-medium text-gray-600">
          {expanded ? 'Ocultar aulas' : `Ver ${course.classes.length} ${course.classes.length === 1 ? 'aula' : 'aulas'}`}
        </span>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-3 space-y-2">
          {course.classes.map((cl, idx) => (
            <ClassRow key={cl.id} cl={cl} defaultOpen={cl.evaluation_count > 0 && idx === course.classes.length - 1} />
          ))}
          {course.classes.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">Nenhuma aula cadastrada neste curso</p>
          )}
        </div>
      )}
    </div>
  );
}

export function MyPerformance() {
  const { user } = useAuth();
  const [data, setData] = useState<{ courses: CoursePerf[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/me/performance');
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao carregar desempenho');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Carregando desempenho...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <HelpCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <p className="text-gray-500 mb-4">{error}</p>
        <button onClick={loadData} className="text-sm text-teal-600 hover:underline font-medium">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data || data.courses.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <GraduationCap className="w-16 h-16 text-gray-200 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-400 mb-2">Nenhum curso encontrado</h2>
        <p className="text-sm text-gray-400">
          Você ainda não está matriculado em nenhum curso ou não há dados de desempenho disponíveis.
        </p>
      </div>
    );
  }

  // Totais globais
  const totalCourses = data.courses.length;
  const approvedCourses = data.courses.filter(c => c.overall.approved).length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <BarChart className="w-7 h-7 text-teal-600" />
          Meu Desempenho
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Acompanhe sua presença, notas e progresso em todos os cursos
        </p>
      </div>

      {/* Resumo rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <BookOpen className="w-5 h-5 text-teal-500 mx-auto mb-1" />
          <div className="text-2xl font-black text-gray-800">{totalCourses}</div>
          <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Cursos</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <BarChart className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <div className="text-2xl font-black text-gray-800">
            {data.courses.reduce((s, c) => s + c.overall.classes_attended, 0)}
          </div>
          <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Presenças</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
          <Award className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <div className="text-2xl font-black text-gray-800">
            {data.courses.reduce((s, c) => s + c.overall.total_evaluations, 0)}
          </div>
          <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Avaliações</div>
        </div>
        <div className={clsx(
          'bg-white rounded-xl shadow-sm border p-4 text-center',
          approvedCourses === totalCourses ? 'border-green-200' : 'border-gray-200'
        )}>
          <GraduationCap className={clsx('w-5 h-5 mx-auto mb-1', approvedCourses === totalCourses ? 'text-green-500' : 'text-gray-300')} />
          <div className={clsx('text-2xl font-black', approvedCourses === totalCourses ? 'text-green-600' : 'text-gray-800')}>
            {approvedCourses}/{totalCourses}
          </div>
          <div className={clsx(
            'text-[11px] font-medium uppercase tracking-wider',
            approvedCourses === totalCourses ? 'text-green-500' : 'text-gray-400'
          )}>
            Aprovados
          </div>
        </div>
      </div>

      {/* Cards de cursos */}
      <div className="space-y-4">
        {data.courses.map(course => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </div>
  );
}
