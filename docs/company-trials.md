# Company registration and trial subscriptions

Masar can accept public company registrations after email ownership is verified.
New companies receive an isolated company ID, a generated six-digit company
code, a company-manager account, and a configurable trial period (14 days by
default).

## Required environment variables

```env
ALLOW_PUBLIC_REGISTRATION=true
TRIAL_DAYS=14
DEVELOPER_CONTACT_PHONE=+9665XXXXXXXX
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=Masar <no-reply@your-domain.example>
```

Verify the sending domain in Resend before enabling registration. Never commit
the API key to Git. If the email service is not configured, the registration
button stays hidden.

## Security controls

- The email verification code expires after 15 minutes.
- A request is locked after five incorrect code attempts.
- Registration and verification are rate limited per source IP.
- Passwords are hashed before temporary registration data is stored.
- Usernames and verified email addresses are unique.
- Company managers only receive access to their own company ID.
- Expired companies may load the subscription screen, but server-side writes
  and service endpoints return `402 SUBSCRIPTION_EXPIRED`.
- The immutable developer `ADMIN` account is never blocked by a company trial.

## Renewing a company

The developer account opens **Companies & Establishments**, finds the company,
and uses **Manage & renew** to choose Active and an end date. A one-year renewal
shortcut is available. The server broadcasts the change to connected sessions.

## Tenant privacy

The developer account receives only tenant registration and subscription
metadata. PostgreSQL-backed API filtering prevents it from receiving tenant
employees, payroll runs, attendance, loans, penalties, journals, audit history,
banking configuration, or tenant users. Tenant companies cannot be selected in
the developer's normal company switcher. Subscription renewal uses a dedicated
metadata-only endpoint and does not grant access to tenant operational data.

For emergency recovery, the equivalent SQL is:

```sql
UPDATE masar_payroll.companies
SET subscription_status='ACTIVE',
    subscription_ends_at='2027-08-28 23:59:59+03',
    updated_at=now()
WHERE company_code='COMPANY_CODE';
```

After direct SQL recovery, refresh the expired company's browser session.
