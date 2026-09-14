-- Lock every table down with Row Level Security.
--
-- Hosted Postgres providers (e.g. Supabase) expose tables in the public schema through an
-- automatic REST API using a publicly shareable key. With RLS enabled and no policies,
-- those public roles can't read or write any rows.
--
-- The API is unaffected: it connects as the tables' owner, and RLS doesn't apply to owners
-- unless FORCE ROW LEVEL SECURITY is set. All authorization stays in the API's own code.
ALTER TABLE "User"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Board"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardMember"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Column"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ticket"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Belt and braces: where Supabase's public roles exist, remove their table privileges entirely.
-- (Guarded, because these roles don't exist in plain Postgres — local dev and CI.)
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END $$;
