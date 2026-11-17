export interface ManagedClass {
  status?: string | null;
  type?: string | null;
}

export function summarizeCourseOperation(
  classes: ManagedClass[],
  pendingStudents: unknown[],
  students: unknown[],
  subcourses: unknown[],
) {
  return {
    totalClasses: classes.length,
    activeClasses: classes.filter(classItem => classItem.status === 'active').length,
    scheduledClasses: classes.filter(classItem => classItem.status === 'scheduled').length,
    completedClasses: classes.filter(classItem => classItem.status === 'completed').length,
    pendingStudents: pendingStudents.length,
    students: students.length,
    subcourses: subcourses.length,
  };
}
