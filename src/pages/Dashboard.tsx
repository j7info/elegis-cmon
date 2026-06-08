import React, { useEffect, useState } from 'react';
import { useAuth, AuthUser } from '../lib/AuthContext';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { Plus, BookOpen, GraduationCap, ChevronRight, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const canCreateCourse = (u: AuthUser | null) =>
  u?.system_role === 'ADMIN' || u?.system_role === 'COORDENADOR' || u?.system_role === 'PROFESSOR';

export function Dashboard() {
  const { user, loading } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<number[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadData = async () => {
    if (!user) return;
    try {
      const coursesEndpoint = user.system_role === 'ALUNO' ? '/courses/enrolled' : '/courses';
      const requests: Promise<any>[] = [api.get(coursesEndpoint)];
      if (canCreateCourse(user)) {
        requests.push(api.get('/users'));
      }
      const results = await Promise.all(requests);
      setCourses(results[0]);
      if (results[1] !== undefined) {
        setAllUsers(results[1]);
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const closeModal = () => {
    setIsModalOpen(false);
    setSubmitError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
    setSubmitError(null);
    try {
      setIsCreating(true);
      await api.post('/courses', {
        title: newTitle.trim(),
        description: newDescription.trim(),
        duration_hours: parseInt(durationHours) || 0,
        additional_teachers: selectedTeachers,
      });
      setNewTitle('');
      setNewDescription('');
      setDurationHours('');
      setSelectedTeachers([]);
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setSubmitError(err?.message || 'Erro ao criar curso');
    } finally {
      setIsCreating(false);
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

  const showCreateButton = canCreateCourse(user);
  const isAluno = user.system_role === 'ALUNO';

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Seus Cursos</h2>
          {showCreateButton && (
            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Curso
            </button>
          )}
        </div>

        {courses.length === 0 ? (
          <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
            {isAluno
              ? 'Você ainda não está matriculado em nenhum curso.'
              : 'Você ainda não tem cursos. Clique em "Novo Curso" para criar.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map(c => (
              <Link key={c.id} to={`/course/${c.id}`} className="block group">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-teal-300 hover:shadow-md transition-all h-full flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-1 truncate group-hover:text-teal-600 transition-colors">{c.title}</h3>
                  {c.description && <p className="text-sm text-gray-500 line-clamp-2 mb-4">{c.description}</p>}

                  <div className="mt-auto pt-4 flex items-center justify-between text-teal-600 text-sm font-medium border-t border-gray-50">
                    Acessar Curso
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Novo Curso</h2>
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

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Professores Adicionais (opcional)</label>
                <select
                  multiple
                  value={selectedTeachers.map(String)}
                  onChange={e => {
                    const values = Array.from(e.target.selectedOptions, option => parseInt(option.value));
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
                  disabled={isCreating || !newTitle.trim()}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Criar Curso
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
