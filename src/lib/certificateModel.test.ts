import assert from 'node:assert/strict';
import test from 'node:test';
import { groupCertificateClasses, summarizeCertificateEligibility } from './certificateModel.ts';

test('separa alunos aptos sem alterar o relatório original', () => {
  const students = [
    { identifier: '1', approved: true, percentage: 80 },
    { identifier: '2', approved: false, percentage: 60 },
    { identifier: '3', approved: true, percentage: 100 },
  ];

  assert.deepEqual(summarizeCertificateEligibility(students), {
    total: 3,
    approved: 2,
    pending: 1,
    approvedStudents: [students[0], students[2]],
  });
  assert.equal(students.length, 3);
});

test('agrupa o conteúdo principal e os subcursos no verso', () => {
  const grouped = groupCertificateClasses([
    { id: 1, title: 'Abertura', is_subcourse: false },
    { id: 2, title: 'E-mail', is_subcourse: true, course_title: 'Tecnologia' },
    { id: 3, title: 'Planilhas', is_subcourse: true, course_title: 'Tecnologia' },
    { id: 4, title: 'Atendimento', is_subcourse: true, course_title: 'Recursos Humanos' },
  ]);

  assert.deepEqual(grouped.map(group => [group.title, group.classes.map(item => item.id)]), [
    ['Conteúdo principal', [1]],
    ['Tecnologia', [2, 3]],
    ['Recursos Humanos', [4]],
  ]);
});
