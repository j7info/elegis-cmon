import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, BookOpen, GraduationCap, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

export function Dashboard() {
  const { user, loading } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<number[]>([]);

  const loadData = async () => {
    try {
      const [coursesData, usersData] = await Promise.all([
        api.get('/courses'),
        api.get('/users')
      ]);
      setCourses(coursesData);
      setAllUsers(usersData);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim()) return;
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
      await loadData();
    } catch (error) {
      console.error('Create course error:', error);
    } finally {
      setIsCreating(false);
    }
  };

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

  return (
    <div className="space-y-8">
      {user?.system_role !== 'ALUNO' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Novo Curso</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <input 
                type="text" 
                placeholder="Nome do Curso..." 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                required
              />
              <input 
                type="number" 
                placeholder="Carga Horária (h)" 
                value={durationHours}
                onChange={e => setDurationHours(e.target.value)}
                className="w-full sm:w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              />
            </div>
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col sm:flex-row gap-4">
              <input 
                type="text" 
                placeholder="Descrição ou informações adicionais..." 
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              />
              <button 
                type="submit" 
                disabled={isCreating || !newTitle.trim()}
                className="w-full sm:w-auto px-6 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Criar Curso
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Seus Cursos</h2>
        {courses.length === 0 ? (
          <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
            Nenhum curso registrado. Crie o primeiro curso acima!
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
    </div>
  );
}
