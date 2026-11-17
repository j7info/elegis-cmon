import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCourseOperation } from './courseManagementModel.ts';

test('resume a operação do curso sem alterar os registros recebidos', () => {
  const classes = [
    { status: 'active', type: 'presential' },
    { status: 'scheduled', type: 'online' },
    { status: 'completed', type: 'online' },
    { status: 'completed', type: 'practical' },
  ];

  assert.deepEqual(summarizeCourseOperation(classes, [{ id: 1 }], [{ id: 1 }, { id: 2 }], [{ id: 9 }]), {
    totalClasses: 4,
    activeClasses: 1,
    scheduledClasses: 1,
    completedClasses: 2,
    pendingStudents: 1,
    students: 2,
    subcourses: 1,
  });
  assert.equal(classes.length, 4);
});

test('retorna contadores zerados quando o curso ainda não possui operação', () => {
  assert.deepEqual(summarizeCourseOperation([], [], [], []), {
    totalClasses: 0,
    activeClasses: 0,
    scheduledClasses: 0,
    completedClasses: 0,
    pendingStudents: 0,
    students: 0,
    subcourses: 0,
  });
});
