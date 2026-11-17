export type SystemProfile = 'ADMIN' | 'COORDENADOR' | 'PROFESSOR' | 'ALUNO';

const VALID_PROFILES = new Set<SystemProfile>([
  'ADMIN',
  'COORDENADOR',
  'PROFESSOR',
  'ALUNO',
]);

export function profilesForRole(systemRole: SystemProfile): SystemProfile[] {
  return systemRole === 'PROFESSOR' ? ['PROFESSOR', 'ALUNO'] : [systemRole];
}

export function normalizeAvailableProfiles(
  systemRole: SystemProfile,
  profiles?: unknown,
): SystemProfile[] {
  if (!Array.isArray(profiles)) return profilesForRole(systemRole);

  const normalized = Array.from(new Set(
    profiles.filter((profile): profile is SystemProfile => (
      typeof profile === 'string' && VALID_PROFILES.has(profile as SystemProfile)
    )),
  ));

  return normalized.length > 0 ? normalized : profilesForRole(systemRole);
}

export function resolveActiveProfile(
  systemRole: SystemProfile,
  availableProfiles: SystemProfile[],
  savedProfile?: string | null,
): SystemProfile {
  if (savedProfile && availableProfiles.includes(savedProfile as SystemProfile)) {
    return savedProfile as SystemProfile;
  }
  if (availableProfiles.includes(systemRole)) return systemRole;
  return availableProfiles[0] || systemRole;
}

export function canAlternateTeacherStudent(profiles: SystemProfile[]): boolean {
  return profiles.includes('PROFESSOR') && profiles.includes('ALUNO');
}
