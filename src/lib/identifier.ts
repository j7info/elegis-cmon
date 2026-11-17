export function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  return trimmed.replace(/\D/g, '');
}

export function maskIdentifier(value?: string | null): string {
  if (!value) return 'Não informado';
  const trimmed = value.trim();

  if (trimmed.includes('@')) {
    const [local, domain] = trimmed.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
  }

  if (trimmed.length <= 4) return '***';
  return `${trimmed.slice(0, 4)}${'*'.repeat(Math.min(5, trimmed.length - 4))}`;
}
