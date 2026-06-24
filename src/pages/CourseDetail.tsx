import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { maskIdentifier } from '../lib/format';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, FileText, Download, Users, CheckCircle2, ChevronRight, X, Edit3, Trash2, Award, Copy, BarChart, User, Loader2, Link as LinkIcon, Plus, FileUp, Video } from 'lucide-react';
import clsx from 'clsx';

export function CourseDetail() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courseData, setCourseData] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [auxiliaryTeacherId, setAuxiliaryTeacherId] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newPdfFile, setNewPdfFile] = useState<File | null>(null);
  const [pointsStart, setPointsStart] = useState('40');
  const [pointsMiddle, setPointsMiddle] = useState('30');
  const [pointsEnd, setPointsEnd] = useState('30');
  const [studentsReport, setStudentsReport] = useState<any[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [newClassType, setNewClassType] = useState<'presential' | 'online' | 'interactive' | 'video'>('presential');
  const [interactiveFile, setInteractiveFile] = useState<File | null>(null);
  const [newExpectedDuration, setNewExpectedDuration] = useState('30');
  const [newSlideMinSeconds, setNewSlideMinSeconds] = useState('30');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editEnrollmentOpen, setEditEnrollmentOpen] = useState(true);
  const [isEditingCourse, setIsEditingCourse] = useState(false);
  const [showReuseModal, setShowReuseModal] = useState(false);
  const [reuseTitle, setReuseTitle] = useState('');
  const [reuseStartDate, setReuseStartDate] = useState('');
  const [reuseEndDate, setReuseEndDate] = useState('');
  const [isReusing, setIsReusing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selfScanLoading, setSelfScanLoading] = useState<string | null>(null);
  const [selfScanFeedback, setSelfScanFeedback] = useState<Record<number, { type: 'success' | 'error'; message: string }>>({});

  const isStudent = user?.system_role === 'ALUNO';

  const loadData = async () => {
    if (!courseId) return;
    try {
      const promises: Promise<any>[] = [
        api.get(`/courses/${courseId}`),
        api.get(`/classes/course/${courseId}`)
      ];

      if (!isStudent) {
        promises.push(api.get(`/certificates/report/${courseId}`));
        promises.push(api.get('/users'));
      }

      const results = await Promise.all(promises);
      setCourseData(results[0]);
      setClasses(results[1]);
      
      if (!isStudent) {
        setStudentsReport(results[2]?.students || []);
        setAllUsers(results[3] || []);
        
        // Carrega pendentes separadamente para não quebrar a tela caso a tabela não tenha a coluna status ainda
        try {
          const pending = await api.get(`/courses/${courseId}/pending-registrations`);
          setPendingRegistrations(pending || []);
        } catch (e) {
          console.warn('Could not load pending registrations', e);
        }
      }
    } catch (err) {
      console.error('Error loading course:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [courseId]);

  useEffect(() => {
    if (!isStudent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [isStudent]);

  useEffect(() => {
    if (!isStudent || !courseId) return;
    const timer = window.setInterval(() => loadData(), 20000);
    return () => window.clearInterval(timer);
  }, [isStudent, courseId]);

  const getActiveAttendanceStep = (classItem: any): 'start' | 'middle' | 'end' | null => {
    if (!isStudent || classItem.type === 'online' || classItem.status !== 'active') return null;
    const durationMs = (classItem.qr_duration_minutes || 10) * 60 * 1000;
    const steps: Array<'start' | 'middle' | 'end'> = ['start', 'middle', 'end'];

    for (const step of steps) {
      const activeAt = classItem[`qr_${step}_at`];
      if (activeAt && now >= Number(activeAt) && now <= Number(activeAt) + durationMs) {
        return step;
      }
    }

    return null;
  };

  const getStepLabel = (step: 'start' | 'middle' | 'end') => {
    if (step === 'start') return 'entrada';
    if (step === 'middle') return 'meio da aula';
    return 'saída';
  };

  const handleSelfAttendance = async (classItem: any, step: 'start' | 'middle' | 'end') => {
    const loadingKey = `${classItem.id}:${step}`;
    setSelfScanLoading(loadingKey);
    setSelfScanFeedback(prev => {
      const next = { ...prev };
      delete next[classItem.id];
      return next;
    });

    try {
      const result = await api.post(`/classes/${classItem.id}/scan/${step}/self`);
      setSelfScanFeedback(prev => ({
        ...prev,
        [classItem.id]: { type: 'success', message: result.message || 'Presença registrada com sucesso.' },
      }));
    } catch (err: any) {
      setSelfScanFeedback(prev => ({
        ...prev,
        [classItem.id]: { type: 'error', message: err?.message || 'Não foi possível registrar presença.' },
      }));
    } finally {
      setSelfScanLoading(null);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle.trim() || !courseId) return;
    try {
      setIsCreating(true);
      const combinedDate = newDate && newTime ? new Date(`${newDate}T${newTime}`).toISOString() : undefined;
      const created = await api.post('/classes', {
        course_id: parseInt(courseId),
        title: newTitle.trim(),
        description: newDescription.trim(),
        date: combinedDate,
        qr_duration_minutes: 10,
        auxiliary_teacher_id: auxiliaryTeacherId ? parseInt(auxiliaryTeacherId) : undefined,
        points_start: parseInt(pointsStart, 10) || 0,
        points_middle: parseInt(pointsMiddle, 10) || 0,
        points_end: parseInt(pointsEnd, 10) || 0,
        type: (newClassType === 'interactive' || newClassType === 'video') ? 'online' : newClassType,
        is_interactive: newClassType === 'interactive',
        online_content_type: newClassType === 'video' ? 'video' : 'slides',
        video_url: newClassType === 'video' ? newVideoUrl.trim() : null,
        expected_duration_minutes: (newClassType === 'online' || newClassType === 'interactive' || newClassType === 'video') ? (parseInt(newExpectedDuration, 10) || 30) : null,
        slide_minimum_seconds: (newClassType === 'online' || newClassType === 'interactive') ? (parseInt(newSlideMinSeconds, 10) || 30) : null,
      });

      // Anexa o PDF de apresentação, se selecionado e não for interativa
      if (newPdfFile && created?.id && newClassType !== 'interactive') {
        const fd = new FormData();
        fd.append('file', newPdfFile);
        await api.upload(`/classes/${created.id}/presentation`, fd);
      }

      // Anexa o ZIP da aula interativa
      if (interactiveFile && created?.id && newClassType === 'interactive') {
        const fd = new FormData();
        fd.append('type', 'html');
        fd.append('file', interactiveFile);
        await api.upload(`/classes/${created.id}/interactive`, fd);
      }

      setNewTitle('');
      setNewDescription('');
      setAuxiliaryTeacherId('');
      setNewDate('');
      setNewTime('');
      setNewPdfFile(null);
      setInteractiveFile(null);
      setNewVideoUrl('');
      setPointsStart('40');
      setPointsMiddle('30');
      setPointsEnd('30');
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
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <span className="text-sm font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded">
              Carga horária: {courseData.duration_hours || 0}h
            </span>
            {courseData.start_date && (
              <span className="text-sm text-gray-500">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                {format(new Date(courseData.start_date), 'dd/MM/yyyy')} — {courseData.end_date ? format(new Date(courseData.end_date), 'dd/MM/yyyy') : '...'}
              </span>
            )}
            {courseData.parent_course_id && (
              <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Reaproveitado</span>
            )}
            {!isStudent && (
              <span className={clsx(
                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                courseData.enrollment_open !== false ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
              )}>
                {courseData.enrollment_open !== false ? 'Inscrições abertas' : 'Inscrições fechadas'}
              </span>
            )}
          </div>
          {courseData.description && <p className="text-gray-500 mt-3">{courseData.description}</p>}
        </div>
        {!isStudent && (
          <div className="flex gap-2 flex-wrap mt-4 md:mt-0">
            <button
              onClick={() => {
                setEditTitle(courseData.title);
                setEditDescription(courseData.description || '');
                setEditDuration(String(courseData.duration_hours || 0));
                setEditStartDate(courseData.start_date ? format(new Date(courseData.start_date), 'yyyy-MM-dd') : '');
                setEditEndDate(courseData.end_date ? format(new Date(courseData.end_date), 'yyyy-MM-dd') : '');
                setEditEnrollmentOpen(courseData.enrollment_open !== false);
                setShowEditCourse(true);
              }}
              className="px-4 py-2 bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors border border-gray-200 flex items-center gap-2 whitespace-nowrap text-sm"
            >
              <Edit3 className="w-4 h-4" /> Editar Curso
            </button>
            <button
              onClick={() => {
                setReuseTitle(`${courseData.title} (nova turma)`);
                setReuseStartDate('');
                setReuseEndDate('');
                setShowReuseModal(true);
              }}
              className="px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg font-medium transition-colors border border-teal-100 flex items-center gap-2 whitespace-nowrap text-sm"
            >
              <Copy className="w-4 h-4" /> Reutilizar Curso
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/#/course-register/${courseId}`);
                alert('Link de cadastro copiado!');
              }}
              className="px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg font-medium transition-colors border border-teal-100 flex items-center gap-2 whitespace-nowrap text-sm"
            >
              <LinkIcon className="w-4 h-4" /> Link Inscrição
            </button>
            <Link 
              to={`/course/${courseId}/certificates`}
              className="px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg font-medium transition-colors border border-teal-100 flex items-center gap-2 whitespace-nowrap text-sm"
            >
              <Award className="w-4 h-4" /> Certificados
            </Link>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className={clsx("space-y-6", isStudent ? "md:col-span-3" : "md:col-span-2")}>
          {!isStudent && (
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
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Tipo de Aula</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewClassType('interactive')}
                      className={clsx(
                        'flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all',
                        newClassType === 'interactive'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      )}
                    >
                      Interativa
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewClassType('presential')}
                      className={clsx(
                        'flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all',
                        newClassType === 'presential'
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      )}
                    >
                      Presencial
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewClassType('online')}
                      className={clsx(
                        'flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all',
                        newClassType === 'online'
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      )}
                    >
                      Online
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewClassType('video')}
                      className={clsx(
                        'flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all',
                        newClassType === 'video'
                          ? 'border-rose-500 bg-rose-50 text-rose-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      )}
                    >
                      Vídeo
                    </button>
                  </div>
                </div>

                {newClassType === 'online' && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div>
                      <label className="block text-sm font-medium text-blue-800 mb-1">Tempo esperado total</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={newExpectedDuration}
                          onChange={e => setNewExpectedDuration(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                          min="1"
                          required
                        />
                        <span className="text-sm text-blue-600 font-medium flex-shrink-0">min</span>
                      </div>
                      <p className="text-xs text-blue-500 mt-1">Para calcular % de presença</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-blue-800 mb-1">Mínimo por slide</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={newSlideMinSeconds}
                          onChange={e => setNewSlideMinSeconds(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                          min="1"
                          required
                        />
                        <span className="text-sm text-blue-600 font-medium flex-shrink-0">seg</span>
                      </div>
                      <p className="text-xs text-blue-500 mt-1">Trava para avançar slide</p>
                    </div>
                  </div>
                )}

                {newClassType === 'video' && (
                  <div className="space-y-4 p-4 bg-rose-50 rounded-xl border border-rose-100">
                    <div>
                      <label className="block text-sm font-medium text-rose-800 mb-1">URL ou código de incorporação do YouTube</label>
                      <div className="flex items-center gap-2">
                        <Video className="w-5 h-5 text-rose-500 flex-shrink-0" />
                        <input
                          type="text"
                          value={newVideoUrl}
                          onChange={e => setNewVideoUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=... ou <iframe ...>"
                          className="w-full px-3 py-2 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none bg-white"
                          required
                        />
                      </div>
                      <p className="text-xs text-rose-500 mt-1">Pode ser vídeo não listado. O sistema extrai o vídeo e lê a duração ao abrir o player.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-rose-800 mb-1">Tempo esperado inicial</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={newExpectedDuration}
                          onChange={e => setNewExpectedDuration(e.target.value)}
                          className="w-full px-3 py-2 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none bg-white"
                          min="1"
                          required
                        />
                        <span className="text-sm text-rose-600 font-medium flex-shrink-0">min</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-gray-700">Pontuação da Aula</label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-xs text-gray-500">Início</span>
                      <input type="number" min="0" value={pointsStart} onChange={e => setPointsStart(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Meio</span>
                      <input type="number" min="0" value={pointsMiddle} onChange={e => setPointsMiddle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Fim</span>
                      <input type="number" min="0" value={pointsEnd} onChange={e => setPointsEnd(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    Total: {(parseInt(pointsStart, 10) || 0) + (parseInt(pointsMiddle, 10) || 0) + (parseInt(pointsEnd, 10) || 0)} pts. Você pode alterar a qualquer momento na aula.
                  </p>
                </div>

                {newClassType === 'interactive' ? (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-purple-700">Arquivo da Aula Interativa (.ZIP)</label>
                    <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-purple-300 rounded-lg cursor-pointer hover:border-purple-400 transition-colors bg-purple-50">
                      <FileUp className="w-5 h-5 text-purple-400" />
                      <span className={clsx('text-sm', interactiveFile ? 'text-purple-800 font-medium' : 'text-purple-500')}>
                        {interactiveFile ? interactiveFile.name : 'Selecionar arquivo .zip com index.html da aula'}
                      </span>
                      <input type="file" accept=".zip,application/zip" className="hidden"
                        onChange={e => setInteractiveFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                ) : newClassType === 'video' ? null : (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">PDF de Apresentação (opcional)</label>
                    <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-400 transition-colors">
                      {newPdfFile ? <FileText className="w-5 h-5 text-teal-600" /> : <FileUp className="w-5 h-5 text-gray-400" />}
                      <span className={clsx('text-sm', newPdfFile ? 'text-gray-800 font-medium' : 'text-gray-500')}>
                        {newPdfFile ? newPdfFile.name : 'Selecionar PDF (os QR de presença aparecem durante a apresentação)'}
                      </span>
                      <input type="file" accept="application/pdf" className="hidden"
                        onChange={e => setNewPdfFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                )}

                <button
                  type="submit" 
                  disabled={isCreating || !newTitle.trim()}
                  className="px-6 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Criar Aula
                </button>
              </form>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900">Aulas</h2>
            {classes.length === 0 ? (
              <div className="text-center p-8 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
                Ainda não há aulas cadastradas neste curso.
              </div>
            ) : (
              <div className="grid gap-3">
                {classes.map(c => {
                  const activeAttendanceStep = getActiveAttendanceStep(c);
                  const feedback = selfScanFeedback[c.id];
                  return (
                  <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-teal-300 hover:shadow-md transition-all flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between group">
                    {isStudent ? (
                      <div className="flex-1 min-w-0">
                        {c.type === 'online' || c.is_interactive ? (
                          <Link to={c.is_interactive ? `/interactive-lesson/${c.id}` : `/online-class/${c.id}`} className="block">
                            <h3 className="font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">{c.title}</h3>
                          </Link>
                        ) : (
                          <h3 className="font-semibold text-gray-900">{c.title}</h3>
                        )}
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1 flex-wrap">
                          <Calendar className="w-3 h-3" /> {c.date ? format(new Date(c.date), "dd/MM/yyyy 'às' HH:mm") : '-'}
                          {c.type === 'online' && (
                            <span className={clsx(
                              'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                              c.online_content_type === 'video' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                            )}>
                              {c.online_content_type === 'video' ? 'Vídeo' : 'Online'}
                            </span>
                          )}
                          {activeAttendanceStep && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-teal-100 text-teal-700">
                              Chamada de {getStepLabel(activeAttendanceStep)} aberta
                            </span>
                          )}
                        </div>
                        {feedback && (
                          <p className={clsx(
                            'mt-2 text-xs font-medium',
                            feedback.type === 'success' ? 'text-green-700' : 'text-red-700'
                          )}>
                            {feedback.message}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Link to={`/class/${c.id}`} className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">{c.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <Calendar className="w-3 h-3" /> {c.date ? format(new Date(c.date), "dd/MM/yyyy 'às' HH:mm") : '-'}
                          {c.type === 'online' && (
                            <span className={clsx(
                              'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                              c.online_content_type === 'video' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                            )}>
                              {c.online_content_type === 'video' ? 'Vídeo' : 'Online'}
                            </span>
                          )}
                        </div>
                      </Link>
                    )}
                    <div className="flex items-center gap-2">
                      {isStudent ? (
                        <>
                          {activeAttendanceStep && (
                            <button
                              type="button"
                              onClick={() => handleSelfAttendance(c, activeAttendanceStep)}
                              disabled={selfScanLoading === `${c.id}:${activeAttendanceStep}`}
                              className="text-xs font-medium px-3 py-1.5 rounded-full bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
                            >
                              {selfScanLoading === `${c.id}:${activeAttendanceStep}` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Registrar {getStepLabel(activeAttendanceStep)}
                            </button>
                          )}
                          {(c.type === 'online' || c.is_interactive) && c.status === 'active' && (
                            <Link to={c.is_interactive ? `/interactive-lesson/${c.id}` : `/online-class/${c.id}`} className="text-xs font-medium px-3 py-1.5 rounded-full bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                              Acessar Aula
                            </Link>
                          )}
                          <span className={clsx("text-xs font-medium px-2 py-1 rounded-full", {
                            "bg-yellow-100 text-yellow-800": c.status === 'scheduled',
                            "bg-green-100 text-green-800": c.status === 'active',
                            "bg-gray-100 text-gray-800": c.status === 'completed',
                          })}>
                            {c.status === 'scheduled' ? 'Agendado' : c.status === 'active' ? 'Em andamento' : 'Concluído'}
                          </span>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={async () => {
                              const newTitle = `${c.title} (cópia)`;
                              try {
                                const newClass = await api.post(`/classes/${c.id}/reuse`, {
                                  course_id: parseInt(courseId!),
                                  title: newTitle,
                                });
                                loadData();
                              } catch (err: any) {
                                alert(err?.message || 'Erro ao reutilizar aula');
                              }
                            }}
                            className="text-xs text-teal-600 hover:text-teal-800 hover:bg-teal-50 px-2 py-1 rounded transition-colors font-medium"
                            title="Reutilizar aula"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <Link to={`/class/${c.id}`}>
                            <span className={clsx("text-xs font-medium px-2 py-1 rounded-full", {
                              "bg-yellow-100 text-yellow-800": c.status === 'scheduled',
                              "bg-green-100 text-green-800": c.status === 'active',
                              "bg-gray-100 text-gray-800": c.status === 'completed',
                            })}>
                              {c.status === 'scheduled' ? 'Agendado' : c.status === 'active' ? 'Em andamento' : 'Concluído'}
                            </span>
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {!isStudent && (
          <div className="md:col-span-1 space-y-6">
            {pendingRegistrations.length > 0 && (
              <div className="bg-amber-50 p-6 rounded-xl shadow-sm border border-amber-200">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-amber-600" />
                  <h2 className="text-lg font-medium text-amber-900">Alunos Pendentes ({pendingRegistrations.length})</h2>
                </div>
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                  {pendingRegistrations.map((reg) => (
                    <div key={reg.id} className="p-3 bg-white rounded-lg border border-amber-100 shadow-sm text-sm">
                      <div className="font-medium text-gray-900">{reg.full_name}</div>
                      <div className="text-xs text-gray-500 mb-2">{reg.identifier} • {reg.department}</div>
                      <button
                        onClick={() => {
                          const mat = prompt('Informe a matrícula para aprovar este aluno (ou deixe em branco para usar o identificador como senha):');
                          if (mat !== null) {
                            api.post(`/courses/${courseId}/approve-registration/${reg.id}`, {
                              matricula: mat,
                              full_name: reg.full_name,
                              identifier: reg.identifier,
                              role: reg.role,
                              department: reg.department
                            }).then(() => loadData()).catch(e => alert(e.message));
                          }
                        }}
                        className="w-full py-1.5 bg-amber-500 text-white hover:bg-amber-600 rounded font-medium transition-colors"
                      >
                        Aprovar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span>Cpf/Email: {maskIdentifier(s.identifier)}</span>
                          <span className="text-gray-300">|</span>
                          <span>Avaliação: <strong className="text-teal-600">{s.evaluation_score || 0}%</strong></span>
                        </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {showEditCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm" onClick={() => setShowEditCourse(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Editar Curso</h2>
              <button type="button" onClick={() => setShowEditCourse(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!editTitle.trim()) return;
              setIsEditingCourse(true);
              try {
                const updated = await api.put(`/courses/${courseId}`, {
                  title: editTitle.trim(),
                  description: editDescription.trim(),
                  duration_hours: parseInt(editDuration) || 0,
                  start_date: editStartDate || null,
                  end_date: editEndDate || null,
                  enrollment_open: editEnrollmentOpen,
                });
                setCourseData(updated);
                setShowEditCourse(false);
              } catch (err: any) {
                alert(err?.message || 'Erro ao atualizar curso');
              } finally {
                setIsEditingCourse(false);
              }
            }} className="space-y-4 px-6 py-5">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Título</label>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Data de Início</label>
                  <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Data de Término</label>
                  <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Carga Horária (h)</label>
                <input type="number" value={editDuration} onChange={e => setEditDuration(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Descrição</label>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editEnrollmentOpen}
                  onChange={e => setEditEnrollmentOpen(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span>
                  <span className="font-medium text-gray-900">Disponível para inscrição</span>
                  <span className="block text-xs text-gray-500">Quando ativo, alunos ainda não matriculados verão este curso na dashboard.</span>
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEditCourse(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">Cancelar</button>
                <button type="submit" disabled={isEditingCourse || !editTitle.trim()}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2">
                  {isEditingCourse ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReuseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm" onClick={() => setShowReuseModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Reutilizar Curso</h2>
              <button type="button" onClick={() => setShowReuseModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!reuseTitle.trim() || !courseId) return;
              setIsReusing(true);
              try {
                const newCourse = await api.post(`/courses/${courseId}/reuse`, {
                  title: reuseTitle.trim(),
                  start_date: reuseStartDate || null,
                  end_date: reuseEndDate || null,
                });
                setShowReuseModal(false);
                navigate(`/course/${newCourse.id}`);
              } catch (err: any) {
                alert(err?.message || 'Erro ao reutilizar curso');
              } finally {
                setIsReusing(false);
              }
            }} className="space-y-4 px-6 py-5">
              <p className="text-sm text-gray-500">Será criada uma cópia deste curso com todas as aulas, avaliações e questões. Os dados de presença e notas dos alunos <strong>não</strong> serão copiados.</p>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Título da nova turma</label>
                <input type="text" value={reuseTitle} onChange={e => setReuseTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Data de Início</label>
                  <input type="date" value={reuseStartDate} onChange={e => setReuseStartDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Data de Término</label>
                  <input type="date" value={reuseEndDate} onChange={e => setReuseEndDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowReuseModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">Cancelar</button>
                <button type="submit" disabled={isReusing || !reuseTitle.trim()}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2">
                  {isReusing ? <><Loader2 className="w-4 h-4 animate-spin" /> Copiando...</> : <><Copy className="w-4 h-4" /> Reutilizar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
