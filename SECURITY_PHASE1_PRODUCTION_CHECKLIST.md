# Phase 1 Manual Production Checklist

Do not deploy until every required item has an owner and result.

## Supabase manual action

- [ ] Manuel opens Supabase Dashboard → Authentication → Password Security.
- [ ] Enable **Leaked Password Protection**.
- [ ] Manuel records manual confirmation and date here: `____________`.

This setting must not be changed through application code.

## Environment

- [ ] Set exact `MANSOR_ALLOWED_ORIGINS` for production/custom domains.
- [ ] Set a non-empty `MANSOR_INTERNAL_ADMIN_EMAILS`; omit diagnostics entirely
      if they are not required.
- [ ] Confirm `NEXT_PUBLIC_APP_URL` and Vercel production URL match the public
      application origin.
- [ ] Confirm Google redirect URI exactly matches
      `/api/auth/google/callback`.
- [ ] Confirm no secret has a `NEXT_PUBLIC_` prefix.

## Anonymous and authorization

- [ ] Anonymous OAuth start returns 401.
- [ ] Household member/viewer OAuth start and Gmail import return 403.
- [ ] Active household owner can start OAuth and POST Gmail import.
- [ ] A user in another household cannot read or change the first household.
- [ ] `/imports` and `/lab` redirect anonymous users to login.

## OAuth negative cases

- [ ] Missing, altered, expired, replayed, and different-user state fail.
- [ ] Provider denial returns only a safe internal result.
- [ ] Successful callback consumes state and does not expose a code/token.

## Browser/CSP flows

- [ ] Login/logout/session refresh work.
- [ ] Plaid Link loads, connects, and closes without CSP console violations.
- [ ] Google OAuth leaves and returns to Mansor One successfully.
- [ ] Supabase HTTPS/Data API and WSS/Realtime calls are not blocked.
- [ ] No application page can be framed.

## Mutation CSRF

- [ ] Legitimate production UI mutations succeed.
- [ ] Foreign Origin and `Sec-Fetch-Site: cross-site` receive 403.
- [ ] Missing Origin receives 403 in production and preview.
- [ ] Cron daily sync still succeeds with exact bearer secret and fails without
      it.

## Functional regression

- [ ] Card create/update/payment confirmation.
- [ ] Obligation confirmation/correction/candidate rejection.
- [ ] Review Queue import, classification, and duplicate resolution.
- [ ] Plaid connect, transaction sync, retry, and revoke.
- [ ] Gmail ATH import remains idempotent.
- [ ] Dashboard, Cash Flow, Timeline, Portfolio, and history totals are
      unchanged.
