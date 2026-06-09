import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { ArrowLeft, Users, Download, Play, CheckCircle2, Presentation, FileUp, FileText, Link as LinkIcon, Copy, Clock, PlayCircle, BarChart2, Pencil, Trash2, X, Award, HelpCircle, Plus, Eye, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import { PresentationViewer } from '../components/PresentationViewer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { maskIdentifier } from '../lib/format';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function ClassDetail() {
  const { classId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classData, setClassData] = useState<any>(null);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [evalScores, setEvalScores] = useState<any[]>([]);
  const [presentationFile, setPresentationFile] = useState<File | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  
  const [isEditingClass, setIsEditingClass] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [editAuxTeacherId, setEditAuxTeacherId] = useState('');
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState('10');
  const [editPdfFile, setEditPdfFile] = useState<File | null>(null);
  const [removePdf, setRemovePdf] = useState(false);

  const [editingPoints, setEditingPoints] = useState(false);
  const [pointsStartInput, setPointsStartInput] = useState('40');
  const [pointsMiddleInput, setPointsMiddleInput] = useState('30');
  const [pointsEndInput, setPointsEndInput] = useState('30');

  // Online class settings
  const [editType, setEditType] = useState<'presential' | 'online'>('presential');
  const [editExpectedDuration, setEditExpectedDuration] = useState('30');
  const [editSlideMinSeconds, setEditSlideMinSeconds] = useState('30');

  // Evaluation state
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [showCreateEval, setShowCreateEval] = useState(false);
  const [editingEvalId, setEditingEvalId] = useState<number | null>(null);
  const [evalTitle, setEvalTitle] = useState('');
  const [evalQuestionTime, setEvalQuestionTime] = useState('30');
  const [evalQuestions, setEvalQuestions] = useState<any[]>([{ text: '', points: 10, alternatives: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }] }]);
  const [justifyingId, setJustifyingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    if (!classId) return;
    try {
      const cls = await api.get(`/classes/${classId}`);
      // A lista é de alunos do CURSO (aluno definitivo): em cada aula ele
      // apenas reafirma presença. Cruzamos com as presenças desta aula.
      const [atts, studs] = await Promise.all([
        api.get(`/classes/${classId}/attendances`),
        api.get(`/courses/${cls.course_id}/students`),
      ]);
      setClassData(cls);
      setAttendances(atts);
      setRegistrations(studs);
      try {
        const scores = await api.get(`/classes/${classId}/evaluation-scores`);
        setEvalScores(scores);
      } catch (err) {} // Ignore if no evaluations yet
      if (cls.qr_duration_minutes && !editingDuration) {
        setDurationInput(String(cls.qr_duration_minutes));
      }
      if (!editingPoints) {
        setPointsStartInput(String(cls.points_start ?? 40));
        setPointsMiddleInput(String(cls.points_middle ?? 30));
        setPointsEndInput(String(cls.points_end ?? 30));
      }
    } catch (err) {
      console.error('Error loading class:', err);
    }
  }, [classId, editingDuration, editingPoints]);

  useEffect(() => {
    loadData();
    // Poll every 5 seconds when class is active
    pollRef.current = setInterval(loadData, 5000);
    return () => clearInterval(pollRef.current);
  }, [loadData]);

  const loadEvaluations = useCallback(async () => {
    if (!classId) return;
    try {
      const data = await api.get(`/classes/${classId}/evaluations`);
      setEvaluations(data);
    } catch (err) {
      console.error('Load evaluations error:', err);
    }
  }, [classId]);

  useEffect(() => {
    if (classData) loadEvaluations();
  }, [classData, loadEvaluations]);

  if (!classData) return <div className="p-8 text-center text-gray-500">Carregando aula...</div>;

  // Pesos de pontuação configurados por aula (fallback 40/30/30)
  const pStart = classData.points_start ?? 40;
  const pMiddle = classData.points_middle ?? 30;
  const pEnd = classData.points_end ?? 30;
  const pTotal = pStart + pMiddle + pEnd;
  const calcPoints = (att: any) => {
    if (att?.justification != null) {
      return Math.round((pStart + pMiddle + pEnd) * att.justification / 100);
    }
    let p = 0;
    if (att?.scan_start) p += pStart;
    if (att?.scan_middle) p += pMiddle;
    if (att?.scan_end) p += pEnd;
    return p;
  };

  const updateClass = async (updates: any) => {
    try {
      const updated = await api.put(`/classes/${classId}`, updates);
      setClassData(updated);
    } catch (err) {
      console.error('Update class error:', err);
    }
  };

  const handleDeleteClass = async () => {
    if (!window.confirm('Tem certeza que deseja excluir esta aula? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/classes/${classId}`);
      navigate(`/course/${classData.course_id}`);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao excluir aula.');
    }
  };

  const openEditModal = async () => {
    setEditTitle(classData.title || '');
    setEditDescription(classData.description || '');
    if (classData.date) {
      const d = new Date(classData.date);
      setEditDate(format(d, 'yyyy-MM-dd'));
      setEditTime(format(d, 'HH:mm'));
    } else {
      setEditDate('');
      setEditTime('');
    }
    setEditAuxTeacherId(classData.auxiliary_teacher_id ? String(classData.auxiliary_teacher_id) : '');
    setEditPdfFile(null);
    setRemovePdf(false);
    setIsEditingClass(true);
    setEditType(classData.type || 'presential');
    setEditExpectedDuration(String(classData.expected_duration_minutes ?? 30));
    setEditSlideMinSeconds(String(classData.slide_minimum_seconds ?? 30));
    
    // Load users if empty
    if (allUsers.length === 0) {
      try {
        const usersData = await api.get('/users');
        setAllUsers(usersData);
      } catch (err) {}
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;
    
    const combinedDate = editDate && editTime ? new Date(`${editDate}T${editTime}`).toISOString() : undefined;
    
    try {
      let updated = await api.put(`/classes/${classId}`, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        date: combinedDate,
        auxiliary_teacher_id: editAuxTeacherId ? parseInt(editAuxTeacherId) : null,
        type: editType,
        expected_duration_minutes: editType === 'online' ? (parseInt(editExpectedDuration) || 30) : null,
        slide_minimum_seconds: editType === 'online' ? (parseInt(editSlideMinSeconds) || 30) : null,
      });
      // Remove o PDF se solicitado
      if (removePdf) {
        updated = await api.delete(`/classes/${classId}/presentation`);
      }
      // Anexa/substitui o PDF de apresentação, se um novo foi selecionado
      if (editPdfFile) {
        const fd = new FormData();
        fd.append('file', editPdfFile);
        updated = await api.upload(`/classes/${classId}/presentation`, fd);
      }
      setClassData(updated);
      setEditPdfFile(null);
      setRemovePdf(false);
      setIsEditingClass(false);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao atualizar aula.');
    }
  };

  const saveDuration = async () => {
    const val = parseInt(durationInput, 10);
    if (isNaN(val) || val <= 0) return;
    await updateClass({ qr_duration_minutes: val });
    setEditingDuration(false);
  };

  const savePoints = async () => {
    const ps = parseInt(pointsStartInput, 10);
    const pm = parseInt(pointsMiddleInput, 10);
    const pe = parseInt(pointsEndInput, 10);
    if ([ps, pm, pe].some(v => isNaN(v) || v < 0)) return;
    await updateClass({ points_start: ps, points_middle: pm, points_end: pe });
    setEditingPoints(false);
  };

  // Abre a apresentação: usa o PDF salvo na aula, ou pede um arquivo na hora.
  const handlePresent = async () => {
    if (classData.presentation_url) {
      try {
        // Resolve a URL salva ('/api/uploads/...') contra a base da API,
        // para funcionar tanto em produção (nginx) quanto em dev (VITE_API_URL).
        const apiBase = import.meta.env.VITE_API_URL || '/api';
        const fileUrl = String(classData.presentation_url).replace(/^\/api/, apiBase);
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error('Arquivo PDF não encontrado no servidor');
        const blob = await resp.blob();
        setPresentationFile(new File([blob], 'apresentacao.pdf', { type: 'application/pdf' }));
        return;
      } catch (err) {
        console.error('Erro ao carregar PDF salvo:', err);
      }
    }
    fileInputRef.current?.click();
  };

  const activateQRStep = async (step: string) => {
    await updateClass({ [`qr_${step}_at`]: Date.now() });
  };

  const exportCSV = () => {
    if (registrations.length === 0) return;
    const headers = ['Nome Completo', 'CPF/Email', 'Função', 'Departamento', `Chegada (Início ${pStart})`, `Confirmação (Meio ${pMiddle})`, `Saída (Fim ${pEnd})`, 'Pontuação'];
    const escapeCsv = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
    const formatTime = (ts: number | undefined) => ts ? format(new Date(ts), 'HH:mm:ss') : 'Falta';

    const rows = registrations.map(reg => {
      const att = attendances.find(a => a.identifier === reg.identifier);
      return [
        escapeCsv(reg.full_name),
        escapeCsv(reg.identifier),
        escapeCsv(reg.role),
        escapeCsv(reg.department),
        escapeCsv(att ? formatTime(att.scan_start) : 'Falta'),
        escapeCsv(att ? formatTime(att.scan_middle) : 'Falta'),
        escapeCsv(att ? formatTime(att.scan_end) : 'Falta'),
        calcPoints(att)
      ].join(',');
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(["\ufeff"+csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `presenca_aula_${classData.date ? format(new Date(classData.date), 'yyyyMMdd') : 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Exporta a lista oficial de presença em PDF (CPF completo) via impressão.
  const exportPDF = () => {
    if (registrations.length === 0) return;
    const dateStr = classData.date ? format(new Date(classData.date), "dd/MM/yyyy 'às' HH:mm") : '-';
    const esc = (v: any) => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const fmt = (ts: number | undefined) => ts ? format(new Date(ts), 'HH:mm') : '—';

    const bodyRows = registrations.map(reg => {
      const att = attendances.find(a => a.identifier === reg.identifier);
      return `<tr>
        <td>${esc(reg.full_name)}</td>
        <td>${esc(reg.identifier)}</td>
        <td>${esc(reg.role)}</td>
        <td>${esc(reg.department)}</td>
        <td class="c">${fmt(att?.scan_start)}</td>
        <td class="c">${fmt(att?.scan_middle)}</td>
        <td class="c">${fmt(att?.scan_end)}</td>
        <td class="c b">${calcPoints(att)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Lista de Presença - ${esc(classData.title)}</title>
      <style>
        * { font-family: Arial, Helvetica, sans-serif; }
        body { padding: 24px; color: #1f2937; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .sub { color: #6b7280; font-size: 12px; margin: 0 0 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
        th { background: #f3f4f6; }
        td.c, th.c { text-align: center; }
        td.b { font-weight: bold; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>Lista de Presença — ${esc(classData.title)}</h1>
      <p class="sub">Data: ${dateStr} &nbsp;|&nbsp; Pontuação: Início ${pStart} / Meio ${pMiddle} / Fim ${pEnd} (total ${pTotal}) &nbsp;|&nbsp; ${registrations.length} aluno(s)</p>
      <table>
        <thead><tr>
          <th>Nome</th><th>Identificação (CPF/Email)</th><th>Função</th><th>Departamento</th>
          <th class="c">Início (${pStart})</th><th class="c">Meio (${pMiddle})</th><th class="c">Fim (${pEnd})</th><th class="c">Total</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <script>window.onload = function(){ window.print(); }<\/script>
      </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups para exportar o PDF.'); return; }
    win.document.write(html);
    win.document.close();
  };

  const handleAddQuestion = () => {
    setEvalQuestions([...evalQuestions, { text: '', points: 10, alternatives: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }] }]);
  };

  const handleRemoveQuestion = (idx: number) => {
    if (evalQuestions.length <= 1) return;
    setEvalQuestions(evalQuestions.filter((_, i) => i !== idx));
  };

  const handleQuestionChange = (idx: number, text: string) => {
    const updated = [...evalQuestions];
    updated[idx] = { ...updated[idx], text };
    setEvalQuestions(updated);
  };

  const handleAltChange = (qIdx: number, aIdx: number, text: string) => {
    const updated = [...evalQuestions];
    updated[qIdx].alternatives[aIdx] = { ...updated[qIdx].alternatives[aIdx], text };
    setEvalQuestions(updated);
  };

  const handleCorrectChange = (qIdx: number, aIdx: number) => {
    const updated = [...evalQuestions];
    updated[qIdx].alternatives = updated[qIdx].alternatives.map((a: any, i: number) => ({
      ...a, is_correct: i === aIdx,
    }));
    setEvalQuestions(updated);
  };

  const resetEvalForm = () => {
    setEvalTitle('');
    setEvalQuestionTime('30');
    setEvalQuestions([{ text: '', points: 10, alternatives: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }] }]);
    setEditingEvalId(null);
  };

  const openCreateEvaluation = () => {
    resetEvalForm();
    setShowCreateEval(true);
  };

  const openEditEvaluation = async (evalId: number) => {
    try {
      const data = await api.get(`/evaluations/${evalId}`);
      setEvalTitle(data.title);
      setEvalQuestionTime(String(data.question_time || 30));
      setEvalQuestions(data.questions.map((q: any) => ({
        text: q.text,
        points: q.points || 10,
        alternatives: q.alternatives.map((a: any) => ({
          text: a.text,
          is_correct: a.is_correct || false,
        })),
      })));
      setEditingEvalId(evalId);
      setShowCreateEval(true);
    } catch (err) {
      alert('Erro ao carregar avaliação para edição');
    }
  };

  const handleCreateEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evalTitle.trim() || !classId) return;

    const questions = evalQuestions.map(q => ({
      text: q.text,
      points: parseInt(q.points) || 10,
      alternatives: q.alternatives.map((a: any) => ({
        text: a.text,
        is_correct: a.is_correct || false,
      })),
    }));

    try {
      if (editingEvalId) {
        await api.put(`/evaluations/${editingEvalId}`, {
          title: evalTitle.trim(),
          question_time: parseInt(evalQuestionTime) || 30,
          questions,
        });
      } else {
        await api.post(`/classes/${classId}/evaluations`, {
          title: evalTitle.trim(),
          question_time: parseInt(evalQuestionTime) || 30,
          questions,
        });
      }
      setShowCreateEval(false);
      resetEvalForm();
      loadEvaluations();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar avaliação');
    }
  };

  const handleDeleteEvaluation = async (evalId: number) => {
    if (!window.confirm('Excluir esta avaliação?')) return;
    try {
      await api.delete(`/evaluations/${evalId}`);
      loadEvaluations();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir');
    }
  };

  const handleResetEvaluation = async (evalId: number) => {
    if (!window.confirm('Reexibir esta avaliação? Os dados de participantes e respostas serão apagados.')) return;
    try {
      await api.post(`/evaluations/${evalId}/reset`);
      loadEvaluations();
    } catch (err: any) {
      alert(err.message || 'Erro ao reexibir');
    }
  };

  const handleJustifyAttendance = async (identifier: string, justification: number) => {
    if (!classId) return;
    try {
      await api.put(`/classes/${classId}/attendances/justify`, { identifier, justification });
      setJustifyingId(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao justificar');
    }
  };

  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const registrationUrl = `${appUrl}/#/register/${classId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(registrationUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const chartData = registrations.map(reg => {
    const att = attendances.find(a => a.identifier === reg.identifier);
    return { name: reg.full_name || reg.identifier, points: calcPoints(att) };
  }).sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-6">
      <Link to={`/course/${classData.course_id}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-teal-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Curso
      </Link>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{classData.title}</h1>
          <p className="text-gray-500 mt-1">{classData.date ? format(new Date(classData.date), "dd/MM/yyyy 'às' HH:mm") : ''}</p>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          
          {classData.status === 'scheduled' && (
            <div className="flex items-center gap-2 mr-2 border-r border-gray-200 pr-4">
              <button onClick={openEditModal} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Editar Aula">
                <Pencil className="w-5 h-5" />
              </button>
              <button onClick={handleDeleteClass} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir Aula">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Duração QR:</span>
            {editingDuration && classData.status !== 'completed' ? (
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={durationInput} 
                  onChange={e => setDurationInput(e.target.value)}
                  className="w-16 px-2 py-1 text-sm border rounded outline-none" 
                  min="1"
                />
                <button onClick={saveDuration} className="text-xs font-bold text-teal-600">Salvar</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-800">{classData.qr_duration_minutes || 10} min</span>
                {classData.status !== 'completed' && <button onClick={() => setEditingDuration(true)} className="text-xs text-teal-600 underline">Editar</button>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
            <Award className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Pontuação:</span>
            {editingPoints && classData.status !== 'completed' ? (
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" value={pointsStartInput} onChange={e => setPointsStartInput(e.target.value)} className="w-12 px-1.5 py-1 text-sm border rounded outline-none text-center" title="Início" />
                <span className="text-gray-300">/</span>
                <input type="number" min="0" value={pointsMiddleInput} onChange={e => setPointsMiddleInput(e.target.value)} className="w-12 px-1.5 py-1 text-sm border rounded outline-none text-center" title="Meio" />
                <span className="text-gray-300">/</span>
                <input type="number" min="0" value={pointsEndInput} onChange={e => setPointsEndInput(e.target.value)} className="w-12 px-1.5 py-1 text-sm border rounded outline-none text-center" title="Fim" />
                <button onClick={savePoints} className="text-xs font-bold text-teal-600 ml-1">Salvar</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-800">{pStart} / {pMiddle} / {pEnd}</span>
                {classData.status !== 'completed' && <button onClick={() => setEditingPoints(true)} className="text-xs text-teal-600 underline">Editar</button>}
              </div>
            )}
          </div>

          <button onClick={copyLink} className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
            {linkCopied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />} 
            Link Cadastro
          </button>
          
          {classData.status === 'scheduled' && (
            <button onClick={() => updateClass({ status: 'active' })} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
              <Play className="w-4 h-4" /> Iniciar Aula
            </button>
          )}
          {classData.status === 'active' && (
            <>
              <input type="file" accept="application/pdf" ref={fileInputRef} className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setPresentationFile(file); }} />
              <button onClick={handlePresent} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                <Presentation className="w-4 h-4" /> {classData.presentation_url ? 'Apresentar' : 'Apresentar PDF'}
              </button>
              <button onClick={() => updateClass({ status: 'completed' })} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Concluir Aula
              </button>
            </>
          )}
          <button onClick={exportCSV} disabled={registrations.length === 0} className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button onClick={exportPDF} disabled={registrations.length === 0} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
            <FileText className="w-4 h-4" /> Exportar PDF
          </button>
        </div>
      </div>

      {classData.status === 'scheduled' && classData.type !== 'online' && (
        <div className="bg-teal-50 border border-teal-100 p-6 rounded-xl text-teal-800 flex flex-col items-center justify-center text-center">
          <LinkIcon className="w-10 h-10 text-teal-400 mb-3" />
          <h3 className="text-lg font-bold mb-1">Aula presencial agendada</h3>
          <p className="text-teal-600 mb-6">Compartilhe o link de cadastro com os alunos antes de iniciar a aula.</p>
          <div className="flex bg-white rounded-lg border border-teal-200 overflow-hidden shadow-sm">
            <input type="text" readOnly value={registrationUrl} className="px-4 py-3 outline-none text-gray-500 w-80 text-sm" />
            <button onClick={copyLink} className="px-6 py-3 bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors">
              {linkCopied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {classData.status === 'scheduled' && classData.type === 'online' && (
        <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl text-blue-800 flex flex-col items-center justify-center text-center">
          <BookOpen className="w-10 h-10 text-blue-400 mb-3" />
          <h3 className="text-lg font-bold mb-1">Aula online agendada</h3>
          <p className="text-blue-600 mb-2">Após iniciar a aula, os alunos poderão acessar os slides remotamente.</p>
          <p className="text-xs text-blue-500 mb-6">
            Tempo esperado: {classData.expected_duration_minutes || 30} min · {' '}
            Mínimo por slide: {classData.slide_minimum_seconds || 30}s
          </p>
        </div>
      )}

      {classData.status === 'active' && classData.type !== 'online' && (
        <div className="grid md:grid-cols-3 gap-6">
          <QRCard
            url={`${appUrl}/#/s/${classId}/start`}
            title={`Entrada (Início) - ${pStart} pts`}
            description={`Escaneie nos primeiros ${classData.qr_duration_minutes || 10} min`}
            step="start"
            attendances={attendances}
            activeAt={classData.qr_start_at}
            onActivate={() => activateQRStep('start')}
            durationMinutes={classData.qr_duration_minutes || 10}
          />
          <QRCard
            url={`${appUrl}/#/s/${classId}/middle`}
            title={`Presença (Meio) - ${pMiddle} pts`}
            description={`Janela de presença (${classData.qr_duration_minutes || 10} min)`}
            step="middle"
            attendances={attendances}
            activeAt={classData.qr_middle_at}
            onActivate={() => activateQRStep('middle')}
            durationMinutes={classData.qr_duration_minutes || 10}
          />
          <QRCard
            url={`${appUrl}/#/s/${classId}/end`}
            title={`Saída (Fim) - ${pEnd} pts`}
            description={`Encerramento da aula (${classData.qr_duration_minutes || 10} min)`}
            step="end"
            attendances={attendances}
            activeAt={classData.qr_end_at}
            onActivate={() => activateQRStep('end')}
            durationMinutes={classData.qr_duration_minutes || 10}
          />
        </div>
      )}

      {classData.status === 'active' && classData.type === 'online' && (
        <div className="bg-teal-50 border border-teal-200 p-6 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <h3 className="font-semibold text-teal-800">Aula Online disponível</h3>
          </div>
          <p className="text-sm text-teal-600 mb-4">
            Compartilhe o link abaixo com os alunos. Eles acessarão os slides diretamente no navegador.
          </p>
          <p className="text-xs text-teal-500 mb-3">
            Presença calculada por tempo de leitura · Esperado: {classData.expected_duration_minutes || 30} min · {' '}
            Mínimo por slide: {classData.slide_minimum_seconds || 30}s
          </p>
          <div className="flex bg-white rounded-lg border border-teal-200 overflow-hidden shadow-sm">
            <input
              type="text"
              readOnly
              value={`${appUrl}/#/online-class/${classId}`}
              className="px-4 py-3 outline-none text-gray-500 w-full text-sm"
            />
            <button
              onClick={copyLink}
              className="px-6 py-3 bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors flex-shrink-0"
            >
              {linkCopied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {classData.status === 'completed' && chartData.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart2 className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-medium text-gray-900">Desempenho da Aula (Pontuação)</h2>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="points" name="Pontos" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            Cadastros & Presenças ({attendances.length} de {registrations.length})
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="text-xs text-gray-50 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-gray-700">Nome</th>
                <th className="px-4 py-3 text-gray-700">Identificação</th>
                <th className="px-4 py-3 text-gray-700 text-center">Início ({pStart})</th>
                <th className="px-4 py-3 text-gray-700 text-center">Meio ({pMiddle})</th>
                <th className="px-4 py-3 text-gray-700 text-center">Fim ({pEnd})</th>
                <th className="px-4 py-3 text-gray-700 text-center font-bold">Total</th>
                <th className="px-4 py-3 text-gray-700 text-center">Avaliação</th>
                <th className="px-4 py-3 text-gray-700 text-center">Justificativa</th>
              </tr>
            </thead>
            <tbody>
              {registrations.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nenhum aluno cadastrado ainda.</td></tr>
              ) : (
                registrations.map(reg => {
                  const att = attendances.find(a => a.identifier === reg.identifier);
                  const p = calcPoints(att);
                  return (
                    <tr key={reg.identifier} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{reg.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{maskIdentifier(reg.identifier)}</td>
                      <td className="px-4 py-3 text-center text-xs">
                        {att?.scan_start ? <CheckCircle2 className="w-4 h-4 mx-auto text-green-500" /> : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {att?.scan_middle ? <CheckCircle2 className="w-4 h-4 mx-auto text-green-500" /> : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {att?.scan_end ? <CheckCircle2 className="w-4 h-4 mx-auto text-green-500" /> : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-teal-600">{p}</td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const es = evalScores.find(s => s.identifier === reg.identifier);
                          if (es) {
                            const pts = parseInt(es.total_score);
                            const maxPts = parseInt(es.total_possible);
                            const pct = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0;
                            return <span className={clsx("text-xs font-bold", pts > 0 ? "text-teal-600" : "text-gray-400")}>{pts}/{maxPts} ({pct}%)</span>;
                          }
                          return <span className="text-gray-300">-</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {att?.justification != null ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            <Award className="w-3 h-3" /> {att.justification}%
                          </span>
                        ) : classData.status !== 'completed' && p === 0 ? (
                          <div className="relative">
                            <button
                              onClick={() => setJustifyingId(justifyingId === reg.identifier ? null : reg.identifier)}
                              className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                            >
                              Justificar
                            </button>
                            {justifyingId === reg.identifier && (
                              <div className="absolute right-0 top-6 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1">
                                <button onClick={() => handleJustifyAttendance(reg.identifier, 70)} className="px-3 py-1.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-md hover:bg-amber-200 whitespace-nowrap">70%</button>
                                <button onClick={() => handleJustifyAttendance(reg.identifier, 100)} className="px-3 py-1.5 text-xs font-bold bg-green-100 text-green-800 rounded-md hover:bg-green-200 whitespace-nowrap">100%</button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Evaluation Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-teal-600" />
            Avaliações
          </h2>
          {classData.status !== 'completed' && (
            <button
              onClick={openCreateEvaluation}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Inserir Avaliação
            </button>
          )}
        </div>

        {evaluations.length === 0 ? (
          <p className="text-center text-gray-400 py-8">Nenhuma avaliação criada ainda.</p>
        ) : (
          <div className="space-y-3">
            {evaluations.map((ev: any) => (
              <div key={ev.id} className="flex items-center justify-between bg-gray-50 px-5 py-4 rounded-xl border border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-900">{ev.title}</h3>
                  <p className="text-sm text-gray-500">
                    {ev.question_count} pergunta(s) · {ev.participant_count || 0} participante(s) · {ev.question_time}s por pergunta
                    <span className={clsx(
                      "ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      ev.status === 'draft' && "bg-gray-100 text-gray-600",
                      ev.status === 'waiting' && "bg-amber-100 text-amber-700",
                      ev.status === 'active' && "bg-green-100 text-green-700",
                      ev.status === 'completed' && "bg-blue-100 text-blue-700",
                    )}>
                      {ev.status === 'draft' && 'Rascunho'}
                      {ev.status === 'waiting' && 'Aguardando'}
                      {ev.status === 'active' && 'Em andamento'}
                      {ev.status === 'completed' && 'Finalizada'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {ev.status === 'draft' && (
                    <>
                      <button onClick={() => openEditEvaluation(ev.id)} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteEvaluation(ev.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => navigate(`/evaluation/${ev.id}/session`)} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold transition-colors">
                        Iniciar Avaliação
                      </button>
                    </>
                  )}
                  {ev.status === 'waiting' && (
                    <button onClick={() => navigate(`/evaluation/${ev.id}/session`)} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold transition-colors">
                      Ir para Sala
                    </button>
                  )}
                  {ev.status === 'active' && (
                    <button onClick={() => navigate(`/evaluation/${ev.id}/session`)} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
                      <Eye className="w-4 h-4" /> Acompanhar
                    </button>
                  )}
                  {ev.status === 'completed' && (
                    <>
                      <button onClick={() => handleResetEvaluation(ev.id)} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
                        <Play className="w-4 h-4" /> Reexibir
                      </button>
                      <button onClick={() => navigate(`/evaluation/${ev.id}/session`)} className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-bold transition-colors">
                        Ver Resultados
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Evaluation Modal */}
      {showCreateEval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm" onClick={() => { setShowCreateEval(false); resetEvalForm(); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-teal-600" /> {editingEvalId ? 'Editar Avaliação' : 'Nova Avaliação'}
              </h2>
              <button onClick={() => { setShowCreateEval(false); resetEvalForm(); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvaluation} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título da Avaliação</label>
                  <input
                    type="text"
                    value={evalTitle}
                    onChange={e => setEvalTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="Ex: Quiz Módulo 1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tempo por Pergunta (segundos)</label>
                  <input
                    type="number"
                    value={evalQuestionTime}
                    onChange={e => setEvalQuestionTime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                    min="5"
                    max="300"
                    required
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Perguntas</h3>
                  <button type="button" onClick={handleAddQuestion} className="px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Adicionar Pergunta
                  </button>
                </div>

                {evalQuestions.map((q, qIdx) => (
                  <div key={qIdx} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-gray-600">Pergunta {qIdx + 1}</span>
                      {evalQuestions.length > 1 && (
                        <button type="button" onClick={() => handleRemoveQuestion(qIdx)} className="text-xs text-red-600 hover:text-red-800 font-medium">Remover</button>
                      )}
                    </div>
                    <textarea
                      value={q.text}
                      onChange={e => handleQuestionChange(qIdx, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none h-20 resize-none mb-2"
                      placeholder="Digite a pergunta..."
                      required
                    />
                    <div className="flex items-center gap-2 mb-3">
                      <label className="text-xs font-medium text-gray-500">Valor:</label>
                      <input
                        type="number"
                        value={q.points}
                        onChange={e => {
                          const updated = [...evalQuestions];
                          updated[qIdx] = { ...updated[qIdx], points: parseInt(e.target.value) || 0 };
                          setEvalQuestions(updated);
                        }}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-center"
                        min="0"
                      />
                      <span className="text-xs text-gray-400">pts</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {q.alternatives.map((alt: any, aIdx: number) => (
                        <div key={aIdx} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCorrectChange(qIdx, aIdx)}
                            className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${alt.is_correct ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-teal-400'}`}
                            title="Marcar como correta"
                          >
                            {alt.is_correct && <CheckCircle2 className="w-4 h-4 text-white" />}
                          </button>
                          <input
                            type="text"
                            value={alt.text}
                            onChange={e => handleAltChange(qIdx, aIdx, e.target.value)}
                            className={`flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500 ${alt.is_correct ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}
                            placeholder={`Alternativa ${String.fromCharCode(65 + aIdx)}`}
                            required
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button type="button" onClick={() => { setShowCreateEval(false); resetEvalForm(); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={!evalTitle.trim() || evalQuestions.some((q: any) => !q.text.trim() || q.alternatives.some((a: any) => !a.text.trim())) || evalQuestions.some((q: any) => !q.alternatives.some((a: any) => a.is_correct))}
                  className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50">
                  {editingEvalId ? 'Salvar Alterações' : 'Criar Avaliação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {presentationFile && (
        <ErrorBoundary>
          <PresentationViewer 
            file={presentationFile} 
            onClose={() => setPresentationFile(null)} 
            classId={classId!}
            appUrl={appUrl}
            attendances={attendances}
            onActivateQR={activateQRStep}
            classData={classData}
          />
        </ErrorBoundary>
      )}

      {isEditingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-teal-600" /> Editar Aula
              </h2>
              <button onClick={() => setIsEditingClass(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                <input 
                  type="text" 
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Aula</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditType('presential')}
                    className={clsx(
                      'flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all',
                      editType === 'presential'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    )}
                  >
                    Presencial
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType('online')}
                    className={clsx(
                      'flex-1 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all',
                      editType === 'online'
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    )}
                  >
                    Online
                  </button>
                </div>
              </div>

              {editType === 'online' && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <div>
                    <label className="block text-sm font-medium text-blue-800 mb-1">Tempo esperado total</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editExpectedDuration}
                        onChange={e => setEditExpectedDuration(e.target.value)}
                        className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                        min="1"
                        required
                      />
                      <span className="text-sm text-blue-600 font-medium flex-shrink-0">minutos</span>
                    </div>
                    <p className="text-xs text-blue-500 mt-1">Tempo total para ler todos os slides</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-800 mb-1">Tempo mínimo por slide</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editSlideMinSeconds}
                        onChange={e => setEditSlideMinSeconds(e.target.value)}
                        className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                        min="1"
                        required
                      />
                      <span className="text-sm text-blue-600 font-medium flex-shrink-0">segundos</span>
                    </div>
                    <p className="text-xs text-blue-500 mt-1">Mínimo antes de avançar ao próximo slide</p>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea 
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none h-24 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input 
                    type="date" 
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input 
                    type="time" 
                    value={editTime}
                    onChange={e => setEditTime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Professor Auxiliar (Opcional)</label>
                <select
                  value={editAuxTeacherId}
                  onChange={e => setEditAuxTeacherId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="">Nenhum</option>
                  {allUsers.filter(u => u.id !== user?.id).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF de Apresentação</label>

                {removePdf ? (
                  <div className="flex items-center gap-2 px-4 py-3 border border-red-200 rounded-lg bg-red-50">
                    <span className="text-sm text-red-700 flex-1">PDF será removido ao salvar</span>
                    <button type="button" onClick={() => setRemovePdf(false)}
                      className="text-xs text-gray-600 hover:text-gray-800 font-medium">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-400 transition-colors">
                      {editPdfFile ? <FileText className="w-5 h-5 text-teal-600" /> : <FileUp className="w-5 h-5 text-gray-400" />}
                      <span className={clsx('text-sm', editPdfFile ? 'text-gray-800 font-medium' : 'text-gray-500')}>
                        {editPdfFile ? editPdfFile.name : (classData.presentation_url ? 'Clique para substituir o PDF' : 'Selecionar PDF (opcional)')}
                      </span>
                      <input type="file" accept="application/pdf" className="hidden"
                        onChange={e => setEditPdfFile(e.target.files?.[0] || null)} />
                    </label>
                    {classData.presentation_url && !editPdfFile && (
                      <button type="button" onClick={() => setRemovePdf(true)}
                        className="text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-1">
                        <Trash2 className="w-4 h-4" /> Remover PDF
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsEditingClass(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={!editTitle.trim()} className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50">
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function QRCard({ title, description, url, step, attendances, activeAt, onActivate, durationMinutes }: { title: string, description: string, url: string, step: string, attendances: any[], activeAt?: number, onActivate: () => void, durationMinutes: number }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!activeAt) return;
    const interval = setInterval(() => {
      const expiresAt = Number(activeAt) + (durationMinutes * 60 * 1000);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeAt, durationMinutes]);

  const recentScans = attendances.filter(a => {
    if (step === 'start') return !!a.scan_start;
    if (step === 'middle') return !!a.scan_middle;
    return !!a.scan_end;
  }).sort((a, b) => {
    const aTime = step === 'start' ? a.scan_start : step === 'middle' ? a.scan_middle : a.scan_end;
    const bTime = step === 'start' ? b.scan_start : step === 'middle' ? b.scan_middle : b.scan_end;
    return bTime - aTime;
  }).slice(0, 5);

  const formatMinSec = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isActive = activeAt && timeLeft !== null && timeLeft > 0;
  const isExpired = activeAt && timeLeft === 0;

  return (
    <div className={clsx("bg-white p-6 rounded-xl border shadow-md flex flex-col items-center text-center transition-all h-full", isActive ? "border-teal-400" : "border-gray-200")}>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 mb-6">{description}</p>
      
      {!activeAt ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
          <button onClick={onActivate} className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-md font-bold flex items-center gap-2 transition-transform hover:scale-105">
            <PlayCircle className="w-5 h-5" /> Exibir QR Code
          </button>
          <p className="text-xs text-gray-400 mt-4 max-w-[200px]">Iniciará o contador regressivo de {durationMinutes} minutos.</p>
        </div>
      ) : (
        <>
          <div className={clsx("p-4 rounded-xl border flex-shrink-0 transition-opacity", isActive ? "bg-white border-2 border-teal-200" : "bg-gray-50 border-gray-200 opacity-50")}>
            <QRCodeSVG value={url} size={160} level="H" includeMargin={false} />
          </div>
          
          <div className="mt-4 mb-2 min-h-[24px]">
            {isActive ? (
               <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold animate-pulse">
                 <Clock className="w-3.5 h-3.5" /> Expira em {formatMinSec(timeLeft!)}
               </div>
            ) : isExpired ? (
              <span className="text-xs font-bold text-red-500">QR CODE EXPIRADO</span>
            ) : null}
          </div>

          <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-teal-600 hover:underline break-all mb-4">Abrir Link Teste</a>

          <div className="w-full mt-auto border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-400 mb-3 text-left">ÚLTIMOS CONFIRMADOS</p>
            <div className="flex flex-col gap-2 min-h-[100px]">
              {recentScans.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-left">Nenhuma leitura...</p>
              ) : (
                recentScans.map(s => (
                  <div key={s.identifier} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    <span className="truncate flex-1 text-left font-medium">{s.full_name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
