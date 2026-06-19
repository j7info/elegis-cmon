export interface CellInfo {
  title: string;
  description: string;
  highlight?: boolean;
}

export interface GridCell {
  row: number;
  col: number;
  value: string;
  info: CellInfo;
}

export const DEFINITION = {
  id: 'excel-basico',
  title: 'Introdução ao Excel — Planilha Interativa',
  type: 'grid' as const,
  columns: ['Nome', 'Cargo', 'Depto', 'Salário', 'Bônus', 'Total'],
  rows: [
    [
      { value: 'João', info: { title: 'João Silva', description: 'Funcionário do setor administrativo' } },
      { value: 'Analista', info: { title: 'Cargo', description: 'Cargo efetivo, nível III' } },
      { value: 'CPDTI', info: { title: 'Departamento', description: 'Coordenação de TI' } },
      { value: 'R$ 5.000', info: { title: 'Salário Base', description: 'Valor sem acréscimos' } },
      { value: 'R$ 500', info: { title: 'Bônus', description: 'Bônus por produtividade' } },
      { value: 'R$ 5.500', info: { title: 'Total', description: 'Salário + Bônus = R$ 5.500,00' } },
    ],
    [
      { value: 'Maria', info: { title: 'Maria Souza', description: 'Líder de equipe' } },
      { value: 'Gerente', info: { title: 'Cargo', description: 'Gerente Administrativa' } },
      { value: 'GAB10', info: { title: 'Departamento', description: 'Gabinete' } },
      { value: 'R$ 8.000', info: { title: 'Salário Base', description: 'Valor sem acréscimos' } },
      { value: 'R$ 1.000', info: { title: 'Bônus', description: 'Bônus por produtividade' } },
      { value: 'R$ 9.000', info: { title: 'Total', description: 'Salário + Bônus = R$ 9.000,00' } },
    ]
  ],
};
