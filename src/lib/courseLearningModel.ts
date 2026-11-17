export type AttendanceStep = 'start' | 'middle' | 'end';

export interface LearningClass {
  id: number;
  title: string;
  date?: string | null;
  status: 'scheduled' | 'active' | 'completed' | string;
  type: 'online' | 'presential' | 'practical' | string;
  is_interactive?: boolean;
}

export interface LearningClassPerformance {
  id: number;
  attendance: {
    present: boolean;
    percentage?: number | null;
    completed_at?: string | null;
  } | null;
  evaluations?: Array<{ percentage?: number | null }>;
}

export type StudentClassState =
  | 'attendance-open'
  | 'completed'
  | 'recorded'
  | 'in-progress'
  | 'available'
  | 'upcoming'
  | 'missed';

export function deriveStudentClassState(
  classItem: LearningClass,
  performance?: LearningClassPerformance,
  attendanceStep: AttendanceStep | null = null,
): StudentClassState {
  if (attendanceStep) return 'attendance-open';

  const attendance = performance?.attendance;
  const percentage = Number(attendance?.percentage || 0);

  if (classItem.type === 'online' || classItem.is_interactive) {
    if (attendance?.completed_at || percentage >= 100) return 'completed';
    if (percentage > 0 || attendance?.present) return 'in-progress';
    if (classItem.status === 'active') return 'available';
    if (classItem.status === 'scheduled') return 'upcoming';
    return 'missed';
  }

  if (attendance?.present || percentage > 0) return 'recorded';
  if (classItem.status === 'completed') return 'missed';
  if (classItem.status === 'active') return 'available';
  return 'upcoming';
}

export function classStatePriority(state: StudentClassState): number {
  const priorities: Record<StudentClassState, number> = {
    'attendance-open': 0,
    'in-progress': 1,
    'available': 2,
    'upcoming': 3,
    'recorded': 4,
    'completed': 5,
    'missed': 6,
  };
  return priorities[state];
}

export function selectNextStudentClass<T extends LearningClass>(
  classes: T[],
  performanceByClass: Map<number, LearningClassPerformance>,
  attendanceStepByClass: Map<number, AttendanceStep | null>,
): T | null {
  const candidates = classes
    .map(classItem => ({
      classItem,
      state: deriveStudentClassState(
        classItem,
        performanceByClass.get(classItem.id),
        attendanceStepByClass.get(classItem.id) || null,
      ),
    }))
    .filter(item => ['attendance-open', 'in-progress', 'available', 'upcoming'].includes(item.state))
    .sort((a, b) => {
      const priority = classStatePriority(a.state) - classStatePriority(b.state);
      if (priority !== 0) return priority;
      const aDate = a.classItem.date ? new Date(a.classItem.date).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.classItem.date ? new Date(b.classItem.date).getTime() : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });

  return candidates[0]?.classItem || null;
}

export function summarizeClassProgress(
  classes: LearningClass[],
  performanceByClass: Map<number, LearningClassPerformance>,
) {
  let completed = 0;
  let progressTotal = 0;
  const evaluationScores: number[] = [];

  for (const classItem of classes) {
    const performance = performanceByClass.get(classItem.id);
    const state = deriveStudentClassState(classItem, performance);
    if (state === 'completed' || state === 'recorded') completed += 1;
    const percentage = Number(performance?.attendance?.percentage || 0);
    progressTotal += Math.max(0, Math.min(percentage, 100));
    for (const evaluation of performance?.evaluations || []) {
      if (evaluation.percentage != null) evaluationScores.push(Number(evaluation.percentage));
    }
  }

  return {
    completed,
    total: classes.length,
    progressPercentage: classes.length > 0 ? Math.round(progressTotal / classes.length) : 0,
    evaluationPercentage: evaluationScores.length > 0
      ? Math.round(evaluationScores.reduce((sum, score) => sum + score, 0) / evaluationScores.length)
      : null,
  };
}
