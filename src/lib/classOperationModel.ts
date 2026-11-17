export type AttendanceStep = 'start' | 'middle' | 'end';
export type AttendanceWindowState = 'waiting' | 'open' | 'expired';

export interface AttendanceRecord {
  scan_start?: number | string | null;
  scan_middle?: number | string | null;
  scan_end?: number | string | null;
}

export interface AttendanceStage {
  step: AttendanceStep;
  label: string;
  shortLabel: string;
  points: number;
  activeAt: number | null;
  state: AttendanceWindowState;
  confirmed: number;
}

function hasScan(value: unknown) {
  return value != null && Number(value) > 0;
}

export function getAttendanceWindowState(
  activeAt: unknown,
  durationMinutes: number,
  now = Date.now(),
): AttendanceWindowState {
  const startedAt = Number(activeAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return 'waiting';

  const durationMs = Math.max(1, Number(durationMinutes) || 1) * 60 * 1000;
  return now < startedAt + durationMs ? 'open' : 'expired';
}

export function buildAttendanceStages({
  isPractical,
  durationMinutes,
  points,
  activeAt,
  attendances,
  now = Date.now(),
}: {
  isPractical: boolean;
  durationMinutes: number;
  points: { start: number; middle: number; end: number };
  activeAt: { start?: unknown; middle?: unknown; end?: unknown };
  attendances: AttendanceRecord[];
  now?: number;
}): AttendanceStage[] {
  const definitions: Array<Pick<AttendanceStage, 'step' | 'label' | 'shortLabel' | 'points'>> = [
    { step: 'start', label: 'Entrada', shortLabel: 'Início', points: points.start },
    ...(!isPractical
      ? [{ step: 'middle' as const, label: 'Confirmação', shortLabel: 'Meio', points: points.middle }]
      : []),
    { step: 'end', label: 'Saída', shortLabel: 'Fim', points: points.end },
  ];

  return definitions.map(definition => {
    const startedAt = Number(activeAt[definition.step]);
    return {
      ...definition,
      activeAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null,
      state: getAttendanceWindowState(activeAt[definition.step], durationMinutes, now),
      confirmed: attendances.filter(attendance => hasScan(attendance[`scan_${definition.step}`])).length,
    };
  });
}

export function getNextAttendanceAction(stages: AttendanceStage[]) {
  const openStage = stages.find(stage => stage.state === 'open');
  if (openStage) return `Acompanhar ${openStage.label.toLocaleLowerCase('pt-BR')}`;

  const waitingStage = stages.find(stage => stage.state === 'waiting');
  if (waitingStage) return `Abrir QR de ${waitingStage.label.toLocaleLowerCase('pt-BR')}`;

  return 'Conferir registros e concluir a aula';
}
