-- Allow authenticated app screens to resolve owner labels for manual accounts,
-- credit cards, funds, and related household records.

grant select on public.people to authenticated;

alter table public.people enable row level security;

drop policy if exists people_select_authenticated on public.people;
create policy people_select_authenticated
  on public.people
  for select
  to authenticated
  using (true);
