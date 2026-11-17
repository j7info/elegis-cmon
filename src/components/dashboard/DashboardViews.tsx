import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Layers3,
  Loader2,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import {
  mapPerformanceByCourse,
  selectNextCourse,
  splitStudentCourses,
  summarizeStudentDashboard,
  type CoursePerformanceSummary,
  type DashboardCourse,
} from '../../lib/dashboardModel';

export interface CourseRecord extends DashboardCourse {
  title: string;
  description?: string | null;
  duration_hours?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  enrollment_open?: boolean;
  subcourse_count?: number | null;
}

interface PerformanceRecord extends CoursePerformanceSummary {
  title?: string;
}

function courseStatus(course: CourseRecord) {
  if (!course.start_date) return null;
  const now = Date.now();
  if (course.end_date && new Date(course.end_date).getTime() < now) return 'completed';
  if (new Date(course.start_date).getTime() > now) return 'upcoming';
  return 'active';
}

function ProgressLine({ label, value, tone, emptyLabel = 'Sem avaliação' }: { label: string; value: number | null; tone: 'teal' | 'gold'; emptyLabel?: string }) {
  const normalized = value == null ? 0 : Math.max(0, Math.min(value, 100));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">{value == null ? emptyLabel : `${value}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${label}: ${value ?? 0}%`}>
        <div
          className={clsx('h-full rounded-full transition-all', tone === 'teal' ? 'bg-teal-600' : 'bg-amber-500')}
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

function StudentCourseCard({ course, performance }: { key?: number; course: CourseRecord; performance?: PerformanceRecord }) {
  const pending = Number(course.pending_class_count || 0);
  const status = courseStatus(course);
  return (
    <Link
      to={`/course/${course.id}`}
      className="group flex h-full flex-col rounded-md border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
          pending > 0 ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700',
        )}>
          {pending > 0 ? <Bell className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          {pending > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800">{pending} pendente{pending > 1 ? 's' : ''}</span>}
          {status && (
            <span className={clsx(
              'rounded-full px-2 py-1 text-[10px] font-bold uppercase',
              status === 'active' && 'bg-emerald-100 text-emerald-800',
              status === 'upcoming' && 'bg-blue-100 text-blue-800',
              status === 'completed' && 'bg-slate-100 text-slate-600',
            )}>
              {status === 'active' ? 'Em andamento' : status === 'upcoming' ? 'Previsto' : 'Concluído'}
            </span>
          )}
        </div>
      </div>

      <h3 className="text-lg font-bold text-slate-950 group-hover:text-teal-800">{course.title}</h3>
      {course.description && <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{course.description}</p>}

      {course.latest_pending_class && pending > 0 && (
        <div className="mt-4 border-l-2 border-amber-400 pl-3">
          <p className="text-xs font-semibold text-amber-800">Próxima aula</p>
          <p className="mt-0.5 line-clamp-1 text-sm text-slate-700">{course.latest_pending_class.title}</p>
        </div>
      )}

      <div className="mt-auto space-y-3 pt-5">
        <ProgressLine label="Aproveitamento" value={performance ? performance.overall.attendance_percentage : null} tone="teal" emptyLabel="Sem dados" />
        <ProgressLine label="Desempenho" value={performance?.overall.average_evaluation_score ?? null} tone="gold" />
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
          <span className="text-slate-500">
            {performance ? `${performance.overall.classes_attended}/${performance.overall.total_classes} aulas` : 'Sem atividade registrada'}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-teal-700">
            Acessar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function AvailableCourseCard({ course, enrolling, onEnroll }: { key?: number; course: CourseRecord; enrolling: boolean; onEnroll: (id: number) => void }) {
  return (
    <article className="flex h-full flex-col rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-700"><BookOpen className="h-5 w-5" /></span>
        <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold uppercase text-blue-800">Inscrições abertas</span>
      </div>
      <h3 className="text-lg font-bold text-slate-950">{course.title}</h3>
      {course.description && <p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-500">{course.description}</p>}
      <div className="mt-auto pt-5">
        {Number(course.duration_hours || 0) > 0 && (
          <p className="mb-3 flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-4 w-4" /> {course.duration_hours} horas</p>
        )}
        <button
          type="button"
          onClick={() => onEnroll(course.id)}
          disabled={enrolling}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Inscrever-se
        </button>
      </div>
    </article>
  );
}

export function StudentDashboardView({
  userName,
  courses,
  performance,
  enrollingCourseId,
  enrollError,
  loadError,
  onEnroll,
}: {
  userName: string;
  courses: CourseRecord[];
  performance: PerformanceRecord[];
  enrollingCourseId: number | null;
  enrollError: string | null;
  loadError: string | null;
  onEnroll: (courseId: number) => void;
}) {
  const { enrolled, available } = splitStudentCourses(courses);
  const summary = summarizeStudentDashboard(courses, performance);
  const performanceByCourse = mapPerformanceByCourse(performance);
  const nextCourse = selectNextCourse(courses) as CourseRecord | null;
  const firstName = userName.trim().split(/\s+/)[0] || 'aluno';
  const nextPending = nextCourse?.latest_pending_class;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium text-teal-700">Seu espaço de aprendizagem</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Olá, {firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">Continue seus cursos e acompanhe o que precisa da sua atenção.</p>
      </header>

      {(loadError || enrollError) && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{enrollError || loadError}</div>
      )}

      {nextCourse && (
        <section className="grid overflow-hidden rounded-md bg-slate-900 text-white md:grid-cols-[1fr_auto]" aria-labelledby="next-action-title">
          <div className="p-6 sm:p-7">
            <p className="text-xs font-bold uppercase text-teal-300">Próxima ação</p>
            <h2 id="next-action-title" className="mt-2 text-xl font-bold sm:text-2xl">{nextPending?.title || nextCourse.title}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              {nextPending
                ? `${nextCourse.title} tem ${Number(nextCourse.pending_class_count || 0)} aula${Number(nextCourse.pending_class_count || 0) === 1 ? '' : 's'} aguardando você.`
                : 'Você está em dia. Acesse o curso para rever conteúdos e acompanhar as próximas atividades.'}
            </p>
          </div>
          <div className="flex items-end p-6 pt-0 md:items-center md:pt-6">
            <Link to={`/course/${nextCourse.id}`} className="inline-flex h-11 items-center gap-2 rounded-md bg-teal-500 px-5 text-sm font-bold text-slate-950 hover:bg-teal-400">
              Continuar <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white xl:grid-cols-4" aria-label="Resumo do aluno">
        {[
          { label: 'Cursos ativos', value: summary.enrolledCourses, icon: BookOpen, color: 'text-teal-700' },
          { label: 'Aulas pendentes', value: summary.pendingClasses, icon: Bell, color: 'text-amber-700' },
          { label: 'Aproveitamento', value: `${summary.attendancePercentage}%`, icon: Activity, color: 'text-blue-700' },
          { label: 'Desempenho', value: summary.performancePercentage == null ? 'N/D' : `${summary.performancePercentage}%`, icon: BarChart3, color: 'text-emerald-700' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex min-w-0 items-center gap-3 border-b border-slate-100 p-4 odd:border-r [&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:p-5 xl:last:border-r-0">
            <Icon className={clsx('h-5 w-5', color)} />
            <div><p className="text-2xl font-bold text-slate-950">{value}</p><p className="text-xs font-medium text-slate-500">{label}</p></div>
          </div>
        ))}
      </section>

      <section className="space-y-4" aria-labelledby="enrolled-courses-title">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase text-teal-700">Em andamento</p><h2 id="enrolled-courses-title" className="mt-1 text-xl font-bold text-slate-950">Meus cursos</h2></div>
          <Link to="/me" className="hidden items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900 sm:flex">Ver desempenho <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {enrolled.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {enrolled.map(course => <StudentCourseCard key={course.id} course={course} performance={performanceByCourse.get(course.id)} />)}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Você ainda não está matriculado em nenhum curso.</div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="available-courses-title">
        <div><p className="text-xs font-bold uppercase text-blue-700">Catálogo</p><h2 id="available-courses-title" className="mt-1 text-xl font-bold text-slate-950">Disponíveis para inscrição</h2></div>
        {available.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {available.map(course => <AvailableCourseCard key={course.id} course={course} enrolling={enrollingCourseId === course.id} onEnroll={onEnroll} />)}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Nenhum curso disponível para inscrição agora.</div>
        )}
      </section>
    </div>
  );
}

function StaffCourseCard({ course }: { key?: number; course: CourseRecord }) {
  const status = courseStatus(course);
  return (
    <Link to={`/course/${course.id}`} className="group flex h-full flex-col rounded-md border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700"><GraduationCap className="h-5 w-5" /></span>
        {status && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{status === 'active' ? 'Em andamento' : status === 'upcoming' ? 'Previsto' : 'Concluído'}</span>}
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950 group-hover:text-teal-800">{course.title}</h3>
      {course.description && <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{course.description}</p>}
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 pt-5 text-xs text-slate-500">
        {Number(course.duration_hours || 0) > 0 && <span className="flex items-center gap-1"><Clock3 className="h-4 w-4" /> {course.duration_hours}h</span>}
        {Number(course.subcourse_count || 0) > 0 && <span className="flex items-center gap-1"><Layers3 className="h-4 w-4" /> {course.subcourse_count} subcursos</span>}
        {course.start_date && <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" /> {new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(course.start_date))}</span>}
      </div>
      <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-4 text-sm font-semibold text-teal-700">Gerenciar <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
    </Link>
  );
}

export function StaffDashboardView({ userName, courses, userCount, loadError, onCreate }: { userName: string; courses: CourseRecord[]; userCount: number; loadError: string | null; onCreate: () => void }) {
  const firstName = userName.trim().split(/\s+/)[0] || 'professor';
  const activeCourses = courses.filter(course => courseStatus(course) === 'active').length;
  const openCourses = courses.filter(course => course.enrollment_open !== false).length;
  const subcourses = courses.reduce((sum, course) => sum + Number(course.subcourse_count || 0), 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-teal-700">Painel de operação</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Olá, {firstName}</h1><p className="mt-1 text-sm text-slate-500">Acompanhe seus cursos e entre rapidamente no que precisa gerenciar.</p></div>
        <button type="button" onClick={onCreate} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"><Plus className="h-4 w-4" /> Novo curso</button>
      </header>

      {loadError && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}

      <section className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white xl:grid-cols-4" aria-label="Resumo operacional">
        {[
          { label: 'Cursos', value: courses.length, icon: BookOpen, color: 'text-teal-700' },
          { label: 'Em andamento', value: activeCourses, icon: Activity, color: 'text-emerald-700' },
          { label: 'Inscrições abertas', value: openCourses, icon: UserPlus, color: 'text-blue-700' },
          { label: subcourses > 0 ? 'Subcursos' : 'Usuários', value: subcourses > 0 ? subcourses : userCount, icon: subcourses > 0 ? Layers3 : Users, color: 'text-amber-700' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex min-w-0 items-center gap-3 border-b border-slate-100 p-4 odd:border-r [&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:p-5 xl:last:border-r-0">
            <Icon className={clsx('h-5 w-5', color)} /><div><p className="text-2xl font-bold text-slate-950">{value}</p><p className="text-xs font-medium text-slate-500">{label}</p></div>
          </div>
        ))}
      </section>

      <section className="space-y-4" aria-labelledby="staff-courses-title">
        <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-teal-700" /><h2 id="staff-courses-title" className="text-xl font-bold text-slate-950">Cursos sob sua gestão</h2></div>
        {courses.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{courses.map(course => <StaffCourseCard key={course.id} course={course} />)}</div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center"><GraduationCap className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm text-slate-500">Você ainda não tem cursos. Crie o primeiro para começar.</p></div>
        )}
      </section>
    </div>
  );
}
