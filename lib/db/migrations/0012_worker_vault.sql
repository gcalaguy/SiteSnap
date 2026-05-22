-- Worker Compliance & Document Vault
CREATE TABLE IF NOT EXISTS worker_documents (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_path TEXT,
  expiration_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_docs_worker ON worker_documents(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_docs_company ON worker_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_worker_docs_type ON worker_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_worker_docs_status ON worker_documents(status);
