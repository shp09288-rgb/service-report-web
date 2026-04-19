-- ============================================================
-- Park Systems Service Report — v1 Schema
-- ============================================================

-- ── updated_at auto-maintenance ──────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── cards ────────────────────────────────────────────────────
CREATE TABLE cards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text        NOT NULL CHECK (type IN ('field_service', 'installation')),
  site        text        NOT NULL,
  equipment   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── documents ────────────────────────────────────────────────
CREATE TABLE documents (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id            uuid        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  report_date        date        NOT NULL,
  is_external        boolean     NOT NULL DEFAULT false,
  parent_document_id uuid        REFERENCES documents(id) ON DELETE SET NULL,
  content            jsonb       NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- external documents must point to their internal source
  CONSTRAINT external_requires_parent
    CHECK (is_external = false OR parent_document_id IS NOT NULL)
);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- one internal document per card per date
CREATE UNIQUE INDEX documents_internal_unique
  ON documents (card_id, report_date)
  WHERE is_external = false;

-- fast lookup of all documents for a card
CREATE INDEX documents_card_id_idx
  ON documents (card_id, report_date DESC);

-- fast lookup of external documents by their parent
CREATE INDEX documents_parent_idx
  ON documents (parent_document_id)
  WHERE parent_document_id IS NOT NULL;


-- ── gantt ────────────────────────────────────────────────────
-- one row per installation card; created on first save
CREATE TABLE gantt (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id    uuid        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  payload    jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER gantt_updated_at
  BEFORE UPDATE ON gantt
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- enforce one gantt row per card
CREATE UNIQUE INDEX gantt_card_unique
  ON gantt (card_id);


-- ── edit_locks ───────────────────────────────────────────────
-- one active lock per card at a time
CREATE TABLE edit_locks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid        NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
  user_name   text        NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

-- fast stale-lock cleanup queries
CREATE INDEX edit_locks_expires_at_idx
  ON edit_locks (expires_at);
