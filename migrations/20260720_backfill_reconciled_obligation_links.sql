update public.obligation_payment_links links
set reconciliation_status = 'reconciled',
    reconciled_at = coalesce(links.reconciled_at, links.linked_at)
from public.obligation_instances instances
where instances.id = links.obligation_instance_id
  and instances.status in ('confirmed', 'closed')
  and links.reconciliation_status = 'detected';
