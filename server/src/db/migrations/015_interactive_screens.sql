CREATE TABLE IF NOT EXISTS interactive_lessons (
  id         SERIAL PRIMARY KEY,
  class_id   INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  type       VARCHAR(10) NOT NULL CHECK (type IN ('react', 'html')),

  -- Abordagem React: definição completa da tela
  definition JSONB,

  -- Abordagem HTML: URL ou conteúdo inline
  html_url      VARCHAR(500),
  html_content  TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(class_id)  -- 1 interactive lesson por aula
);
