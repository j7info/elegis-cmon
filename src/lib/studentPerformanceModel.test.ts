import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeStudentPerformance } from './studentPerformanceModel.ts';

test('resume presença e avaliações sem inventar nota ausente', () => {
  const summary = summarizeStudentPerformance([
    { overall: { total_classes: 4, classes_attended: 3, attendance_percentage: 75, total_evaluations: 2, average_evaluation_score: 80, approved: true } },
    { overall: { total_classes: 2, classes_attended: 1, attendance_percentage: 50, total_evaluations: 0, average_evaluation_score: null, approved: false } },
  ]);

  assert.deepEqual(summary, {
    totalCourses: 2,
    approvedCourses: 1,
    attendedClasses: 4,
    totalClasses: 6,
    attendancePercentage: 67,
    totalEvaluations: 2,
    evaluationPercentage: 80,
  });
});

test('retorna estado vazio consistente', () => {
  assert.deepEqual(summarizeStudentPerformance([]), {
    totalCourses: 0,
    approvedCourses: 0,
    attendedClasses: 0,
    totalClasses: 0,
    attendancePercentage: 0,
    totalEvaluations: 0,
    evaluationPercentage: null,
  });
});
