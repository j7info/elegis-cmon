import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveStudentClassState,
  selectNextStudentClass,
  summarizeClassProgress,
  type LearningClass,
  type LearningClassPerformance,
} from './courseLearningModel.ts';

const onlineClass: LearningClass = { id: 1, title: 'Aula online', status: 'active', type: 'online', date: '2026-11-10T10:00:00Z' };
const presentialClass: LearningClass = { id: 2, title: 'Aula presencial', status: 'active', type: 'presential', date: '2026-11-11T10:00:00Z' };

test('presença aberta tem prioridade sobre qualquer outro estado', () => {
  assert.equal(deriveStudentClassState(presentialClass, undefined, 'start'), 'attendance-open');
});

test('aula online parcialmente vista continua em andamento', () => {
  const progress: LearningClassPerformance = { id: 1, attendance: { present: true, percentage: 45 } };
  assert.equal(deriveStudentClassState(onlineClass, progress), 'in-progress');
});

test('aula online só fica concluída quando chega a cem por cento ou possui conclusão', () => {
  const progress: LearningClassPerformance = { id: 1, attendance: { present: true, percentage: 100 } };
  assert.equal(deriveStudentClassState(onlineClass, progress), 'completed');
});

test('aula presencial encerrada sem registro aparece como não registrada', () => {
  assert.equal(deriveStudentClassState({ ...presentialClass, status: 'completed' }), 'missed');
});

test('seleciona chamada aberta antes de aula online em andamento', () => {
  const classes = [onlineClass, presentialClass];
  const performance = new Map<number, LearningClassPerformance>([
    [1, { id: 1, attendance: { present: true, percentage: 30 } }],
  ]);
  const steps = new Map<number, 'start' | null>([[2, 'start']]);
  assert.equal(selectNextStudentClass(classes, performance, steps)?.id, 2);
});

test('resume conclusão e média das avaliações apenas com registros existentes', () => {
  const classes = [onlineClass, presentialClass];
  const performance = new Map<number, LearningClassPerformance>([
    [1, { id: 1, attendance: { present: true, percentage: 100 }, evaluations: [{ percentage: 80 }] }],
    [2, { id: 2, attendance: { present: true, percentage: 70 }, evaluations: [{ percentage: 100 }] }],
  ]);
  assert.deepEqual(summarizeClassProgress(classes, performance), {
    completed: 2,
    total: 2,
    progressPercentage: 85,
    evaluationPercentage: 90,
  });
});
