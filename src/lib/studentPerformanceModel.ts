export interface PerformanceCourseSummary {
  overall: {
    total_classes: number;
    classes_attended: number;
    attendance_percentage: number;
    total_evaluations: number;
    average_evaluation_score: number | null;
    approved: boolean;
  };
}

export function summarizeStudentPerformance(courses: PerformanceCourseSummary[]) {
  const totalClasses = courses.reduce((sum, course) => sum + Number(course.overall.total_classes || 0), 0);
  const attendedClasses = courses.reduce((sum, course) => sum + Number(course.overall.classes_attended || 0), 0);
  const evaluationScores = courses
    .map(course => course.overall.average_evaluation_score)
    .filter((score): score is number => score != null);

  return {
    totalCourses: courses.length,
    approvedCourses: courses.filter(course => course.overall.approved).length,
    attendedClasses,
    totalClasses,
    attendancePercentage: totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0,
    totalEvaluations: courses.reduce((sum, course) => sum + Number(course.overall.total_evaluations || 0), 0),
    evaluationPercentage: evaluationScores.length > 0
      ? Math.round(evaluationScores.reduce((sum, score) => sum + score, 0) / evaluationScores.length)
      : null,
  };
}
