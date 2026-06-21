-- Migration: add connection metadata to Plaid accounts
-- This is a safe schema migration that preserves existing rows.

ALTER TABLE IF EXISTS plaid_accounts
  ADD COLUMN IF NOT EXISTS connection_id uuid;

ALTER TABLE IF EXISTS plaid_accounts
  ADD COLUMN IF NOT EXISTS institution_name text;
