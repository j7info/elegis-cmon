export type AttendanceStep = 'start' | 'middle' | 'end';

export interface PublicAttendanceClass {
  status?: string | null;
  type?: string | null;
  qr_duration_minutes?: number | null;
  qr_start_at?: number | string | null;
  qr_middle_at?: number | string | null;
  qr_end_at?: number | string | null;
}

export type AttendanceWindowState = {
  state: 'open' | 'inactive' | 'not-open' | 'expired' | 'invalid';
  message: string;
  expiresAt?: number;
};

const stepLabels: Record<AttendanceStep, string> = {
  start: 'Entrada',
  middle: 'Confirmação',
  end: 'Saída',
};

export function isAttendanceStep(step?: string): step is AttendanceStep {
  return step === 'start' || step === 'middle' || step === 'end';
}

export function getAttendanceStepLabel(step?: string) {
  return isAttendanceStep(step) ? stepLabels[step] : 'Presença';
}

export function getAttendanceSteps(type?: string | null): AttendanceStep[] {
  return type === 'practical' ? ['start', 'end'] : ['start', 'middle', 'end'];
}

export function evaluateAttendanceWindow(
  classData: PublicAttendanceClass,
  step: string | undefined,
  now = Date.now(),
): AttendanceWindowState {
  if (!isAttendanceStep(step) || (classData.type === 'practical' && step === 'middle')) {
    return { state: 'invalid', message: 'Esta etapa de presença não é válida para a aula.' };
  }
  if (classData.status !== 'active') {
    return { state: 'inactive', message: 'Esta aula não está ativa no momento.' };
  }

  const activeAt = Number(classData[`qr_${step}_at`] || 0);
  if (!activeAt || now < activeAt) {
    return { state: 'not-open', message: 'A janela de presença desta etapa ainda não foi aberta pelo professor.' };
  }

  const durationMinutes = Number(classData.qr_duration_minutes || 10);
  const expiresAt = activeAt + durationMinutes * 60 * 1000;
  if (now > expiresAt) {
    return { state: 'expired', message: 'O tempo para registrar presença nesta etapa terminou.' };
  }

  return { state: 'open', message: 'Janela de presença aberta.', expiresAt };
}

export function buildScanReturnPath(classId?: string, step?: string) {
  if (!classId || !isAttendanceStep(step)) return '';
  return `/s/${encodeURIComponent(classId)}/${step}`;
}

export function getSafePublicReturnPath(value?: string | null) {
  if (!value || !/^\/s\/[^/]+\/(start|middle|end)$/.test(value)) return '';
  return value;
}
