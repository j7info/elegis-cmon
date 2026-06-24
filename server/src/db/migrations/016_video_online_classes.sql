-- Suporte a aulas online em video do YouTube

ALTER TABLE classes ADD COLUMN IF NOT EXISTS online_content_type VARCHAR(20) NOT NULL DEFAULT 'slides'
  CHECK (online_content_type IN ('slides', 'video'));

ALTER TABLE classes ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS video_provider VARCHAR(20);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS video_id VARCHAR(64);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER;

ALTER TABLE class_online_progress ADD COLUMN IF NOT EXISTS max_video_position_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE class_online_progress ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER;
