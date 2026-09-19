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
- Expired companies enter a three-month suspended retention period. Users can
  sign in, reset passwords, read data, and export company backups, employee
  files, payroll sheets, WPS and GOSI reports. Every server-side write returns
  `402 SUBSCRIPTION_READ_ONLY`.
- The immutable developer `ADMIN` account is never blocked by a company trial.

## Expiry, retention, reminders, and deletion

- The lifecycle scheduler converts an expired trial or paid subscription to
  `SUSPENDED` and records both the suspension time and a deletion date three
  calendar months later.
- Active company-manager email addresses receive at most two renewal reminders
  per calendar month (one in each half of the month). Delivery slots are stored
  in PostgreSQL, so restarts cannot duplicate a reminder.
- Each reminder explains that the service is read-only, includes the scheduled
  deletion date, and asks the manager to contact the developer for renewal.
- Renewing the company as `ACTIVE` or `TRIAL` clears the suspension and
  deletion dates immediately.
- At the scheduled deadline, the server rechecks the status and date inside a
  database transaction before deleting tenant operational data, users that no
  longer belong to another company, and tenant data retained in application
  snapshots. Shared users keep access to their other companies.
- Infrastructure PostgreSQL backups remain governed by the separate backup
  retention policy and expire through its normal rotation.

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
