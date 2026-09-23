# Current Capability Matrix

> Single source of truth for what the application can actually do.  
> A feature listed as “ready” still requires production credentials, operational configuration, and release-gate verification.

## Release labels

- **Ready**: implemented and covered by automated tests.
- **Conditional**: implemented but requires external credentials, market configuration, or operational acceptance.
- **Partial**: core flow exists, but one or more important states/workflows are not automated.
- **Reserved**: interface/scaffolding exists but the real provider is not connected.
- **Offline**: intentionally disabled or handled manually.

## Customer and commerce

| Capability                               | Status                 | Production note                                                                     |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| Catalog, categories, collections, search | Ready                  | External images must be replaced or licensed for the target market                  |
| Product variants and specification stock | Ready                  | Admin writes must retain concurrency protection after hardening                     |
| Logged-in cart                           | Ready                  | PostgreSQL-backed                                                                   |
| Guest cart                               | Conditional            | Browser localStorage; privacy-mode/device-loss limitations                          |
| Guest checkout                           | Conditional            | Requires a production payment channel and guest-order token regression gate         |
| Multi-currency display                   | Conditional            | Base currency is USD; production rate source and accounting policy must be selected |
| Coupon redemption                        | Conditional            | Currency snapshot and historical-row migration are release gates                    |
| Cash on delivery                         | Partial                | Offline collection/refund and an explicit commission-recognition event are required |
| Stripe Checkout                          | Conditional            | Real integration; secret, webhook, return URLs and amount/currency tests required   |
| Alipay / WeChat / Bankcard / PayPal      | Reserved               | Not ready to collect money in this release                                          |
| Mock payment                             | Offline for production | Local/demo only; production guards must remain enabled                              |
| Customer accounts and email verification | Ready                  | Production email delivery is conditional on SMTP/Resend                             |
| Password recovery                        | Conditional            | Admin-approved temporary password; mail delivery and manual fallback required       |
| Account export and deletion              | Conditional            | Privacy retention fields and post-deletion verification are release gates           |
| Refund approval                          | Conditional            | Idempotent refund state/outbox and gateway reconciliation are release gates         |
| Return / exchange                        | Offline                | Current policy directs customers to contact support before shipping goods back      |
| Carrier tracking API                     | Offline                | Shipping company and tracking number are entered manually                           |

## Administration and operations

| Capability                             | Status                 | Production note                                                                             |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| Product/category/order/user management | Ready                  | Role permissions and audit logs enabled                                                     |
| Refund and order operations            | Conditional            | Must use hardened status and refund state machines                                          |
| Payment-channel configuration          | Conditional            | Stripe only; secret storage and readiness checks required                                   |
| Email-channel configuration            | Conditional            | Runtime test mail is available, but durable business delivery is a release gate             |
| S3/R2/MinIO uploads                    | Conditional            | Server-side completion/size/type verification and production bucket policy required         |
| Local disk uploads                     | Offline for production | Development/demo only unless explicitly accepted for a single-instance deployment           |
| Redis rate limiting/cache              | Conditional            | Production password, multi-instance behavior and failure policy required                    |
| Audit log                              | Partial                | Critical state-changing operations are logged; durability/retention policy must be approved |
| Admin notifications                    | Conditional            | SUPPORT permissions and reliable delivery/outbox must be verified                           |
| Launch-readiness page                  | Conditional            | It supplements, but does not replace, external DNS/TLS/mail/payment acceptance tests        |
| Docker local demo                      | Ready                  | Uses mock payment, console mail, MinIO and seed data                                        |
| Production Compose                     | Conditional            | Requires strong secrets, real services, readiness and backup verification                   |

## Distribution module

| Capability                                | Status          | Production note                                                                              |
| ----------------------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| Signed referral attribution               | Ready           | HMAC-backed referral cookie                                                                  |
| Customer binding and relationship closure | Ready           | Database uniqueness and rebuild logic implemented                                            |
| Order attribution snapshot                | Ready           | Must remain immutable after order creation                                                   |
| Commission accrual and idempotency        | Conditional     | COD and refund-outbox correctness are release gates                                          |
| Settlement and reversal                   | Conditional     | Must not reverse money before gateway refund is confirmed                                    |
| Withdrawal request/review/mark-paid       | Partial         | Offline transfer only; automatic payout, KYC, tax and payout reconciliation are not included |
| Compliance configuration                  | Conditional     | Default maximum is three levels; market-specific legal review is mandatory                   |
| Reconciliation                            | Ready in design | Minute-level repair plus admin trigger; must pass crash/retry tests                          |

## Required production release gates

1. `typecheck`, lint, unit, integration, E2E and production build pass.
2. Empty database applies all Prisma migrations successfully with `migrate deploy`.
3. Final standalone Docker image starts and `/readyz` becomes healthy.
4. Production dependency audit has no high/critical vulnerabilities.
5. Real Stripe test-mode payment, duplicate webhook, partial/full refund, timeout and recovery pass.
6. SMTP/Resend and S3/R2 save, send/upload, failure and recovery are verified.
7. Backup is stored off-host and successfully restored into an empty database.
8. Seed administrator credentials are removed or changed.
9. Refund, payment, email, storage, cron and queue failures produce actionable alerts.
10. Privacy, retention, tax, distribution/KYC and asset licensing are signed off for the target market.
