export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  return trimmed.replace(/\D/g, '');
}
