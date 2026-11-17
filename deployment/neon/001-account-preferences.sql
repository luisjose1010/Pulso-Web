-- Application preferences only. Never store Telegram credentials or audio here.
CREATE TABLE public.pulso_account_preferences (
  user_id uuid PRIMARY KEY DEFAULT auth.uid()
    REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  telegram_phone text CHECK (telegram_phone IS NULL OR telegram_phone ~ '^\+[1-9][0-9]{5,14}$'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pulso_account_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_account_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pulso_account_preferences FROM PUBLIC, anonymous;
GRANT SELECT, INSERT, UPDATE ON public.pulso_account_preferences TO authenticated;
CREATE POLICY own_account_preferences ON public.pulso_account_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
