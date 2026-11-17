import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle,
  BookOpen, Award, Clock, GraduationCap,
  HelpCircle, Eye, Activity, ArrowRight
} from 'lucide-react';
import clsx from 'clsx';
import { AttemptDetailsModal } from '../components/AttemptDetailsModal';
import { summarizeStudentPerformance } from '../lib/studentPerformanceModel';

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
  type?: 'online' | 'presential' | 'practical';
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

function AttendanceIcon({ att }: { att: Attendance | null }) {
  if (!att) return <span className="inline-flex shrink-0" title="Sem registro" aria-label="Sem registro"><XCircle className="h-4 w-4 text-gray-300" aria-hidden="true" /></span>;
  if (att.present) return <span className="inline-flex shrink-0" title="Presente" aria-label="Presente"><CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" /></span>;
  if (att.justification != null) return <span className="inline-flex shrink-0" title={`Justificado (${att.justification}%)`} aria-label={`Justificado (${att.justification}%)`}><AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true" /></span>;
  return <span className="inline-flex shrink-0" title="Ausente" aria-label="Ausente"><XCircle className="h-4 w-4 text-red-400" aria-hidden="true" /></span>;
}

function ClassRow({ cl, defaultOpen, onOpenDetails }: { key?: number; cl: ClassPerf; defaultOpen: boolean; onOpenDetails: (evalId: number) => void }) {
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
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50 sm:px-4"
      >
        <AttendanceIcon att={cl.attendance} />
        <span className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate block">{cl.title}</span>
          <span className="text-xs text-gray-400">
            {cl.date ? format(new Date(cl.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : `Aula ${(cl.order_index ?? 0) + 1}`}
          </span>
        </span>
        <span className={clsx(
          'hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex',
          cl.attendance?.present ? 'bg-green-50 text-green-700' :
          cl.attendance?.justification != null ? 'bg-amber-50 text-amber-700' :
          'bg-gray-50 text-gray-400'
        )}>
          {attLabel}
        </span>
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
                  {cl.type === 'online' && (
                    <button
                      onClick={() => onOpenDetails(ev.evaluation_id)}
                      className="ml-2 text-teal-600 hover:text-teal-700 hover:bg-teal-50 p-1 rounded transition-colors"
                      title="Ver detalhes da tentativa"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
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

function PerformanceLine({ label, value, tone, emptyLabel }: { label: string; value: number | null; tone: 'teal' | 'amber'; emptyLabel?: string }) {
  const normalized = value == null ? 0 : Math.max(0, Math.min(value, 100));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-bold text-slate-950">{value == null ? (emptyLabel || 'Sem avaliação') : `${value}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={clsx('h-full rounded-full transition-all', tone === 'teal' ? 'bg-teal-600' : 'bg-amber-500')} style={{ width: `${normalized}%` }} />
      </div>
    </div>
  );
}

function CourseCard({ course, onOpenDetails }: { key?: number; course: CoursePerf; onOpenDetails: (evalId: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { overall } = course;
  const classes = course.classes || [];
  const attPct = overall.attendance_percentage;
  const hasFailing = classes.some(
    c => c.attendance && !c.attendance.present && c.attendance.justification == null
  );

  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-teal-700">Desempenho do curso</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950 sm:text-xl">{course.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {overall.total_classes} {overall.total_classes === 1 ? 'aula' : 'aulas'}</span>
              {Number(course.total_hours || 0) > 0 && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {course.total_hours}h</span>}
              <span>{overall.total_evaluations} {overall.total_evaluations === 1 ? 'avaliação' : 'avaliações'}</span>
            </div>
          </div>
          <span className={clsx(
            'flex-none rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase',
            overall.approved ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600',
          )}>
            {overall.approved ? 'Aprovado' : 'Em andamento'}
          </span>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <PerformanceLine label="Aproveitamento" value={attPct} tone="teal" />
          <PerformanceLine label="Desempenho" value={overall.average_evaluation_score} tone="amber" />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span><strong className="text-slate-800">{overall.classes_attended}</strong> de {overall.total_classes} aulas com presença</span>
          <span>{attPct >= 75 ? 'Meta de presença atingida' : `Faltam ${Math.max(0, 75 - attPct)}% para a meta de presença`}</span>
        </div>

        {hasFailing && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-red-100 bg-red-50 p-3">
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <p className="text-xs text-red-700">
              Você possui faltas não justificadas. Consulte o professor para regularizar sua situação.
            </p>
          </div>
        )}
      </div>

      <div className="grid border-t border-slate-100 sm:grid-cols-2">
        <Link to={`/course/${course.id}`} className="flex h-12 items-center justify-center gap-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">
          Abrir curso <ArrowRight className="h-4 w-4" />
        </Link>
        <button onClick={() => setExpanded(!expanded)} className="flex h-12 items-center justify-center gap-2 border-t border-slate-100 text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:border-l sm:border-t-0">
          {expanded ? 'Ocultar aulas' : `Ver ${classes.length} ${classes.length === 1 ? 'aula' : 'aulas'}`}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3 sm:p-5">
          {classes.map((cl, idx) => (
            <ClassRow key={cl.id} cl={cl} defaultOpen={cl.evaluation_count > 0 && idx === classes.length - 1} onOpenDetails={onOpenDetails} />
          ))}
          {classes.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">Nenhuma aula cadastrada neste curso</p>
          )}
        </div>
      )}
    </article>
  );
}

export function MyPerformance() {
  const { user } = useAuth();
  const [data, setData] = useState<{ courses: CoursePerf[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEval, setSelectedEval] = useState<number | null>(null);

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

  const summary = summarizeStudentPerformance(data.courses);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="text-sm font-medium text-teal-700">Sua evolução</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Meu desempenho</h1>
        <p className="mt-1 text-sm text-slate-500">Acompanhe presença, avaliações e a situação de cada curso.</p>
      </header>

      <section className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white xl:grid-cols-4" aria-label="Resumo de desempenho">
        {[
          { label: 'Cursos', value: summary.totalCourses, detail: `${summary.approvedCourses} aprovado(s)`, icon: BookOpen, tone: 'text-teal-700' },
          { label: 'Aproveitamento', value: `${summary.attendancePercentage}%`, detail: `${summary.attendedClasses}/${summary.totalClasses} aulas`, icon: Activity, tone: 'text-blue-700' },
          { label: 'Desempenho', value: summary.evaluationPercentage == null ? 'N/D' : `${summary.evaluationPercentage}%`, detail: `${summary.totalEvaluations} avaliação(ões)`, icon: Award, tone: 'text-amber-700' },
          { label: 'Aprovados', value: `${summary.approvedCourses}/${summary.totalCourses}`, detail: 'Cursos concluídos', icon: GraduationCap, tone: 'text-emerald-700' },
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="flex min-w-0 items-center gap-3 border-b border-slate-100 p-4 odd:border-r [&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:p-5 xl:last:border-r-0">
            <Icon className={clsx('h-5 w-5 flex-none', tone)} />
            <div className="min-w-0">
              <p className="text-xl font-bold text-slate-950 sm:text-2xl">{value}</p>
              <p className="text-xs font-semibold text-slate-600">{label}</p>
              <p className="truncate text-[11px] text-slate-400">{detail}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4" aria-labelledby="course-performance-title">
        <div>
          <p className="text-xs font-bold uppercase text-teal-700">Por curso</p>
          <h2 id="course-performance-title" className="mt-1 text-xl font-bold text-slate-950">Aproveitamento e avaliações</h2>
        </div>
        {data.courses.map(course => (
          <CourseCard key={course.id} course={course} onOpenDetails={setSelectedEval} />
        ))}
      </section>

      {selectedEval && user && (
        <AttemptDetailsModal
          evaluationId={selectedEval}
          identifier={user.cpf || user.email || user.matricula}
          onClose={() => setSelectedEval(null)}
        />
      )}
    </div>
  );
}
