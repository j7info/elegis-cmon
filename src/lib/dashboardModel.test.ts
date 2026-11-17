import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectNextCourse,
  splitStudentCourses,
  summarizeStudentDashboard,
  type CoursePerformanceSummary,
  type DashboardCourse,
} from './dashboardModel.ts';

const courses: DashboardCourse[] = [
  { id: 1, enrollment_status: 'enrolled', pending_class_count: 2 },
  { id: 2, enrollment_status: 'available', pending_class_count: 0 },
  { id: 3, enrollment_status: 'enrolled', pending_class_count: 1 },
];

const performance: CoursePerformanceSummary[] = [
  {
    id: 1,
    overall: {
      total_classes: 3,
      classes_attended: 2,
      attendance_percentage: 67,
      total_evaluations: 1,
      average_evaluation_score: 80,
      approved: false,
    },
  },
  {
    id: 3,
    overall: {
      total_classes: 1,
      classes_attended: 1,
      attendance_percentage: 100,
      total_evaluations: 0,
      average_evaluation_score: null,
      approved: true,
    },
  },
];

test('separa cursos matriculados dos disponíveis sem alterar a lista original', () => {
  const result = splitStudentCourses(courses);

  assert.deepEqual(result.enrolled.map(course => course.id), [1, 3]);
  assert.deepEqual(result.available.map(course => course.id), [2]);
  assert.equal(courses.length, 3);
});

test('resume pendências, presença ponderada e desempenho com os dados existentes', () => {
  assert.deepEqual(summarizeStudentDashboard(courses, performance), {
    enrolledCourses: 2,
    availableCourses: 1,
    pendingClasses: 3,
    attendancePercentage: 75,
    performancePercentage: 80,
    approvedCourses: 1,
  });
});

test('não inventa desempenho quando ainda não existe avaliação', () => {
  const summary = summarizeStudentDashboard(courses, []);

  assert.equal(summary.attendancePercentage, 0);
  assert.equal(summary.performancePercentage, null);
});

test('prioriza o curso com mais aulas pendentes como próxima ação', () => {
  assert.equal(selectNextCourse(courses)?.id, 1);
});
