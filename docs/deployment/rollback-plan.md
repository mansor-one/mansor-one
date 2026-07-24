# Vercel Rollback Plan

Last updated: 2026-07-11

## Scope

This rollback plan covers Vercel application deployment rollback only. It does
not roll back database schema or data. No production SQL should be run as part
of a normal Vercel rollback.

## Rollback Triggers

Rollback immediately if:

- Login/session refresh fails for authenticated users.
- Financial pages render blank or throw server errors.
- Plaid token exchange or account sync fails broadly.
- Robototina or dashboard reads incorrect user context.
- A secret value appears in logs.
- A Production deployment accidentally exposes dev/test routes.

## Fast Rollback

1. In Vercel, open the project Deployments list.
2. Select the last known-good Production deployment.
3. Promote/rollback to that deployment using Vercel instant rollback.
4. Confirm `/login`, `/`, `/robototina`, `/portfolio`, `/spending`, and
   `/history` load for an authenticated user.
5. Check logs for continued errors.

## Environment Rollback

If the issue is environment configuration:

1. Do not change code first.
2. Restore the prior environment variable value in Vercel.
3. Redeploy the last known-good commit so the env change is applied.
4. Verify auth and provider integrations.

Never print or paste secret values into tickets, chat, or docs.

## Provider Rollback

### Supabase

- Restore previous Auth redirect URL settings if login/callback breaks.
- Do not rotate service role or JWT secrets during an incident unless the secret
  is suspected compromised.

### Google

- Restore previous authorized redirect URI if OAuth breaks.
- Revoke and rotate refresh tokens only if token exposure is suspected.

### Plaid

- Restore previous Plaid env/secret values if Link or sync fails.
- Do not rotate `PLAID_TOKEN_ENCRYPTION_KEY` casually; old encrypted tokens
  depend on it.

## Data Safety

Vercel rollback should not modify financial data. If a bad deployment caused
data writes:

1. Stop the active deployment by rolling back.
2. Preserve logs and request IDs.
3. Run a read-only audit first.
4. Prepare reviewable repair SQL.
5. Execute repair only after explicit approval.

## Communication Checklist

- State which deployment was rolled back from and to.
- State whether env vars changed.
- State whether any data writes occurred.
- State whether provider callbacks were changed.
- State follow-up fix owner and next validation step.
