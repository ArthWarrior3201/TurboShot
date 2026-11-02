# Validation — Supabase/email code update

Backend tests cover Argon2id and legacy upgrades, encrypted storage, CAS conflicts, wrong-code failures and durable attempt limits, expiry, single use, replacement invalidation, password reset invalidation, duplicate emails, domain blocks, server-only env access, HTTP code redaction, relay delivery, posts/reactions/moderation, video uploads, recommendations and cleanup. Frontend tests cover source updating and the sign-in/code UI error transitions.

Local tests do not verify credentials, Google quotas/email delivery, deployed Supabase permissions or real Vercel Production environment settings. Complete the live steps in the backend SUPABASE-SETUP.md after applying SQL and configuring secrets.
