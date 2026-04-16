-- Create table myassist.email_obligations

CREATE TABLE IF NOT EXISTS myassist.email_obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id TEXT NOT NULL,
    source_message_id TEXT NOT NULL,
    obligation_hash TEXT NOT NULL,
    title TEXT NOT NULL,
    due_date TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('open', 'done', 'invalid')),
    evidence TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    todoist_task_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for querying by thread or hash
CREATE INDEX IF NOT EXISTS idx_email_obligations_thread_id ON myassist.email_obligations (thread_id);
CREATE INDEX IF NOT EXISTS idx_email_obligations_hash ON myassist.email_obligations (obligation_hash);

-- Unique constraint to prevent duplicate obligations per thread
ALTER TABLE myassist.email_obligations
    ADD CONSTRAINT email_obligations_thread_hash_key UNIQUE (thread_id, obligation_hash);

-- RLS
ALTER TABLE myassist.email_obligations ENABLE ROW LEVEL SECURITY;

-- Note: Depending on your application's access model, you might need RLS policies here.
-- Assuming standard usage based on user_id, which isn't currently in the schema,
-- we leave it enabled but empty.
