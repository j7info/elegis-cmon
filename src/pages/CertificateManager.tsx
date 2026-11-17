import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ArrowLeft, Save, FileText, CheckCircle2, User, Printer, Search, Users, BookOpen, Award, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { summarizeCertificateEligibility } from '../lib/certificateModel';

export function CertificateManager() {
  const { courseId } = useParams();
  
  const [courseData, setCourseData] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [studentsReport, setStudentsReport] = useState<any[]>([]);
  
  const [configText, setConfigText] = useState('');
  const [signatures, setSignatures] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [loadError, setLoadError] = useState('');
  const [saveFeedback, setSaveFeedback] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  useEffect(() => {
    if (!courseId) return;

    const loadData = async () => {
      try {
        const [course, classList, report, users] = await Promise.all([
          api.get(`/courses/${courseId}`),
          api.get(`/classes/course/${courseId}?scope=tree`),
          api.get(`/certificates/report/${courseId}`),
          api.get('/users'),
        ]);
        
        setCourseData(course);
        setClasses(classList);
        setStudentsReport(report.students || []);
        setSystemUsers(users);
        
        if (course.certificate_config) {
          const config = typeof course.certificate_config === 'string' 
            ? JSON.parse(course.certificate_config) 
            : course.certificate_config;
          setConfigText(config.text || '');
          setSignatures(config.signatures || []);
        } else {
          setConfigText('Certificamos que {{ALUNO}} concluiu com êxito o curso de {{CURSO}} com carga horária de {{CARGA_HORARIA}}h, alcançando {{PERCENTUAL}}% de presença, {{PONTUACAO}} pontos de presença e {{AVALIACAO}} pontos de avaliação, totalizando {{TOTAL}} pontos.');
        }
      } catch (err: any) {
        console.error('Error loading data:', err);
        setLoadError(err?.message || 'Não foi possível carregar os certificados.');
      }
    };
    
    loadData();
  }, [courseId]);

  const saveConfig = async () => {
    if (!courseId) return;
    setSaving(true);
    setSaveFeedback('');
    try {
      await api.put(`/courses/${courseId}`, {
        certificate_config: { text: configText, signatures },
      });
      setSaveFeedback('Configuração salva.');
    } catch (e) {
      console.error('Save config error:', e);
      setSaveFeedback('Não foi possível salvar a configuração.');
    } finally {
      setSaving(false);
    }
  };

  const addSignature = () => {
    setSignatures([...signatures, { name: '', role: '' }]);
  };

  const updateSignature = (index: number, field: string, val: string) => {
    const newSigs = [...signatures];
    newSigs[index][field] = val;
    setSignatures(newSigs);
  };

  const removeSignature = (index: number) => {
    setSignatures(signatures.filter((_, i) => i !== index));
  };

  if (!courseData && !loadError) return <div className="flex items-center justify-center gap-3 p-8 text-center text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Carregando certificados...</div>;
  if (loadError) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>;

  const eligibility = summarizeCertificateEligibility(studentsReport);
  const approvedStudents = eligibility.approvedStudents as any[];
  const normalizedSearch = studentSearch.trim().toLocaleLowerCase('pt-BR');
  const filteredStudents = normalizedSearch
    ? approvedStudents.filter(student => `${student.full_name || ''} ${student.identifier || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
    : approvedStudents;

  return (
    <div className="space-y-8">
      <Link to={`/course/${courseId}`} className="inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-teal-700">
        <ArrowLeft className="h-4 w-4" /> Voltar ao curso
      </Link>

      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-700">Conclusão do curso</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Certificados</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">{courseData.title}. Configure o documento e prepare a impressão dos alunos que atingiram a presença mínima.</p>
        </div>
        {approvedStudents.length > 0 && (
          <Link
            to={`/certificates/${courseId}/print-all`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800"
          >
            <Printer className="h-4 w-4" /> Preparar {approvedStudents.length} certificado{approvedStudents.length === 1 ? '' : 's'}
          </Link>
        )}
      </header>

      <section className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white xl:grid-cols-4" aria-label="Resumo de certificados">
        {[
          { label: 'Participantes', value: eligibility.total, icon: Users, tone: 'text-slate-600' },
          { label: 'Aptos', value: eligibility.approved, icon: CheckCircle2, tone: 'text-emerald-700' },
          { label: 'Ainda não aptos', value: eligibility.pending, icon: Award, tone: 'text-amber-700' },
          { label: 'Conteúdos no verso', value: classes.length, icon: BookOpen, tone: 'text-blue-700' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 border-b border-slate-100 p-4 odd:border-r [&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:p-5 xl:last:border-r-0">
            <Icon className={clsx('h-5 w-5', tone)} />
            <div><p className="text-2xl font-bold text-slate-950">{value}</p><p className="text-xs font-medium text-slate-500">{label}</p></div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="certificate-config-title">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700"><FileText className="h-5 w-5" /></span>
            <div><p className="text-xs font-bold uppercase text-teal-700">Modelo</p><h2 id="certificate-config-title" className="text-lg font-bold text-slate-950">Configuração do certificado</h2></div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Texto principal</label>
              <textarea
                value={configText}
                onChange={event => setConfigText(event.target.value)}
                className="h-36 w-full resize-none rounded-md border border-slate-300 px-3 py-3 text-sm leading-6 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                placeholder="Ex: Certificamos que {{ALUNO}} concluiu o curso..."
              />
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Variáveis disponíveis">
                {['ALUNO', 'CURSO', 'CARGA_HORARIA', 'PONTUACAO', 'PERCENTUAL', 'AVALIACAO', 'TOTAL'].map(variable => (
                  <code key={variable} className="rounded bg-slate-100 px-1.5 py-1 text-[10px] font-bold text-teal-700">{`{{${variable}}}`}</code>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-sm font-semibold text-slate-700">Assinaturas</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {systemUsers.length > 0 && (
                    <select
                      onChange={event => {
                        const selectedUser = systemUsers.find((systemUser: any) => String(systemUser.id) === event.target.value);
                        if (selectedUser) setSignatures([...signatures, { name: selectedUser.name, role: selectedUser.cargo || selectedUser.funcao_confianca || '' }]);
                        event.target.value = '';
                      }}
                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none"
                      defaultValue=""
                    >
                      <option value="" disabled>Adicionar usuário</option>
                      {systemUsers.map((systemUser: any) => <option key={systemUser.id} value={systemUser.id}>{systemUser.name}</option>)}
                    </select>
                  )}
                  <button type="button" onClick={addSignature} className="h-9 rounded-md border border-slate-200 px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50">Assinatura personalizada</button>
                </div>
              </div>

              {signatures.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 p-4 text-xs text-slate-400">Nenhuma assinatura configurada.</p>
              ) : (
                <div className="space-y-2">
                  {signatures.map((signature: any, index: number) => (
                    <div key={index} className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input type="text" placeholder="Nome completo" value={signature.name} onChange={event => updateSignature(index, 'name', event.target.value)} className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-500" />
                      <input type="text" placeholder="Cargo ou função" value={signature.role} onChange={event => updateSignature(index, 'role', event.target.value)} className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-teal-500" />
                      <button type="button" onClick={() => removeSignature(index)} className="h-9 px-2 text-xs font-semibold text-red-600 hover:text-red-800">Remover</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className={clsx('text-xs', saveFeedback === 'Configuração salva.' ? 'text-emerald-700' : 'text-red-700')}>{saveFeedback}</p>
              <button type="button" onClick={saveConfig} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? 'Salvando...' : 'Salvar modelo'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="approved-students-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-bold uppercase text-emerald-700">Prontos para emissão</p><h2 id="approved-students-title" className="mt-1 text-lg font-bold text-slate-950">Alunos aptos</h2><p className="mt-1 text-xs text-slate-500">Presença mínima de 75% no curso principal e seus subcursos.</p></div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{approvedStudents.length} de {studentsReport.length}</span>
          </div>

          {approvedStudents.length > 0 && (
            <div className="relative mt-5">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="search" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Buscar aluno ou identificação" className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-teal-500" />
            </div>
          )}

          {approvedStudents.length === 0 ? (
            <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Ainda não há alunos com presença suficiente para o certificado.</div>
          ) : filteredStudents.length === 0 ? (
            <div className="mt-5 rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Nenhum aluno encontrado.</div>
          ) : (
            <div className="mt-4 max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">
              {filteredStudents.map((student: any) => (
                <div key={student.identifier} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-900"><User className="h-4 w-4 flex-none text-slate-400" /> {student.full_name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-slate-500">
                      <span><strong className="text-emerald-700">{Math.round(student.percentage)}%</strong> presença</span>
                      <span>{student.points || 0} pts presença</span>
                      <span>{student.evaluation_score || 0} pts avaliação</span>
                    </div>
                  </div>
                  <Link to={`/certificate/${courseId}/${encodeURIComponent(student.identifier)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-teal-200 px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50">
                    <Printer className="h-4 w-4" /> Imprimir
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
