export interface AdminUserSummaryInput {
  id: number;
  name?: string | null;
  email?: string | null;
  matricula?: string | null;
  cpf?: string | null;
  cargo?: string | null;
  departamento?: string | null;
  status?: string | null;
  system_role?: string | null;
  is_pre_registered?: boolean | null;
}

export function summarizeAdminUsers(users: AdminUserSummaryInput[]) {
  return users.reduce(
    (summary, user) => {
      summary.total += 1;
      if (user.status === 'Ativo') summary.active += 1;
      if (user.is_pre_registered) summary.pending += 1;
      if (user.system_role === 'ADMIN') summary.admins += 1;
      return summary;
    },
    { total: 0, active: 0, pending: 0, admins: 0 },
  );
}

export function filterAdminUsers(
  users: AdminUserSummaryInput[],
  search: string,
  role: string,
  status: string,
) {
  const term = search.trim().toLocaleLowerCase('pt-BR');

  return users.filter(user => {
    const searchable = [
      user.name,
      user.email,
      user.matricula,
      user.cpf,
      user.cargo,
      user.departamento,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('pt-BR');

    const matchesSearch = !term || searchable.includes(term);
    const matchesRole = role === 'TODOS' || (user.system_role || 'ALUNO') === role;
    const matchesStatus = status === 'TODOS'
      || (status === 'PENDENTE' ? Boolean(user.is_pre_registered) : user.status === status);

    return matchesSearch && matchesRole && matchesStatus;
  });
}
