-- Metadata only; audio remains in the device's OPFS/IndexedDB.
-- auth is owned by Neon. This closed wrapper grants no table/admin privileges:
-- authenticated can read only its own verified JWT subject through the function.
CREATE FUNCTION public.pulso_account_uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT auth.uid() $$;
REVOKE ALL ON FUNCTION public.pulso_account_uid() FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.pulso_account_uid() TO authenticated;

CREATE TABLE public.pulso_account_library (
 user_id uuid PRIMARY KEY DEFAULT public.pulso_account_uid()
   REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
 document jsonb NOT NULL CHECK (
   jsonb_typeof(document)='object' AND document->>'version'='1'
   AND jsonb_typeof(document->'tracks')='array'
   AND jsonb_typeof(document->'playlists')='array'
   AND jsonb_array_length(document->'tracks')<=5000
   AND jsonb_array_length(document->'playlists')<=500
   AND octet_length(document::text)<=2097152),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pulso_account_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulso_account_library FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pulso_account_library FROM PUBLIC, anonymous;
GRANT SELECT,INSERT,UPDATE ON public.pulso_account_library TO authenticated;
CREATE POLICY own_account_library ON public.pulso_account_library FOR ALL TO authenticated
 USING (user_id=public.pulso_account_uid()) WITH CHECK (user_id=public.pulso_account_uid());
-- Same isolation rule as before, without requiring schema USAGE on Neon's auth.
ALTER TABLE public.pulso_account_preferences ALTER COLUMN user_id SET DEFAULT public.pulso_account_uid();
ALTER POLICY own_account_preferences ON public.pulso_account_preferences
 USING (user_id=public.pulso_account_uid()) WITH CHECK (user_id=public.pulso_account_uid());
