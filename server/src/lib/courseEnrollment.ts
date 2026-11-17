interface EnrollmentCourse {
  enrollment_open: boolean;
  managed_by_user: boolean;
}

export interface EnrollmentBlock {
  status: number;
  error: string;
}

export function getEnrollmentBlock(course?: EnrollmentCourse): EnrollmentBlock | null {
  if (!course) return { status: 404, error: 'Curso não encontrado' };
  if (course.managed_by_user) {
    return { status: 409, error: 'Você não pode se inscrever em um curso que ministra' };
  }
  if (!course.enrollment_open) {
    return { status: 403, error: 'Inscrições indisponíveis para este curso' };
  }
  return null;
}
