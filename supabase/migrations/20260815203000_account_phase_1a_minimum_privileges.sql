begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

-- Personal profile timestamps are presentation metadata. No financial table is
-- read or modified by this migration.
alter table public.household_members
  add column if not exists updated_at timestamptz not null default now();

-- households previously had table-wide UPDATE. Keep the existing row-level
-- can_write_household policy, but restrict authenticated writes to Phase 1A
-- presentation columns only.
revoke update on table public.households from authenticated;
grant update (name, updated_at) on table public.households to authenticated;

-- A signed-in user may edit only their own visible member name and timestamp.
-- Column grants prevent changes to role, active, household_id, auth_user_id,
-- id, created_at, or any future column unless explicitly granted later.
revoke update on table public.household_members from authenticated;
grant update (name, updated_at) on table public.household_members to authenticated;

drop policy if exists household_members_self_profile_update
  on public.household_members;
create policy household_members_self_profile_update
  on public.household_members
  for update
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    and active is true
    and (select private.is_household_member(household_id))
  )
  with check (
    auth_user_id = (select auth.uid())
    and active is true
    and (select private.is_household_member(household_id))
  );

commit;
