import React, { useEffect, useState } from 'react';
import { useAuth, AuthUser } from '../lib/AuthContext';
import { api } from '../lib/api';
import { GraduationCap, X, Loader2, Copy } from 'lucide-react';
import clsx from 'clsx';
import {
  StaffDashboardView,
  StudentDashboardView,
  type CourseRecord,
} from '../components/dashboard/DashboardViews';
import type { CoursePerformanceSummary } from '../lib/dashboardModel';

const canCreateCourse = (u: AuthUser | null) =>
  u?.system_role === 'ADMIN' || u?.system_role === 'COORDENADOR' || u?.system_role === 'PROFESSOR';

export function Dashboard() {
  const { user, activeProfile, loading } = useAuth();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [performance, setPerformance] = useState<CoursePerformanceSummary[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<number[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reuseMode, setReuseMode] = useState<'new' | 'reuse'>('new');
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [newEnrollmentOpen, setNewEnrollmentOpen] = useState(true);
  const [enrollingCourseId, setEnrollingCourseId] = useState<number | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const loadData = async () => {
    if (!user) return;
    setDataLoading(true);
    setLoadError(null);
    setCourses([]);
    setPerformance([]);
    setAllUsers([]);
    try {
      if (activeProfile === 'ALUNO') {
        const [coursesResult, performanceResult] = await Promise.allSettled([
          api.get<CourseRecord[]>('/courses/enrolled'),
          api.get<{ courses: CoursePerformanceSummary[] }>('/me/performance'),
        ]);

        if (coursesResult.status === 'rejected') throw coursesResult.reason;
        setCourses(coursesResult.value);

        if (performanceResult.status === 'fulfilled') {
          setPerformance(performanceResult.value.courses || []);
        } else {
          console.error('Error loading performance summary:', performanceResult.reason);
          setPerformance([]);
        }
      } else {
        const [coursesResult, usersResult] = await Promise.allSettled([
          api.get<CourseRecord[]>('/courses'),
          canCreateCourse(user) ? api.get<any[]>('/users') : Promise.resolve([]),
        ]);

        if (coursesResult.status === 'rejected') throw coursesResult.reason;
        setCourses(coursesResult.value);
        if (usersResult.status === 'fulfilled') setAllUsers(usersResult.value);
      }
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
      setLoadError(err?.message || 'Não foi possível carregar o painel.');
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, activeProfile]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSubmitError(null);
    setReuseMode('new');
    setSelectedCourseId(null);
    setStartDate('');
    setEndDate('');
    setNewEnrollmentOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    setSubmitError(null);
    try {
      setIsCreating(true);

      if (reuseMode === 'reuse' && selectedCourseId) {
        await api.post(`/courses/${selectedCourseId}/reuse`, {
          title: newTitle.trim(),
          description: newDescription.trim(),
          duration_hours: parseInt(durationHours) || 0,
          start_date: startDate || null,
          end_date: endDate || null,
          enrollment_open: newEnrollmentOpen,
        });
      } else {
        await api.post('/courses', {
          title: newTitle.trim(),
          description: newDescription.trim(),
          duration_hours: parseInt(durationHours) || 0,
          additional_teachers: selectedTeachers,
          start_date: startDate || null,
          end_date: endDate || null,
          enrollment_open: newEnrollmentOpen,
        });
      }

      setNewTitle('');
      setNewDescription('');
      setDurationHours('');
      setSelectedTeachers([]);
      setStartDate('');
      setEndDate('');
      setNewEnrollmentOpen(true);
      setReuseMode('new');
      setSelectedCourseId(null);
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setSubmitError(err?.message || 'Erro ao criar curso');
    } finally {
      setIsCreating(false);
    }
  };

  const selectReuseCourse = (c: any) => {
    setSelectedCourseId(c.id);
    setNewTitle(`${c.title} (nova turma)`);
    setNewDescription(c.description || '');
    setDurationHours(String(c.duration_hours || 0));
    setNewEnrollmentOpen(c.enrollment_open !== false);
  };

  const handleEnroll = async (courseId: number) => {
    if (!user) return;
    setEnrollError(null);
    setEnrollingCourseId(courseId);
    try {
      const identifier = user.cpf || user.email || user.matricula;
      await api.post(`/courses/${courseId}/enroll`, { identifier });
      await loadData();
    } catch (err: any) {
      setEnrollError(err?.message || 'Erro ao realizar inscrição');
    } finally {
      setEnrollingCourseId(null);
    }
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isModalOpen]);

  if (loading) return <div className="text-center p-8 text-gray-500">Aguardando...</div>;
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100 text-center">
        <GraduationCap className="w-12 h-12 text-teal-200 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Plataforma de Presença</h2>
        <p className="text-gray-500 max-w-md">Gerencie cursos, aulas, cadastros prévios e presenças com QR Code.</p>
        <p className="text-gray-500 max-w-md mt-2">Faça login para começar.</p>
      </div>
    );
  }

  const isAluno = activeProfile === 'ALUNO';

  return (
    <div className="space-y-8">
      {dataLoading ? (
        <div className="flex min-h-64 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-teal-700" /> Carregando painel...
        </div>
      ) : isAluno ? (
        <StudentDashboardView
          userName={user.name}
          courses={courses}
          performance={performance}
          enrollingCourseId={enrollingCourseId}
          enrollError={enrollError}
          loadError={loadError}
          onEnroll={handleEnroll}
        />
      ) : (
        <StaffDashboardView
          userName={user.name}
          courses={courses}
          userCount={allUsers.length}
          loadError={loadError}
          onCreate={() => {
            setSubmitError(null);
            setIsModalOpen(true);
          }}
        />
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {reuseMode === 'reuse' ? 'Reaproveitar Curso' : 'Novo Curso'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 px-6 py-5">
              {submitError && (
                <div className="px-4 py-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setReuseMode('new'); setSelectedCourseId(null); }}
                  className={clsx(
                    'flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all',
                    reuseMode === 'new'
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  )}
                >
                  Criar do zero
                </button>
                <button
                  type="button"
                  onClick={() => setReuseMode('reuse')}
                  className={clsx(
                    'flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all',
                    reuseMode === 'reuse'
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  )}
                >
                  Reaproveitar existente
                </button>
              </div>

              {reuseMode === 'reuse' && !selectedCourseId && (
                <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-2">
                  <p className="text-xs text-gray-500 px-2 pt-1">Selecione um curso para reaproveitar:</p>
                  {courses.length > 0 ? (
                    courses.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectReuseCourse(c)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-teal-50 hover:text-teal-700 transition-colors text-sm border border-gray-100"
                      >
                        <span className="font-medium">{c.title}</span>
                        {c.description && <span className="text-gray-500 ml-2 truncate">{c.description}</span>}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 px-2 py-3 text-center">Nenhum curso disponível para reaproveitar.</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Título</label>
                <input
                  type="text"
                  placeholder="Nome do Curso..."
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Data de Início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Data de Término</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Carga Horária (h)</label>
                <input
                  type="number"
                  placeholder="Ex: 40"
                  value={durationHours}
                  onChange={e => setDurationHours(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                />
              </div>

              {reuseMode === 'new' && (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Professores Adicionais (opcional)</label>
                  <select
                    multiple
                    value={selectedTeachers.map(String)}
                    onChange={e => {
                      const options = e.currentTarget.selectedOptions as HTMLCollectionOf<HTMLOptionElement>;
                      const values = Array.from(options, option => parseInt(option.value));
                      setSelectedTeachers(values);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none h-24"
                  >
                    {allUsers.filter(u => u.id !== user.id).map(u => (
                      <option key={u.id} value={u.id}>{u.name} {u.cargo ? `(${u.cargo})` : ''}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">Pressione Ctrl (ou Cmd no Mac) para selecionar mais de um.</p>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Descrição</label>
                <textarea
                  placeholder="Descrição ou informações adicionais..."
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all resize-none"
                />
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newEnrollmentOpen}
                  onChange={e => setNewEnrollmentOpen(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span>
                  <span className="font-medium text-gray-900">Disponível para inscrição</span>
                  <span className="block text-xs text-gray-500">Alunos verão este curso na dashboard quando ainda não estiverem matriculados.</span>
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newTitle.trim() || (reuseMode === 'reuse' && !selectedCourseId)}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      {reuseMode === 'reuse' ? 'Reaproveitar Curso' : 'Criar Curso'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
