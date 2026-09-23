# Commercial Delivery Runbook

This runbook separates the zero-external-service demo from a production deployment. Completing the demo does not mean the store is ready to collect money.

## 1. Choose the deployment mode

### Local demonstration

Use the local Compose override. It starts PostgreSQL, Redis, MinIO and the app with seed data, mock payment and console mail.

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

The seed credentials are public demo credentials and must never be exposed to the public internet.

### Production

1. Copy `.env.example` to a secrets-managed environment.
2. Set strong independent values for database/Redis credentials, both JWT secrets and `PAYMENT_CHANNEL_ENC_KEY`.
3. Set the real HTTPS `SITE_URL`, `SITE_NAME` and `MAIL_FROM`.
4. Configure a supported production payment channel. Stripe is the only real provider currently implemented.
5. Configure SMTP or Resend and verify SPF/DKIM delivery.
6. Configure S3/R2/MinIO and a stable public/CDN base URL.
7. Configure Sentry, log collection and alerts.
8. Run the production preflight before starting the public deployment.

## 2. Production environment baseline

The following must be true:

- `NODE_ENV=production`
- `REQUIRE_STRONG_SECRETS=true`
- `ALLOW_MOCK_PAYMENT_IN_PROD=false`
- Redis is enabled and authenticated for multi-instance deployments.
- Storage is a real object store; local disk is not accepted unless the operator explicitly accepts a single-instance risk.
- The application port is reachable only through a trusted reverse proxy or platform ingress.
- The reverse proxy overwrites forwarded-IP headers.
- TLS certificates and DNS are valid outside the application container.
- `SITE_URL` and all generated links use the public HTTPS origin.

## 3. Database migrations

Production schema changes must use versioned migrations:

```bash
npx prisma migrate deploy
```

Never use `prisma db push` against production. Run migrations as a controlled release step, not independently from every application replica.

The release pipeline must prove that an empty database can apply every migration and that the resulting schema matches the application model.

## 4. Release verification

Run the repository quality gates in the documented order. Database tests must fail closed unless the connection string names a dedicated test database.

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm audit --omit=dev --audit-level=high
npm run preflight
```

Then execute Playwright E2E against a disposable database and execute a final Docker image smoke test.

Do not treat historical CHANGELOG entries as current evidence. Release evidence must come from the commit being deployed.

## 5. Payment acceptance

For every real payment channel, verify:

1. Session creation and redirect URL.
2. Guest and logged-in order return paths.
3. Payment amount and currency checks.
4. Duplicate and out-of-order webhook delivery.
5. Gateway timeout after a successful charge.
6. Partial and full refund.
7. Refund timeout and retry without double refund.
8. Webhook failure alerts and scheduled reconciliation.
9. Production prohibition of mock payment.

If the target market is mainland China, Stripe is not sufficient because it does not support CNY; a real Alipay/WeChat implementation and the required merchant qualifications are separate release gates.

## 6. Email acceptance

Email configuration is not proven by “save succeeded”. Send a real test message and verify:

- correct SPF/DKIM domain;
- correct From address;
- inbox placement and bounce handling;
- password-reset delivery;
- paid, shipped, refunded and distribution messages;
- retry and operator-visible failure state.

Do not place temporary passwords only in logs. The admin approval response may provide a controlled manual fallback, but it must be handled as sensitive data.

## 7. Storage acceptance

For S3/R2/MinIO verify:

- bucket and CORS configuration;
- public URL or CDN delivery;
- presigned upload completion;
- server-side file size and real image-type validation;
- deletion of invalid/orphan objects;
- bucket lifecycle and cost controls;
- backup/versioning policy for product assets.

## 8. Backups and recovery

A backup command is not a backup strategy. Production requires:

- encrypted database backups;
- off-site/object-storage retention;
- a documented retention period;
- regular automated restore tests into an empty database;
- recorded recovery time and recovery point objectives;
- protection for uploaded assets and encryption-key material.

Store encryption keys separately from database backups. Losing the channel-encryption key makes stored payment/mail secrets unreadable.

## 9. Monitoring and alerts

At minimum alert on:

- readiness failures;
- payment webhook signature/amount mismatches;
- refund gateway failures and retry backlog;
- email delivery failures;
- upload completion failures;
- scheduler last-success age;
- negative distributor balances;
- failed distribution reconciliation;
- database/Redis/S3 health;
- disk and backup age.

Logs must redact session cookies, CSRF values, guest-order tokens, reset tokens, encryption keys and payment secrets.

## 10. Incident playbooks

### Payment succeeds but the order remains unpaid

1. Preserve the gateway event ID and order number.
2. Check webhook delivery and signature configuration.
3. Run the reconciliation job.
4. Do not manually mark an order paid unless an audited offline-payment procedure applies.

### Refund succeeded at the gateway but the local order is inconsistent

1. Do not retry blindly.
2. Query the provider using the recorded refund/idempotency key.
3. Reconcile the local refund state from the gateway result.
4. Re-run distribution reversal only after the refund is confirmed.

### Email provider is unavailable

1. Keep the durable outbox entry pending.
2. Alert operators and retry with backoff.
3. Use the approved manual fallback only for time-critical account-recovery operations.

### Database restore

1. Stop writes.
2. Restore into an isolated database.
3. Run schema and row-count validation.
4. Reconcile payments, refunds and distribution ledgers.
5. Repoint the application only after validation passes.

## 11. Go-live approval

The release owner should attach evidence for:

- all code gates;
- real payment acceptance;
- real email and storage acceptance;
- readiness and monitoring alerts;
- backup restore;
- privacy/retention review;
- distribution/KYC/tax review;
- target-market legal review;
- commercial asset licenses.

See `docs/CURRENT_CAPABILITY_MATRIX.md` for the feature-by-feature release status and `NOTICE.md` for source/asset licensing boundaries.
