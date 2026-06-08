-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────
-- SkinAnalysis Table
-- ─────────────────────────────────────────────────────
CREATE TABLE skin_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  cloudinary_public_id TEXT,
  glow_score INTEGER NOT NULL CHECK (glow_score >= 0 AND glow_score <= 100),
  skin_type TEXT,
  concerns JSONB DEFAULT '[]'::jsonb,
  routine JSONB DEFAULT '{}'::jsonb,
  raw_api_response JSONB,
  face_maps JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_skin_analysis_user_created ON skin_analysis (user_id, created_at DESC);
CREATE INDEX idx_skin_analysis_created ON skin_analysis (created_at DESC);

-- ─────────────────────────────────────────────────────
-- Subscriptions Table
-- ─────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'starter', 'growth', 'pro')),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'pending')),
  dodo_subscription_id TEXT UNIQUE,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_plan ON subscriptions (user_id, plan);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);

-- ─────────────────────────────────────────────────────
-- Enable Row Level Security (RLS)
-- ─────────────────────────────────────────────────────

-- RLS for skin_analysis
ALTER TABLE skin_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own scans"
  ON skin_analysis FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own scans"
  ON skin_analysis FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS for subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own subscription"
  ON subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own subscription"
  ON subscriptions FOR UPDATE
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- Create updated_at trigger
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_skin_analysis_updated_at
  BEFORE UPDATE ON skin_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Phase 2 compatibility additions.
-- These ALTER statements are additive so existing Supabase projects can run them safely.
ALTER TABLE skin_analysis
  ADD COLUMN IF NOT EXISTS raw_response JSONB;

ALTER TABLE subscriptions
  ALTER COLUMN plan SET DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS scan_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scan_limit INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT;
