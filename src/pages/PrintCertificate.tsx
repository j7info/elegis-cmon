import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { CheckCircle2, Loader2, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettings } from '../lib/useSettings';
import { QRCodeSVG } from 'qrcode.react';
import { groupCertificateClasses } from '../lib/certificateModel';

function formatCertificateText(configText: string, studentInfo: any, course: any) {
  return configText
    .replace(/{{ALUNO}}/g, studentInfo.full_name || '(Nome Indisponível)')
    .replace(/{{CURSO}}/g, course.title)
    .replace(/{{CARGA_HORARIA}}/g, String(course.duration_hours || 0))
    .replace(/{{PONTUACAO}}/g, String(studentInfo.points ?? 0))
    .replace(/{{PERCENTUAL}}/g, String(studentInfo.percentage ?? 0))
    .replace(/{{AVALIACAO}}/g, String(studentInfo.evaluation_score ?? 0))
    .replace(/{{TOTAL}}/g, String((studentInfo.points || 0) + (studentInfo.evaluation_score || 0)));
}

function CertificatePages({ course, classesList, settings, studentInfo }: { key?: React.Key; course: any; classesList: any[]; settings: any; studentInfo: any }) {
  const certConfig = course.certificate_config
    ? (typeof course.certificate_config === 'string' ? JSON.parse(course.certificate_config) : course.certificate_config)
    : {};

  const configText = certConfig.text || 'Certificamos que {{ALUNO}} concluiu com êxito o curso de {{CURSO}} com carga horária de {{CARGA_HORARIA}}h, alcançando a marca de {{PONTUACAO}} pontos e {{PERCENTUAL}}% de presença.';
  const formattedText = formatCertificateText(configText, studentInfo, course);
  const signatures: any[] = certConfig.signatures || [];
  const groupedClasses = groupCertificateClasses(classesList);
  const compactContent = classesList.length > 16;

  return (
    <>
      <div className="w-[297mm] h-[210mm] bg-white shadow-xl print:shadow-none print:m-0 flex flex-col relative mb-12 print:mb-0 print:break-after-page border-8 border-double border-gray-100 p-12">
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

      <div className="w-[297mm] h-[210mm] bg-white shadow-xl print:shadow-none print:m-0 flex flex-col relative mb-12 print:mb-0 print:break-after-page p-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 border-b-2 border-gray-200 pb-2 uppercase tracking-wider text-center">Conteúdo Programático</h2>

        <div className="space-y-6 overflow-hidden">
          {groupedClasses.map((group, groupIndex) => (
            <section key={group.title} className="break-inside-avoid">
              <h3 className="text-sm font-bold uppercase tracking-wider text-teal-800 mb-3">
                {groupIndex + 1}. {group.title}
              </h3>
              <div className={compactContent ? 'grid grid-cols-3 gap-x-8 gap-y-2' : 'grid grid-cols-2 gap-x-16 gap-y-3'}>
                {group.classes.map((c: any, i: number) => (
                  <div key={c.id} className={compactContent ? 'break-inside-avoid rounded-lg border border-gray-100 p-2 text-xs text-gray-800' : 'break-inside-avoid rounded-lg border border-gray-100 p-3 text-sm text-gray-800 shadow-sm'}>
                    <span className="font-bold block mb-1 text-gray-900">{i + 1}. {c.title}</span>
                    {c.description && <span className="text-gray-600 block line-clamp-2">{c.description}</span>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

export function PrintCertificate() {
  const { courseId, studentId } = useParams();
  const { settings } = useSettings();

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<any>(null);
  const [studentInfos, setStudentInfos] = useState<any[]>([]);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [preparedCount, setPreparedCount] = useState(0);
  const [preparingTotal, setPreparingTotal] = useState(0);

  useEffect(() => {
    async function loadData() {
      if (!courseId) return;
      try {
        const [courseData, classesData, reportData] = await Promise.all([
          api.get(`/courses/${courseId}`),
          api.get(`/classes/course/${courseId}?scope=tree`),
          api.get(`/certificates/report/${courseId}`),
        ]);

        setCourse(courseData);
        setClassesList(classesData.sort((a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ));

        const students = reportData.students || [];
        const selectedStudents = studentId
          ? students.filter((s: any) => s.identifier === decodeURIComponent(studentId))
          : students.filter((s: any) => s.approved);

        if (selectedStudents.length === 0) {
          setError(studentId ? 'Aluno não encontrado no relatório.' : 'Nenhum aluno aprovado para emissão em lote.');
          return;
        }

        setPreparingTotal(selectedStudents.length);
        setPreparedCount(0);
        const issuedStudents = [];
        for (const student of selectedStudents) {
          const cert = await api.post('/certificates', {
            course_id: parseInt(courseId),
            student_id: student.identifier,
            student_name: student.full_name || 'Sem Nome',
            course_title: courseData.title,
            points: student.points,
            percentage: student.percentage,
            evaluation_score: student.evaluation_score || 0,
          });

          issuedStudents.push({
            ...student,
            token: cert.token,
            issuedAt: cert.issued_at,
          });
          setPreparedCount(issuedStudents.length);
        }

        setStudentInfos(issuedStudents);
      } catch (e) {
        console.error(e);
        setError('Erro ao carregar certificados.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [courseId, studentId]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm text-center">
        <Loader2 className="mx-auto h-9 w-9 animate-spin text-teal-600" />
        <h1 className="mt-4 text-lg font-bold text-slate-900">Preparando certificados</h1>
        <p className="mt-1 text-sm text-slate-500">
          {preparingTotal > 1 ? `${preparedCount} de ${preparingTotal} certificados processados` : 'Carregando dados para impressão'}
        </p>
        {preparingTotal > 1 && (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${Math.round((preparedCount / preparingTotal) * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
  if (!course || studentInfos.length === 0) return <div className="text-center p-8">{error || 'Erro ao carregar dados.'}</div>;

  return (
    <div className="min-h-screen bg-gray-200 py-8 print:py-0 print:bg-white flex flex-col items-center overflow-x-auto">
      <div className="min-w-[297mm] flex flex-col items-center">
        <div className="no-print mb-8 flex w-full items-center justify-between gap-4 rounded-lg bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Certificados prontos</p>
            <p className="mt-1 text-xs text-slate-500">{studentInfos.length} certificado(s), com frente e conteúdo programático no verso.</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex h-10 items-center gap-2 rounded-lg bg-teal-600 px-5 text-sm font-bold text-white transition-colors hover:bg-teal-700"
          >
            <Printer className="w-5 h-5" /> {studentInfos.length > 1 ? `Imprimir ${studentInfos.length} certificados` : 'Imprimir / Salvar PDF'}
          </button>
        </div>

        {studentInfos.map((studentInfo) => (
          <CertificatePages
            key={studentInfo.identifier}
            course={course}
            classesList={classesList}
            settings={settings}
            studentInfo={studentInfo}
          />
        ))}
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
