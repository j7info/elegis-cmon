import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { ArrowLeft, Save, FileText, CheckCircle2, User, Printer } from 'lucide-react';
import clsx from 'clsx';

export function CertificateManager() {
  const { courseId } = useParams();
  const { user } = useAuth();
  
  const [courseData, setCourseData] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [studentsReport, setStudentsReport] = useState<any[]>([]);
  
  const [configText, setConfigText] = useState('');
  const [signatures, setSignatures] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!courseId) return;

    const loadData = async () => {
      try {
        const [course, classList, report, users] = await Promise.all([
          api.get(`/courses/${courseId}`),
          api.get(`/classes/course/${courseId}`),
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
          setConfigText('Certificamos que {{ALUNO}} concluiu com êxito o curso de {{CURSO}} com carga horária de {{CARGA_HORARIA}}h, alcançando a marca de {{PONTUACAO}} pontos e {{PERCENTUAL}}% de presença.');
        }
      } catch (err) {
        console.error('Error loading data:', err);
      }
    };
    
    loadData();
  }, [courseId]);

  const saveConfig = async () => {
    if (!courseId) return;
    setSaving(true);
    try {
      await api.put(`/courses/${courseId}`, {
        certificate_config: { text: configText, signatures },
      });
    } catch (e) {
      console.error('Save config error:', e);
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

  if (!courseData) return <div className="p-8 text-center text-gray-500">Carregando dados...</div>;

  const approvedStudents = studentsReport.filter((s: any) => s.approved);

  return (
    <div className="space-y-6">
      <Link to={`/course/${courseId}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-teal-600 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar ao Curso
      </Link>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emissão de Certificados</h1>
          <p className="text-gray-500 mt-2">Configure o texto e layout e emita os certificados dos alunos aprovados - {courseData.title}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-teal-600" /> Configuração do Certificado
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Texto Principal</label>
                <div className="text-xs text-gray-500 mb-2 p-2 bg-gray-50 rounded border border-gray-100">
                  Variáveis disponíveis (são substituídas automaticamente): <br/>
                  <code className="text-teal-600 font-bold font-mono">{"{{ALUNO}}"}</code>, 
                  <code className="text-teal-600 font-bold font-mono ml-2">{"{{CURSO}}"}</code>, 
                  <code className="text-teal-600 font-bold font-mono ml-2">{"{{CARGA_HORARIA}}"}</code>, 
                  <code className="text-teal-600 font-bold font-mono ml-2">{"{{PONTUACAO}}"}</code>, 
                  <code className="text-teal-600 font-bold font-mono ml-2">{"{{PERCENTUAL}}"}</code>
                </div>
                <textarea 
                  value={configText}
                  onChange={e => setConfigText(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none transition-all h-32 resize-none"
                  placeholder="Ex: Certificamos que {{ALUNO}} concluiu o curso..."
                />
              </div>

              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                  <label className="block text-sm font-medium text-gray-700">Assinaturas</label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    {systemUsers.length > 0 && (
                      <select 
                        onChange={(e) => {
                          const u = systemUsers.find((u: any) => String(u.id) === e.target.value);
                          if (u) {
                            setSignatures([...signatures, { name: u.name, role: u.cargo || u.funcao_confianca || '' }]);
                          }
                          e.target.value = '';
                        }}
                        className="text-xs border border-gray-200 rounded px-2 py-1 outline-none text-gray-600 bg-white"
                        defaultValue=""
                      >
                        <option value="" disabled>+ Usuário do Sistema</option>
                        {systemUsers.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.name} ({u.cargo || ''})</option>
                        ))}
                      </select>
                    )}
                    <button onClick={addSignature} className="text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors text-left sm:text-center p-1 sm:p-0">
                      + Assinatura Personalizada
                    </button>
                  </div>
                </div>
                
                {signatures.length === 0 ? (
                  <div className="text-xs text-gray-400 italic">Nenhuma assinatura configurada. O certificado sairá sem campos de assinatura.</div>
                ) : (
                  <div className="space-y-3">
                    {signatures.map((sig: any, i: number) => (
                      <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <input 
                          type="text" 
                          placeholder="Nome Completo" 
                          value={sig.name}
                          onChange={e => updateSignature(i, 'name', e.target.value)}
                          className="w-full sm:flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                        <input 
                          type="text" 
                          placeholder="Cargo/Função" 
                          value={sig.role}
                          onChange={e => updateSignature(i, 'role', e.target.value)}
                          className="w-full sm:flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                        <button onClick={() => removeSignature(i)} className="text-red-500 hover:text-red-700 font-bold px-2 py-1 text-xs self-end sm:self-auto">
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button 
                  onClick={saveConfig}
                  disabled={saving}
                  className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Configuração'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" /> Alunos Aprovados
              </span>
              <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {approvedStudents.length} / {studentsReport.length}
              </span>
            </h2>

            {approvedStudents.length === 0 ? (
              <div className="text-sm text-gray-500 text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                Ainda não há alunos com presença mínima de 75% necessária para o certificado.
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {approvedStudents.map((student: any) => (
                  <div key={student.identifier} className="flex flex-row items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-teal-200 transition-colors">
                    <div>
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" /> {student.full_name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 pl-6">
                        {Math.round(student.percentage)}% Presença • {student.points} pontos
                      </div>
                    </div>
                    <Link 
                      to={`/certificate/${courseId}/${encodeURIComponent(student.identifier)}`}
                      target="_blank"
                      className="p-2 text-teal-600 hover:bg-teal-100 rounded-md transition-colors border border-teal-200 bg-white"
                      title="Emitir Certificado"
                    >
                      <Printer className="w-4 h-4" />
                    </Link>
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
