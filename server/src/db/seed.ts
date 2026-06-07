import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import pool from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse the CSV file from docs/pessoas (6).csv
function parseCSV(csvPath: string) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  
  // Header: Sigla do Órgão;Cargo;Função de Confiança;Sigla da Unidade;Nome;Data de Nascimento;CPF;E-mail;Matrícula;RG;Órgão Expedidor;UF;Data de Expedição;Status
  const header = lines[0].split(';');
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 9) continue;
    
    records.push({
      orgao: cols[0]?.trim() || '',
      cargo: cols[1]?.trim() || '',
      funcao_confianca: cols[2]?.trim() || '',
      departamento: cols[3]?.trim() || '',
      nome: cols[4]?.trim() || '',
      data_nascimento: cols[5]?.trim() || null,
      cpf: cols[6]?.trim() || '',
      email: cols[7]?.trim() || '',
      matricula: cols[8]?.trim() || '',
      rg: cols[9]?.trim() || '',
      rg_orgao_expedidor: cols[10]?.trim() || '',
      rg_uf: cols[11]?.trim() || '',
      rg_data_expedicao: cols[12]?.trim() || null,
      status: cols[13]?.trim() || 'Ativo',
    });
  }
  
  return records;
}

function parseDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  // Handle ISO format: 2006-01-27
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // Handle BR format: dd/mm/yyyy
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

async function seed() {
  const client = await pool.connect();
  
  try {
    // Find the CSV file
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const csvPath = path.join(projectRoot, 'docs', 'pessoas (6).csv');
    
    if (!fs.existsSync(csvPath)) {
      console.log('CSV file not found at:', csvPath);
      console.log('Creating default admin user only...');
      
      const defaultPassword = await bcrypt.hash('admin12345', 12);
      await client.query(`
        INSERT INTO app_users (matricula, password_hash, name, email, cargo, departamento, orgao, status, must_change_password)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (matricula) DO NOTHING
      `, ['CMON00001', defaultPassword, 'Administrador', 'admin@cmon.leg.br', 'Administrador', 'CPDTI', 'CMON', 'Ativo', true]);
      
      console.log('✓ Default admin created: CMON00001 / admin12345');
      return;
    }
    
    console.log('Parsing CSV:', csvPath);
    const records = parseCSV(csvPath);
    console.log(`Found ${records.length} records`);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const r of records) {
      if (!r.matricula || !r.nome) {
        skipped++;
        continue;
      }
      
      // Default password = matrícula em minúsculo
      const passwordHash = await bcrypt.hash(r.matricula.toLowerCase(), 12);
      
      try {
        await client.query(`
          INSERT INTO app_users (
            matricula, password_hash, name, email, cpf, cargo,
            funcao_confianca, departamento, orgao, data_nascimento,
            rg, rg_orgao_expedidor, rg_uf, rg_data_expedicao,
            status, must_change_password
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT (matricula) DO NOTHING
        `, [
          r.matricula,
          passwordHash,
          r.nome,
          r.email || null,
          r.cpf || null,
          r.cargo || null,
          r.funcao_confianca || null,
          r.departamento || null,
          r.orgao || null,
          parseDate(r.data_nascimento),
          r.rg || null,
          r.rg_orgao_expedidor || null,
          r.rg_uf || null,
          parseDate(r.rg_data_expedicao),
          r.status || 'Ativo',
          true
        ]);
        inserted++;
      } catch (err: any) {
        console.error(`  ✗ Error inserting ${r.matricula} (${r.nome}):`, err.message);
        skipped++;
      }
    }
    
    console.log(`✓ Seed complete: ${inserted} inserted, ${skipped} skipped`);
    console.log('Login: use matrícula (ex: CMON10010) com senha = matrícula em minúsculo (ex: cmon10010)');
    
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
