-- Supabase Auth owns credentials; password_hash is optional for OAuth/magic-link-only users.
alter table myassist.app_users alter column password_hash drop not null;
