begin;

-- ATH evidence is read-only for authenticated household members. All evidence
-- ingestion and candidate decisions run through authenticated server routes.
revoke all on table public.ath_movil_emails from authenticated;
grant select on table public.ath_movil_emails to authenticated;

-- The service role never deletes or truncates ATH evidence. It only reads,
-- inserts newly imported evidence/candidates/state, and updates their status.
revoke all on table public.ath_movil_emails from service_role;
revoke all on table public.ath_movil_match_candidates from service_role;
revoke all on table public.gmail_evidence_sync_state from service_role;

grant select, insert, update on table public.ath_movil_emails to service_role;
grant select, insert, update on table public.ath_movil_match_candidates to service_role;
grant select, insert, update on table public.gmail_evidence_sync_state to service_role;

commit;

-- Rollback: there is no safe need to restore the previous broader privileges.
-- If application requirements change, add a reviewed migration granting only
-- the newly required operations.
