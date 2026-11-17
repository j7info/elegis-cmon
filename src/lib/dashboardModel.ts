export interface DashboardCourse {
  id: number;
  enrollment_status?: string;
  pending_class_count?: number | string | null;
  latest_pending_class?: {
    id: number;
    title: string;
    date?: string | null;
    type?: string;
    online_content_type?: string | null;
  } | null;
}

export interface CoursePerformanceSummary {
  id: number;
  overall: {
    total_classes: number;
    classes_attended: number;
    attendance_percentage: number;
    total_evaluations: number;
    average_evaluation_score: number | null;
    approved: boolean;
  };
}

export interface StudentDashboardSummary {
  enrolledCourses: number;
  availableCourses: number;
  pendingClasses: number;
  attendancePercentage: number;
  performancePercentage: number | null;
  approvedCourses: number;
}

export function splitStudentCourses<T extends DashboardCourse>(courses: T[]) {
  return {
    enrolled: courses.filter(course => course.enrollment_status !== 'available'),
    available: courses.filter(course => course.enrollment_status === 'available'),
  };
}

export function mapPerformanceByCourse(performance: CoursePerformanceSummary[]) {
  return new Map(performance.map(course => [course.id, course]));
}

export function summarizeStudentDashboard(
  courses: DashboardCourse[],
  performance: CoursePerformanceSummary[],
): StudentDashboardSummary {
  const { enrolled, available } = splitStudentCourses(courses);
  const totals = performance.reduce(
    (acc, course) => {
      acc.totalClasses += Number(course.overall.total_classes || 0);
      acc.attendedClasses += Number(course.overall.classes_attended || 0);
      if (course.overall.average_evaluation_score != null) {
        acc.evaluationSum += course.overall.average_evaluation_score;
        acc.evaluationCourses += 1;
      }
      if (course.overall.approved) acc.approvedCourses += 1;
      return acc;
    },
    {
      totalClasses: 0,
      attendedClasses: 0,
      evaluationSum: 0,
      evaluationCourses: 0,
      approvedCourses: 0,
    },
  );

  return {
    enrolledCourses: enrolled.length,
    availableCourses: available.length,
    pendingClasses: enrolled.reduce(
      (sum, course) => sum + Number(course.pending_class_count || 0),
      0,
    ),
    attendancePercentage: totals.totalClasses > 0
      ? Math.round((totals.attendedClasses / totals.totalClasses) * 100)
      : 0,
    performancePercentage: totals.evaluationCourses > 0
      ? Math.round(totals.evaluationSum / totals.evaluationCourses)
      : null,
    approvedCourses: totals.approvedCourses,
  };
}

export function selectNextCourse<T extends DashboardCourse>(courses: T[]): T | null {
  const enrolledWithPending = courses
    .filter(course => course.enrollment_status !== 'available' && Number(course.pending_class_count || 0) > 0)
    .sort((a, b) => {
      const pendingDifference = Number(b.pending_class_count || 0) - Number(a.pending_class_count || 0);
      if (pendingDifference !== 0) return pendingDifference;

      const aDate = a.latest_pending_class?.date ? new Date(a.latest_pending_class.date).getTime() : 0;
      const bDate = b.latest_pending_class?.date ? new Date(b.latest_pending_class.date).getTime() : 0;
      return bDate - aDate;
    });

  if (enrolledWithPending.length > 0) return enrolledWithPending[0];
  return courses.find(course => course.enrollment_status !== 'available') ?? null;
}
