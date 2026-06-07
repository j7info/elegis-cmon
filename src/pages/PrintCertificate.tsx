import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Loader2, Printer } from 'lucide-react';
import { format } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import { useSettings } from '../lib/useSettings';
import { QRCodeSVG } from 'qrcode.react';

export function PrintCertificate() {
  const { courseId, studentId } = useParams();
  const { settings } = useSettings();
  
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<any>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [classesList, setClassesList] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      if (!courseId || !studentId) return;
      try {
        const [courseData, classesData, reportData] = await Promise.all([
          api.get(`/courses/${courseId}`),
          api.get(`/classes/course/${courseId}`),
          api.get(`/certificates/report/${courseId}`),
        ]);

        setCourse(courseData);
        setClassesList(classesData.sort((a: any, b: any) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ));

        // Find student in report
        const student = (reportData.students || []).find((s: any) => s.identifier === decodeURIComponent(studentId!));
        
        if (!student) {
          console.error('Student not found in report');
          setLoading(false);
          return;
        }

        // Issue or fetch certificate
        const cert = await api.post('/certificates', {
          course_id: parseInt(courseId!),
          student_id: decodeURIComponent(studentId!),
          student_name: student.full_name || 'Sem Nome',
          course_title: courseData.title,
          points: student.points,
          percentage: student.percentage,
        });

        setStudentInfo({
          ...student,
          token: cert.token,
          issuedAt: cert.issued_at,
        });

      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [courseId, studentId]);

  if (loading) return <div className="flex justify-center items-center h-screen bg-gray-50"><Loader2 className="w-10 h-10 animate-spin text-gray-500" /></div>;
  if (!course || !studentInfo) return <div className="text-center p-8">Erro ao carregar dados.</div>;

  const certConfig = course.certificate_config 
    ? (typeof course.certificate_config === 'string' ? JSON.parse(course.certificate_config) : course.certificate_config) 
    : {};
  
  const configText = certConfig.text || 'Certificamos que {{ALUNO}} concluiu com êxito o curso de {{CURSO}} com carga horária de {{CARGA_HORARIA}}h, alcançando a marca de {{PONTUACAO}} pontos e {{PERCENTUAL}}% de presença.';
  
  const formattedText = configText
    .replace(/{{ALUNO}}/g, studentInfo.full_name || '(Nome Indisponível)')
    .replace(/{{CURSO}}/g, course.title)
    .replace(/{{CARGA_HORARIA}}/g, String(course.duration_hours || 0))
    .replace(/{{PONTUACAO}}/g, String(studentInfo.points))
    .replace(/{{PERCENTUAL}}/g, String(studentInfo.percentage));

  const signatures: any[] = certConfig.signatures || [];

  return (
    <div className="min-h-screen bg-gray-200 py-8 print:py-0 print:bg-white flex flex-col items-center overflow-x-auto">
      
      <div className="min-w-[297mm] flex flex-col items-center">
        <div className="mb-8 flex gap-4 no-print w-full justify-end">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg font-bold shadow hover:bg-teal-700 transition"
          >
            <Printer className="w-5 h-5" /> Imprimir / Salvar PDF
          </button>
        </div>

        <div className="w-[297mm] h-[210mm] bg-white shadow-xl print:shadow-none print:m-0 flex flex-col relative mb-12 print:break-after-page border-8 border-double border-gray-100 p-12">
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          {settings.logoUrl && (
            <img src={settings.logoUrl} alt="Logo" className="h-24 object-contain mb-6" />
          )}
          <h2 className="text-xl font-sans font-bold text-gray-500 tracking-widest uppercase mb-8">{settings.appName || 'Câmara Municipal'}</h2>
          <h1 className="text-5xl font-serif text-gray-900 mb-8 tracking-widest uppercase text-teal-900 border-b-2 border-teal-100 pb-6 w-full max-w-2xl">Certificado de Conclusão</h1>
          
          <p className="text-2xl font-serif text-gray-700 leading-relaxed max-w-4xl text-justify-center" style={{ textIndent: '3rem' }}>
            {formattedText}
          </p>
          
          <div className="mt-16 text-lg font-serif text-gray-500">
            {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </div>
        </div>

        <div className="mt-auto flex w-full justify-between items-end pb-8">
          
          <div className="flex flex-col items-center justify-center -ml-4">
             <div className="p-1 bg-white border border-gray-200 rounded mb-1 shadow-sm">
               <QRCodeSVG value={`${window.location.origin}/#/verify/${studentInfo.token}`} size={70} level="M" />
             </div>
             <p className="text-[10px] text-gray-500 font-mono tracking-wide">Validar: {studentInfo.token}</p>
          </div>

          <div className="flex justify-end items-end gap-16 flex-1">
            {signatures.length > 0 && signatures.map((sig: any, i: number) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="w-56 border-b border-gray-400 mb-2"></div>
                <span className="font-bold text-gray-800 font-sans text-sm">{sig.name}</span>
                <span className="text-xs text-gray-500 font-sans">{sig.role}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      <div className="w-[297mm] h-[210mm] bg-white shadow-xl print:shadow-none print:m-0 flex flex-col relative p-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 border-b-2 border-gray-200 pb-2 uppercase tracking-wider text-center">Conteúdo Programático</h2>
        
        <div className="grid grid-cols-2 gap-x-16 gap-y-4">
          {classesList.map((c: any, i: number) => (
            <div key={c.id} className="text-sm text-gray-800 break-inside-avoid shadow-sm border border-gray-100 rounded-lg p-4">
              <span className="font-bold block mb-1 text-teal-800">Módulo {i + 1}: {c.title}</span>
              {c.description && <span className="text-gray-600 block line-clamp-3">{c.description}</span>}
            </div>
          ))}
        </div>
      </div>
      
      </div>
      
      <style dangerouslySetInnerHTML={{__html:`
        @page {
          size: A4 landscape;
          margin: 0;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background-color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        body { font-family: 'Inter', sans-serif; }
      `}} />
    </div>
  );
}
