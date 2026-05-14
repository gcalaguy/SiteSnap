-- Add 'processing_ocr' to document_status enum
-- Note: enum ALTER in PostgreSQL requires adding a new value before use.
-- Existing rows will remain valid.

ALTER TYPE "document_status" ADD VALUE IF NOT EXISTS 'processing_ocr';
