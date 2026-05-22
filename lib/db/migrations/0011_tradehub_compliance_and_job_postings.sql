-- Add compliance_status to tradehub_profiles
ALTER TABLE tradehub_profiles
  ADD COLUMN IF NOT EXISTS compliance_status compliance_status NOT NULL DEFAULT 'compliant';

-- Create job_postings table
CREATE TABLE IF NOT EXISTS job_postings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  project_title TEXT NOT NULL,
  description TEXT NOT NULL,
  scope_of_work TEXT,
  budget_estimate TEXT,
  targeted_start_date DATE,
  location TEXT,
  province TEXT,
  trade TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create job_posting_applications table
CREATE TABLE IF NOT EXISTS job_posting_applications (
  id SERIAL PRIMARY KEY,
  job_posting_id INTEGER NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  applicant_id INTEGER NOT NULL REFERENCES users(id),
  applicant_profile_id INTEGER REFERENCES tradehub_profiles(id),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_company ON job_postings(company_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_posting_apps_job ON job_posting_applications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_job_posting_apps_applicant ON job_posting_applications(applicant_id);
