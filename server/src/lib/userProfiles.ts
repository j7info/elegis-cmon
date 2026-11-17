export type SystemProfile = 'ADMIN' | 'COORDENADOR' | 'PROFESSOR' | 'ALUNO';

const VALID_PROFILES = new Set<SystemProfile>([
  'ADMIN',
  'COORDENADOR',
  'PROFESSOR',
  'ALUNO',
]);

export function getAvailableProfiles(systemRole: string | null | undefined): SystemProfile[] {
  if (systemRole === 'PROFESSOR') return ['PROFESSOR', 'ALUNO'];
  if (systemRole && VALID_PROFILES.has(systemRole as SystemProfile)) {
    return [systemRole as SystemProfile];
  }
  return ['ALUNO'];
}
