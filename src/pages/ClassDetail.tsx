import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { ArrowLeft, Users, Download, Play, CheckCircle2, Presentation, FileUp, Link as LinkIcon, Copy, Clock, PlayCircle, BarChart2 } from 'lucide-react';
import clsx from 'clsx';
import { PresentationViewer } from '../components/PresentationViewer';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function ClassDetail() {
  const { classId } = useParams();
  const { user } = useAuth();
  const [classData, setClassData] = useState<any>(null);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [presentationFile, setPresentationFile] = useState<File | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState('10');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    if (!classId) return;
    try {
      const [cls, atts, regs] = await Promise.all([
        api.get(`/classes/${classId}`),
        api.get(`/classes/${classId}/attendances`),
        api.get(`/classes/${classId}/registrations`),
      ]);
      setClassData(cls);
      setAttendances(atts);
      setRegistrations(regs);
      if (cls.qr_duration_minutes && !editingDuration) {
        setDurationInput(String(cls.qr_duration_minutes));
      }
    } catch (err) {
      console.error('Error loading class:', err);
    }
  }, [classId, editingDuration]);

  useEffect(() => {
    loadData();
    // Poll every 5 seconds when class is active
    pollRef.current = setInterval(loadData, 5000);
    return () => clearInterval(pollRef.current);
  }, [loadData]);

  if (!classData) return <div className="p-8 text-center text-gray-500">Carregando aula...</div>;

  const updateClass = async (updates: any) => {
    try {
      const updated = await api.put(`/classes/${classId}`, updates);
      setClassData(updated);
    } catch (err) {
      console.error('Update class error:', err);
    }
  };

  const saveDuration = async () => {
    const val = parseInt(durationInput, 10);
    if (isNaN(val) || val <= 0) return;
    await updateClass({ qr_duration_minutes: val });
    setEditingDuration(false);
  };

  const activateQRStep = async (step: string) => {
    await updateClass({ [`qr_${step}_at`]: Date.now() });
  };

  const exportCSV = () => {
    if (registrations.length === 0) return;
    const headers = ['Nome Completo', 'CPF/Email', 'Função', 'Departamento', 'Chegada (Início)', 'Confirmação (Meio)', 'Saída (Fim)', 'Pontuação'];
    const escapeCsv = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
    const formatTime = (ts: number | undefined) => ts ? format(new Date(ts), 'HH:mm:ss') : 'Falta';
    
    const rows = registrations.map(reg => {
      const att = attendances.find(a => a.identifier === reg.identifier);
      let p = 0;
      if (att?.scan_start) p += 40;
      if (att?.scan_middle) p += 30;
      if (att?.scan_end) p += 30;

      return [
        escapeCsv(reg.full_name),
        escapeCsv(reg.identifier),
        escapeCsv(reg.role),
        escapeCsv(reg.department),
        escapeCsv(att ? formatTime(att.scan_start) : 'Falta'),
        escapeCsv(att ? formatTime(att.scan_middle) : 'Falta'),
        escapeCsv(att ? formatTime(att.scan_end) : 'Falta'),
        p
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

  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
  const registrationUrl = `${appUrl}/#/register/${classId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(registrationUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const chartData = registrations.map(reg => {
    const att = attendances.find(a => a.identifier === reg.identifier);
    let p = 0;
    if (att?.scan_start) p += 40;
    if (att?.scan_middle) p += 30;
    if (att?.scan_end) p += 30;
    return { name: reg.full_name || reg.identifier, points: p };
  }).sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-6">
      <Link to={`/course/${classData.course_id}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-teal-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Curso
      </Link>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{classData.title}</h1>
          <p className="text-gray-500 mt-1">{classData.date ? format(new Date(classData.date), 'dd/MM/yyyy') : ''}</p>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          
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
              <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                <Presentation className="w-4 h-4" /> Apresentar PDF
              </button>
              <button onClick={() => updateClass({ status: 'completed' })} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Concluir Aula
              </button>
            </>
          )}
          <button onClick={exportCSV} disabled={registrations.length === 0} className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {classData.status === 'scheduled' && (
        <div className="bg-teal-50 border border-teal-100 p-6 rounded-xl text-teal-800 flex flex-col items-center justify-center text-center">
          <LinkIcon className="w-10 h-10 text-teal-400 mb-3" />
          <h3 className="text-lg font-bold mb-1">A aula está agendada</h3>
          <p className="text-teal-600 mb-6">Compartilhe o link de cadastro com os alunos antes de iniciar a aula.</p>
          <div className="flex bg-white rounded-lg border border-teal-200 overflow-hidden shadow-sm">
            <input type="text" readOnly value={registrationUrl} className="px-4 py-3 outline-none text-gray-500 w-80 text-sm" />
            <button onClick={copyLink} className="px-6 py-3 bg-teal-600 text-white font-medium hover:bg-teal-700 transition-colors">
              {linkCopied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {classData.status === 'active' && (
        <div className="grid md:grid-cols-3 gap-6">
          <QRCard 
            url={`${appUrl}/#/s/${classId}/start`} 
            title="Entrada (Início) - 40 pts" 
            description={`Escaneie nos primeiros ${classData.qr_duration_minutes || 10} min`} 
            step="start"
            attendances={attendances}
            activeAt={classData.qr_start_at}
            onActivate={() => activateQRStep('start')}
            durationMinutes={classData.qr_duration_minutes || 10}
          />
          <QRCard 
            url={`${appUrl}/#/s/${classId}/middle`} 
            title="Presença (Meio) - 30 pts" 
            description={`Janela de presença (${classData.qr_duration_minutes || 10} min)`} 
            step="middle"
            attendances={attendances}
            activeAt={classData.qr_middle_at}
            onActivate={() => activateQRStep('middle')}
            durationMinutes={classData.qr_duration_minutes || 10}
          />
          <QRCard 
            url={`${appUrl}/#/s/${classId}/end`} 
            title="Saída (Fim) - 30 pts" 
            description={`Encerramento da aula (${classData.qr_duration_minutes || 10} min)`} 
            step="end"
            attendances={attendances}
            activeAt={classData.qr_end_at}
            onActivate={() => activateQRStep('end')}
            durationMinutes={classData.qr_duration_minutes || 10}
          />
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
                <th className="px-4 py-3 text-gray-700 text-center">Início (40)</th>
                <th className="px-4 py-3 text-gray-700 text-center">Meio (30)</th>
                <th className="px-4 py-3 text-gray-700 text-center">Fim (30)</th>
                <th className="px-4 py-3 text-gray-700 text-center font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {registrations.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nenhum aluno cadastrado ainda.</td></tr>
              ) : (
                registrations.map(reg => {
                  const att = attendances.find(a => a.identifier === reg.identifier);
                  let p = 0; if (att?.scan_start) p+=40; if (att?.scan_middle) p+=30; if (att?.scan_end) p+=30;
                  return (
                    <tr key={reg.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">{reg.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{reg.identifier}</td>
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
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {presentationFile && (
        <PresentationViewer 
          file={presentationFile} 
          onClose={() => setPresentationFile(null)} 
          classId={classId!}
          appUrl={appUrl}
          attendances={attendances}
          onActivateQR={activateQRStep}
          classData={classData}
        />
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
