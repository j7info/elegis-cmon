// Mascara um identificador (CPF ou email) para exibição em tela, escondendo
// parte do conteúdo sensível. O valor completo continua disponível para
// exportações oficiais (ex.: PDF da lista de presença).
export function maskIdentifier(id: string | null | undefined): string {
  if (!id) return '';
  const value = String(id).trim();

  // Email: mantém 1ª letra do usuário e o domínio (ex.: j****@gmail.com)
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    if (!local) return value;
    const visible = local.slice(0, 1);
    return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }

  // CPF/somente dígitos: mostra os 3 primeiros e os 2 últimos (123.***.**​*-09)
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
  }

  // Fallback genérico: mantém os 2 primeiros e 2 últimos caracteres
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
}
