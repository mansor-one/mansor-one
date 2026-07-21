-- Correct one uniquely identifiable Best Buy card whose credit limit was also
-- stored as its balance. The user confirmed the card is unused. Preserve every
-- other field, including due_day = 8, and do not create ledger activity.
with candidates as (
  select id
  from public.credit_cards
  where upper(name) = 'BEST BUY'
    and upper(coalesce(bank, '')) = 'CITI/SYNCHRONY'
    and balance = 3000
    and credit_limit = 3000
    and due_day = 8
    and is_active = true
), unique_candidate as (
  select id
  from candidates
  where (select count(*) from candidates) = 1
)
update public.credit_cards card
set balance = 0
from unique_candidate candidate
where card.id = candidate.id;
