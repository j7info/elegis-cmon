export type SystemProfile = 'ADMIN' | 'COORDENADOR' | 'PROFESSOR' | 'ALUNO';

const VALID_PROFILES = new Set<SystemProfile>([
  'ADMIN',
  'COORDENADOR',
  'PROFESSOR',
  'ALUNO',
]);

export function getAvailableProfiles(systemRole: string | null | undefined): SystemProfile[] {
  if (systemRole && VALID_PROFILES.has(systemRole as SystemProfile)) {
    const role = systemRole as SystemProfile;
    return role === 'ALUNO' ? ['ALUNO'] : [role, 'ALUNO'];
  }
  return ['ALUNO'];
}
