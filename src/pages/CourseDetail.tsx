import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Calendar, ChevronRight, BarChart, Award } from 'lucide-react';
import clsx from 'clsx';

export function CourseDetail() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const [courseData, setCourseData] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [auxiliaryTeacherId, setAuxiliaryTeacherId] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [studentsReport, setStudentsReport] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const loadData = async () => {
    if (!courseId) return;
    try {
      const [course, classList, report, usersData] = await Promise.all([
        api.get(`/courses/${courseId}`),
        api.get(`/classes/course/${courseId}`),
        api.get(`/certificates/report/${courseId}`),
        api.get('/users')
      ]);
      setCourseData(course);
      setClasses(classList);
      setStudentsReport(report.students || []);
      setAllUsers(usersData);
    } catch (err) {
      console.error('Error loading course:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [courseId]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim() || !courseId) return;
    try {
      setIsCreating(true);
      const combinedDate = newDate && newTime ? new Date(`${newDate}T${newTime}`).toISOString() : undefined;
      await api.post('/classes', {
        course_id: parseInt(courseId),
        title: newTitle.trim(),
        description: newDescription.trim(),
        date: combinedDate,
        qr_duration_minutes: 10,
        auxiliary_teacher_id: auxiliaryTeacherId ? parseInt(auxiliaryTeacherId) : undefined,
      });
      setNewTitle('');
      setNewDescription('');
      setAuxiliaryTeacherId('');
      setNewDate('');
      setNewTime('');
      await loadData();
    } catch (error) {
      console.error('Create class error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!courseData) return <div className="p-8 text-center text-gray-500">Carregando curso...</div>;

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-teal-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar aos Cursos
      </Link>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{courseData.title}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-sm font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded">
              Carga horária: {courseData.duration_hours || 0}h
            </span>
          </div>
          {courseData.description && <p className="text-gray-500 mt-3">{courseData.description}</p>}
        </div>
        <Link 
          to={`/course/${courseId}/certificates`}
          className="px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg font-medium transition-colors border border-teal-100 flex items-center gap-2 whitespace-nowrap"
        >
          <Award className="w-4 h-4" /> Gerenciar Certificados
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Nova Aula do Curso</h2>
            <form onSubmit={handleCreateClass} className="space-y-4">
              <input 
                type="text" 
                placeholder="Tema da Aula..." 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                required
              />
              <textarea 
                placeholder="Prévia da aula (aparecerá na página de cadastro)..." 
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all h-24 resize-none"
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Data da Aula</label>
                  <input 
                    type="date" 
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Horário Previsto</label>
                  <input 
                    type="time" 
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Professor Auxiliar (opcional)</label>
                <select
                  value={auxiliaryTeacherId}
                  onChange={e => setAuxiliaryTeacherId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="">Nenhum</option>
                  {allUsers.filter(u => u.id !== user?.id).map(u => (
                    <option key={u.id} value={u.id}>{u.name} {u.cargo ? `(${u.cargo})` : ''}</option>
                  ))}
                </select>
              </div>
              <button 
                type="submit" 
                disabled={isCreating || !newTitle.trim()}
                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Criar Aula
              </button>
            </form>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900">Aulas</h2>
            {classes.length === 0 ? (
              <div className="text-center p-8 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
                Ainda não há aulas cadastradas neste curso.
              </div>
            ) : (
              <div className="grid gap-3">
                {classes.map(c => (
                  <Link key={c.id} to={`/class/${c.id}`} className="block group">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-teal-300 hover:shadow-md transition-all flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">{c.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <Calendar className="w-3 h-3" /> {c.date ? format(new Date(c.date), "dd/MM/yyyy 'às' HH:mm") : '-'}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={clsx("text-xs font-medium px-2 py-1 rounded-full", {
                          "bg-yellow-100 text-yellow-800": c.status === 'scheduled',
                          "bg-green-100 text-green-800": c.status === 'active',
                          "bg-gray-100 text-gray-800": c.status === 'completed',
                        })}>
                          {c.status === 'scheduled' ? 'Agendado' : c.status === 'active' ? 'Em andamento' : 'Concluído'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 sticky top-24">
            <div className="flex items-center gap-2 mb-4">
              <BarChart className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-medium text-gray-900">Desempenho Geral</h2>
            </div>
            
            <p className="text-sm text-gray-500 mb-4">
              O certificado exige mínimo de <strong className="text-gray-700">75%</strong> de presença. 
              {classes.length > 0 ? ` Baseado em ${classes.length} aulas registradas.` : ''}
            </p>

            {studentsReport.length === 0 ? (
              <div className="text-center p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
                Nenhum dado de presença coletado ainda.
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {studentsReport.map((s: any) => (
                  <div key={s.identifier} className="flex flex-col gap-1 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-sm text-gray-900 line-clamp-1">{s.full_name}</span>
                      <span className={clsx("text-xs font-bold px-2 py-0.5 rounded", s.approved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                        {Math.round(s.percentage)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Cpf/Email: {s.identifier}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
