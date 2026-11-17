import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Layers3,
  Loader2,
  MapPin,
  PlayCircle,
  RotateCcw,
  Video,
} from 'lucide-react';
import clsx from 'clsx';
import {
  deriveStudentClassState,
  selectNextStudentClass,
  summarizeClassProgress,
  type AttendanceStep,
  type LearningClassPerformance,
  type StudentClassState,
} from '../../lib/courseLearningModel';

interface StudentClassRecord {
  id: number;
  title: string;
  description?: string | null;
  date?: string | null;
  status: string;
  type: string;
  is_interactive?: boolean;
  online_content_type?: string | null;
  expected_duration_minutes?: number | null;
  course_title?: string | null;
  course_id?: number;
}

interface PerformanceCourse {
  id: number;
  classes: LearningClassPerformance[];
}

interface StudentCourseViewProps {
  course: any;
  classes: StudentClassRecord[];
  subcourses: any[];
  performanceCourses: PerformanceCourse[];
  getActiveAttendanceStep: (classItem: any) => AttendanceStep | null;
  selfScanLoading: string | null;
  feedback: Record<number, { type: 'success' | 'error'; message: string }>;
  onRegisterAttendance: (classItem: any, step: AttendanceStep) => void;
}

const statePresentation: Record<StudentClassState, { label: string; tone: string; dot: string }> = {
  'attendance-open': { label: 'Presença aberta', tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  completed: { label: 'Concluída', tone: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  recorded: { label: 'Presença registrada', tone: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  'in-progress': { label: 'Em andamento', tone: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  available: { label: 'Disponível', tone: 'bg-teal-100 text-teal-800', dot: 'bg-teal-500' },
  upcoming: { label: 'A iniciar', tone: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  missed: { label: 'Sem registro', tone: 'bg-red-50 text-red-700', dot: 'bg-red-400' },
};

function classRoute(classItem: StudentClassRecord) {
  if (classItem.is_interactive) return `/interactive-lesson/${classItem.id}`;
  if (classItem.type === 'online') return `/online-class/${classItem.id}`;
  return null;
}

function formatCourseDate(value?: string | null) {
  if (!value) return null;
  const dateOnly = value.slice(0, 10).split('-');
  if (dateOnly.length === 3) return `${dateOnly[2]}/${dateOnly[1]}/${dateOnly[0]}`;
  return value;
}

function formatClassDate(value?: string | null) {
  if (!value) return 'Data a definir';
  return format(new Date(value), "dd 'de' MMM 'às' HH:mm", { locale: ptBR });
}

function classTypeLabel(classItem: StudentClassRecord) {
  if (classItem.is_interactive) return 'Interativa';
  if (classItem.type === 'online') return classItem.online_content_type === 'video' ? 'Vídeo' : 'Online';
  if (classItem.type === 'practical') return 'Prática presencial';
  return 'Presencial';
}

function actionLabel(state: StudentClassState) {
  if (state === 'completed') return 'Revisar aula';
  if (state === 'in-progress') return 'Continuar aula';
  if (state === 'available') return 'Iniciar aula';
  return 'Ver conteúdo';
}

function ProgressLine({ label, value, tone }: { label: string; value: number | null; tone: 'teal' | 'gold' }) {
  const width = value == null ? 0 : Math.max(0, Math.min(value, 100));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-bold text-slate-950">{value == null ? 'Sem avaliação' : `${value}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={clsx('h-full rounded-full', tone === 'teal' ? 'bg-teal-600' : 'bg-amber-500')} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function LessonCard({
  classItem,
  performance,
  attendanceStep,
  loading,
  feedback,
  onRegisterAttendance,
}: {
  key?: number;
  classItem: StudentClassRecord;
  performance?: LearningClassPerformance;
  attendanceStep: AttendanceStep | null;
  loading: boolean;
  feedback?: { type: 'success' | 'error'; message: string };
  onRegisterAttendance: (classItem: StudentClassRecord, step: AttendanceStep) => void;
}) {
  const state = deriveStudentClassState(classItem, performance, attendanceStep);
  const presentation = statePresentation[state];
  const route = classRoute(classItem);
  const progress = Number(performance?.attendance?.percentage || 0);

  return (
    <article className={clsx(
      'relative grid gap-4 rounded-md border bg-white p-5 shadow-sm sm:grid-cols-[auto_1fr_auto] sm:items-center',
      state === 'attendance-open' ? 'border-amber-300' : state === 'in-progress' ? 'border-blue-200' : 'border-slate-200',
    )}>
      <span className={clsx('absolute -left-[1.92rem] top-7 h-3 w-3 rounded-full ring-4 ring-slate-50', presentation.dot)} />
      <div className={clsx(
        'flex h-11 w-11 items-center justify-center rounded-md',
        classItem.type === 'online' || classItem.is_interactive ? 'bg-blue-50 text-blue-700' : 'bg-teal-50 text-teal-700',
      )}>
        {classItem.online_content_type === 'video' ? <Video className="h-5 w-5" /> : classItem.type === 'online' || classItem.is_interactive ? <PlayCircle className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('rounded-full px-2 py-1 text-[10px] font-bold uppercase', presentation.tone)}>{presentation.label}</span>
          <span className="text-xs font-medium text-slate-500">{classTypeLabel(classItem)}</span>
          {classItem.course_title && <span className="text-xs text-slate-400">{classItem.course_title}</span>}
        </div>
        <h3 className="mt-2 text-base font-bold text-slate-950 sm:text-lg">{classItem.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatClassDate(classItem.date)}</span>
          {Number(classItem.expected_duration_minutes || 0) > 0 && <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {classItem.expected_duration_minutes} min</span>}
          {progress > 0 && progress < 100 && <span className="font-semibold text-blue-700">{progress}% visto</span>}
        </div>
        {classItem.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{classItem.description}</p>}
        {feedback && <p className={clsx('mt-2 text-xs font-semibold', feedback.type === 'success' ? 'text-emerald-700' : 'text-red-700')}>{feedback.message}</p>}
      </div>

      <div className="flex items-center sm:justify-end">
        {attendanceStep && feedback?.type === 'success' ? (
          <span className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-50 px-4 text-sm font-bold text-emerald-700 sm:w-auto">
            <CheckCircle2 className="h-4 w-4" /> Presença registrada
          </span>
        ) : attendanceStep ? (
          <button
            type="button"
            onClick={() => onRegisterAttendance(classItem, attendanceStep)}
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-4 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60 sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            Registrar presença
          </button>
        ) : route ? (
          <Link to={route} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 sm:w-auto">
            {state === 'completed' ? <RotateCcw className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {actionLabel(state)}
          </Link>
        ) : state === 'recorded' ? (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" /> Registrada</span>
        ) : (
          <span className="text-sm text-slate-400">Acompanhe em sala</span>
        )}
      </div>
    </article>
  );
}

export function StudentCourseView({
  course,
  classes,
  subcourses,
  performanceCourses,
  getActiveAttendanceStep,
  selfScanLoading,
  feedback,
  onRegisterAttendance,
}: StudentCourseViewProps) {
  const performanceByClass = new Map<number, LearningClassPerformance>();
  for (const performanceCourse of performanceCourses) {
    for (const classPerformance of performanceCourse.classes || []) performanceByClass.set(classPerformance.id, classPerformance);
  }

  const attendanceStepByClass = new Map<number, AttendanceStep | null>(
    classes.map(classItem => [classItem.id, getActiveAttendanceStep(classItem)]),
  );
  const nextClass = selectNextStudentClass(classes, performanceByClass, attendanceStepByClass);
  const summary = summarizeClassProgress(classes, performanceByClass);
  const sortedClasses = [...classes].sort((a, b) => {
    const aDate = a.date ? new Date(a.date).getTime() : Number.MAX_SAFE_INTEGER;
    const bDate = b.date ? new Date(b.date).getTime() : Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  });
  const nextPerformance = nextClass ? performanceByClass.get(nextClass.id) : undefined;
  const nextStep = nextClass ? attendanceStepByClass.get(nextClass.id) || null : null;
  const nextState = nextClass ? deriveStudentClassState(nextClass, nextPerformance, nextStep) : null;
  const nextRoute = nextClass ? classRoute(nextClass) : null;
  const nextFeedback = nextClass ? feedback[nextClass.id] : undefined;

  return (
    <div className="space-y-8">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-teal-800">
        <ArrowLeft className="h-4 w-4" /> Voltar aos cursos
      </Link>

      <header className="overflow-hidden rounded-md bg-slate-900 text-white">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-teal-300">
            <GraduationCap className="h-4 w-4" /> {course.is_subcourse ? 'Subcurso' : 'Curso'}
          </div>
          <h1 className="mt-3 max-w-4xl text-2xl font-bold sm:text-3xl">{course.title}</h1>
          {course.description && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{course.description}</p>}
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
            <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-teal-300" /> {course.duration_hours || 0} horas</span>
            {course.start_date && <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-teal-300" /> {formatCourseDate(course.start_date)} a {formatCourseDate(course.end_date) || 'data a definir'}</span>}
            {subcourses.length > 0 && <span className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-teal-300" /> {subcourses.length} subcurso{subcourses.length === 1 ? '' : 's'}</span>}
          </div>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-md border border-slate-200 bg-white md:grid-cols-3" aria-label="Progresso do curso">
        <div className="border-b border-slate-100 p-5 md:border-b-0 md:border-r">
          <p className="text-xs font-semibold text-slate-500">Aulas registradas</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{summary.completed}/{summary.total}</p>
        </div>
        <div className="border-b border-slate-100 p-5 md:border-b-0 md:border-r"><ProgressLine label="Aproveitamento" value={summary.progressPercentage} tone="teal" /></div>
        <div className="p-5"><ProgressLine label="Desempenho" value={summary.evaluationPercentage} tone="gold" /></div>
      </section>

      {nextClass && nextState && (
        <section className="grid gap-5 rounded-md border border-teal-200 bg-teal-50 p-5 sm:grid-cols-[1fr_auto] sm:items-center" aria-labelledby="next-class-title">
          <div>
            <p className="text-xs font-bold uppercase text-teal-800">Próxima ação</p>
            <h2 id="next-class-title" className="mt-1 text-xl font-bold text-slate-950">{nextClass.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{formatClassDate(nextClass.date)} · {statePresentation[nextState].label}</p>
          </div>
          {nextStep && nextFeedback?.type === 'success' ? (
            <span className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-emerald-100 px-5 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Presença registrada</span>
          ) : nextStep ? (
            <button type="button" onClick={() => onRegisterAttendance(nextClass, nextStep)} disabled={selfScanLoading === `${nextClass.id}:${nextStep}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-amber-500 px-5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60">
              {selfScanLoading === `${nextClass.id}:${nextStep}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Registrar presença
            </button>
          ) : nextRoute ? (
            <Link to={nextRoute} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800">{actionLabel(nextState)} <ArrowRight className="h-4 w-4" /></Link>
          ) : null}
        </section>
      )}

      {subcourses.length > 0 && (
        <section className="space-y-3" aria-labelledby="subcourses-title">
          <div><p className="text-xs font-bold uppercase text-indigo-700">Trilhas</p><h2 id="subcourses-title" className="mt-1 text-xl font-bold text-slate-950">Subcursos</h2></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subcourses.map(subcourse => (
              <Link key={subcourse.id} to={`/course/${subcourse.id}`} className="group flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300">
                <div className="min-w-0"><p className="truncate font-bold text-slate-950 group-hover:text-indigo-800">{subcourse.title}</p><p className="mt-1 text-xs text-slate-500">{subcourse.class_count || 0} aula{Number(subcourse.class_count || 0) === 1 ? '' : 's'}{subcourse.duration_hours ? ` · ${subcourse.duration_hours}h` : ''}</p></div>
                <ArrowRight className="h-4 w-4 shrink-0 text-indigo-600" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="course-path-title">
        <div className="flex items-center gap-3"><BookOpen className="h-5 w-5 text-teal-700" /><div><p className="text-xs font-bold uppercase text-teal-700">Sequência de aprendizagem</p><h2 id="course-path-title" className="mt-0.5 text-xl font-bold text-slate-950">Trilha do curso</h2></div></div>
        {sortedClasses.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center"><BookOpen className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm text-slate-500">Ainda não há aulas cadastradas neste curso.</p></div>
        ) : (
          <div className="relative ml-6 space-y-3 border-l-2 border-slate-200 pl-6">
            {sortedClasses.map(classItem => {
              const step = attendanceStepByClass.get(classItem.id) || null;
              return (
                <LessonCard
                  key={classItem.id}
                  classItem={classItem}
                  performance={performanceByClass.get(classItem.id)}
                  attendanceStep={step}
                  loading={selfScanLoading === `${classItem.id}:${step}`}
                  feedback={feedback[classItem.id]}
                  onRegisterAttendance={onRegisterAttendance}
                />
              );
            })}
          </div>
        )}
      </section>

      {summary.total > 0 && summary.progressPercentage >= 75 && (
        <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Meta de presença alcançada</p><p className="mt-1">Continue acompanhando as aulas e avaliações até a conclusão do curso.</p></div></div>
      )}
    </div>
  );
}
