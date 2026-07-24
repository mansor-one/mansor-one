-- Pending-settlement payment corrections and explicit reconciliation decisions.
-- This migration is intentionally data-neutral: it adds no backfill and does not
-- alter historical obligation instances.

alter table public.obligation_payment_links
  add column if not exists reported_amount numeric;

alter table public.obligation_payment_links
  drop constraint if exists obligation_payment_links_reported_amount_positive;

alter table public.obligation_payment_links
  add constraint obligation_payment_links_reported_amount_positive
  check (reported_amount is null or reported_amount > 0);

comment on column public.obligation_payment_links.reported_amount is
  'Actual amount reported for this payment lifecycle. Kept separate from the obligation default and historical instance amount.';

alter table public.obligation_reconciliation_events
  drop constraint if exists obligation_reconciliation_events_type_known;

alter table public.obligation_reconciliation_events
  add constraint obligation_reconciliation_events_type_known
  check (event_type in (
    'payment_detected',
    'manual_confirmation',
    'manual_correction',
    'auto_reconciled',
    'manual_reconciled',
    'rejected'
  ));

-- Rollback consideration: remove manual_correction events before restoring the
-- previous event-type check. Dropping reported_amount would discard correction
-- history, so export it first if rollback is required after production use.
