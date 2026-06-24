-- Migration 001: Initial schema for elegiscmon
-- Sistema de Certificação e Presença - Câmara Municipal de Ourilândia do Norte

-- Usuários do sistema (funcionários da CMON)
CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  matricula VARCHAR(20) UNIQUE NOT NULL,       -- Login: formato LLLLNNNNN (ex: CMON10010)
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  cpf VARCHAR(20),
  cargo VARCHAR(255),                          -- Cargo
  funcao_confianca VARCHAR(255),               -- Função de Confiança
  departamento VARCHAR(20),                    -- Sigla da Unidade (ex: CPDTI, GAB10)
  orgao VARCHAR(20),                           -- Sigla do Órgão (ex: CMON)
  data_nascimento DATE,
  rg VARCHAR(50),
  rg_orgao_expedidor VARCHAR(20),
  rg_uf VARCHAR(5),
  rg_data_expedicao DATE,
  status VARCHAR(20) DEFAULT 'Ativo',
  must_change_password BOOLEAN DEFAULT TRUE,   -- Forçar troca no primeiro login
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cursos
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  duration_hours INTEGER DEFAULT 0,
  owner_id INTEGER REFERENCES app_users(id),
  enrollment_open BOOLEAN NOT NULL DEFAULT TRUE,
  certificate_config JSONB,                    -- {text, signatures[]}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aulas (classes/sessions)
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  date TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed')),
  qr_duration_minutes INTEGER DEFAULT 10,
  qr_start_at BIGINT,                         -- Timestamp de ativação do QR início
  qr_middle_at BIGINT,                        -- Timestamp de ativação do QR meio
  qr_end_at BIGINT,                           -- Timestamp de ativação do QR fim
  owner_id INTEGER REFERENCES app_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cadastros prévios de alunos numa aula
CREATE TABLE IF NOT EXISTS registrations (
  id SERIAL PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  identifier VARCHAR(255) NOT NULL,            -- CPF ou email do participante
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  department VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, identifier)
);

-- Presenças (scan de QR code)
CREATE TABLE IF NOT EXISTS attendances (
  id SERIAL PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  identifier VARCHAR(255) NOT NULL,            -- CPF ou email do participante
  full_name VARCHAR(255),
  role VARCHAR(100),
  department VARCHAR(100),
  scan_start BIGINT,                           -- Timestamp do scan de entrada
  scan_middle BIGINT,                          -- Timestamp do scan do meio
  scan_end BIGINT,                             -- Timestamp do scan de saída
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, identifier)
);

-- Certificados emitidos
CREATE TABLE IF NOT EXISTS certificates (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  student_id VARCHAR(255) NOT NULL,            -- identifier do aluno
  student_name VARCHAR(255),
  course_title VARCHAR(255),
  points INTEGER DEFAULT 0,
  percentage INTEGER DEFAULT 0,
  token VARCHAR(20) UNIQUE NOT NULL,           -- Código de verificação
  issued_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings globais (chave-valor)
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_app_users_matricula ON app_users(matricula);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);

CREATE INDEX IF NOT EXISTS idx_courses_owner ON courses(owner_id);
CREATE INDEX IF NOT EXISTS idx_courses_created ON courses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_classes_course ON classes(course_id);
CREATE INDEX IF NOT EXISTS idx_classes_owner ON classes(owner_id);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status);
CREATE INDEX IF NOT EXISTS idx_classes_created ON classes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registrations_class ON registrations(class_id);
CREATE INDEX IF NOT EXISTS idx_registrations_identifier ON registrations(identifier);

CREATE INDEX IF NOT EXISTS idx_attendances_class ON attendances(class_id);
CREATE INDEX IF NOT EXISTS idx_attendances_identifier ON attendances(identifier);

CREATE INDEX IF NOT EXISTS idx_certificates_token ON certificates(token);
CREATE INDEX IF NOT EXISTS idx_certificates_course ON certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('global', '{"appName": "Câmara de Ourilândia do Norte", "logoUrl": ""}')
ON CONFLICT (key) DO NOTHING;
