const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[character]);

export const subscriptionNoticeNumber = (suspendedAt, now = new Date()) => {
  const started = new Date(suspendedAt);
  const current = new Date(now);
  if (Number.isNaN(started.getTime()) || Number.isNaN(current.getTime()) || current < started) return 0;
  const half = current.getUTCDate() <= 15 ? 0 : 1;
  return current.getUTCFullYear() * 24 + current.getUTCMonth() * 2 + half;
};

export const scrubCompanyFromState = (rawState, companyId) => {
  const state = structuredClone(rawState || {});
  const removedActiveCompany = state.activeCompanyId === companyId;
  const companyScopedKeys = [
    'employees','attendance','leaves','loans','penalties','temporaryEarnings',
    'payrollRuns','payrollSettlements','journals','auditLogs',
  ];
  if (Array.isArray(state.companies)) state.companies = state.companies.filter(company => company?.id !== companyId);
  for (const key of companyScopedKeys) {
    if (Array.isArray(state[key])) state[key] = state[key].filter(record => record?.companyId !== companyId);
  }
  if (Array.isArray(state.users)) {
    state.users = state.users.map(user => ({
      ...user,
      companyIds:Array.isArray(user?.companyIds) ? user.companyIds.filter(id => id !== companyId) : [],
    })).filter(user => user.role === 'ADMIN' || user.companyIds.length > 0);
  }
  if (state.qoyodConfigsByCompany && typeof state.qoyodConfigsByCompany === 'object') {
    delete state.qoyodConfigsByCompany[companyId];
  }
  if (removedActiveCompany) {
    state.activeCompanyId = state.companies?.[0]?.id || '';
    delete state.qoyodConfig;
  }
  return state;
};

export function createSubscriptionLifecycleService({
  pool,
  q,
  resendApiKey,
  emailFrom,
  developerContactPhone,
  fetchImpl = fetch,
  logger = console,
  onStateChanged = async () => {},
}) {
  let runInProgress = false;

  const sendSuspensionNotice = async (company, recipients) => {
    if (!resendApiKey || !emailFrom || !recipients.length) return false;
    const deletionDate = new Date(company.deletion_scheduled_at).toLocaleDateString('ar-SA', {
      timeZone:'Asia/Riyadh',year:'numeric',month:'long',day:'numeric',
    });
    const companyName = company.name_ar || company.name_en || company.company_code;
    const response = await fetchImpl('https://api.resend.com/emails', {
      method:'POST',
      headers:{ Authorization:'Bearer ' + resendApiKey, 'Content-Type':'application/json' },
      body:JSON.stringify({
        from:emailFrom,
        to:recipients,
        subject:'مسار - انتهى اشتراك المنشأة - ' + companyName,
        html:'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px">'
          + '<h2 style="margin:0 0 12px;color:#92400e">انتهى اشتراك المنشأة</h2>'
          + '<p>تم تعليق الخدمات التشغيلية للمنشأة <strong>' + escapeHtml(companyName) + '</strong> ووضع الحساب في وضع القراءة والتصدير فقط.</p>'
          + '<p>يمكنكم تسجيل الدخول واسترجاع كلمة المرور وتنزيل نسخ البيانات والمسيرات والتقارير خلال فترة الاحتفاظ.</p>'
          + '<p style="padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px">سيتم حذف بيانات المنشأة من النظام بتاريخ <strong>' + escapeHtml(deletionDate) + '</strong> إذا لم يتم التجديد قبل هذا التاريخ.</p>'
          + '<p>يرجى التواصل لتجديد الاشتراك وإعادة تفعيل جميع الخدمات'
          + (developerContactPhone ? ': <strong dir="ltr">' + escapeHtml(developerContactPhone) + '</strong>' : '.')
          + '</p></div>',
      }),
    });
    if (!response.ok) throw new Error('SUBSCRIPTION_NOTICE_EMAIL_FAILED_' + response.status);
    return true;
  };

  const reserveAndSendNotices = async () => {
    if (!resendApiKey || !emailFrom) return;
    const [companies, managers] = await Promise.all([
      pool.query(`SELECT id,company_code,name_ar,name_en,subscription_suspended_at,deletion_scheduled_at
        FROM ${q('companies')} WHERE is_archived=false AND subscription_status='SUSPENDED'
          AND subscription_suspended_at IS NOT NULL AND deletion_scheduled_at > now()`),
      pool.query(`SELECT email,company_ids FROM ${q('users')}
        WHERE role='COMPANY_MANAGER' AND is_active=true AND btrim(email)<>''`),
    ]);
    for (const company of companies.rows) {
      const recipients = [...new Set(managers.rows
        .filter(user => Array.isArray(user.company_ids) && user.company_ids.includes(company.id))
        .map(user => String(user.email).trim().toLowerCase()))];
      if (!recipients.length) continue;
      const noticeNumber = subscriptionNoticeNumber(company.subscription_suspended_at);
      const eventKey = company.id + ':SUBSCRIPTION_SUSPENDED:' + noticeNumber;
      const reserved = await pool.query(
        `INSERT INTO ${q('subscription_notice_deliveries')} (event_key,company_id,notice_number,recipients)
          VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (event_key) DO NOTHING RETURNING event_key`,
        [eventKey,company.id,noticeNumber,JSON.stringify(recipients)],
      );
      if (!reserved.rowCount) continue;
      try {
        await sendSuspensionNotice(company, recipients);
      } catch (error) {
        await pool.query(`DELETE FROM ${q('subscription_notice_deliveries')} WHERE event_key=$1`, [eventKey]);
        throw error;
      }
    }
  };

  const scrubSnapshotTable = async (client, table, idColumn, companyId) => {
    const result = await client.query(`SELECT ${idColumn} AS snapshot_id,state FROM ${q(table)} FOR UPDATE`);
    for (const row of result.rows) {
      await client.query(`UPDATE ${q(table)} SET state=$1::jsonb WHERE ${idColumn}=$2`, [
        JSON.stringify(scrubCompanyFromState(row.state, companyId)),row.snapshot_id,
      ]);
    }
  };

  const purgeCompany = async company => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(`SELECT id,company_code FROM ${q('companies')}
        WHERE id=$1 AND is_archived=false AND subscription_status='SUSPENDED'
          AND deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= now()
        FOR UPDATE`, [company.id]);
      if (!locked.rowCount) {
        await client.query('ROLLBACK');
        return false;
      }
      const users = await client.query(`SELECT id,role,company_ids FROM ${q('users')} WHERE company_ids ? $1 FOR UPDATE`, [company.id]);
      const orphanUserIds = users.rows
        .filter(user => user.role !== 'ADMIN' && user.company_ids.filter(id => id !== company.id).length === 0)
        .map(user => user.id);

      await client.query(`DELETE FROM ${q('gosi_invoice_items')} WHERE invoice_id IN (SELECT id FROM ${q('gosi_invoices')} WHERE company_id=$1)`, [company.id]);
      await client.query(`DELETE FROM ${q('gosi_department_assignments')} WHERE company_id=$1`, [company.id]);
      await client.query(`DELETE FROM ${q('gosi_employee_assignments')} WHERE account_id IN (SELECT id FROM ${q('gosi_accounts')} WHERE company_id=$1)
        OR employee_id IN (SELECT id FROM ${q('employees')} WHERE company_id=$1)`, [company.id]);
      await client.query(`DELETE FROM ${q('gosi_invoices')} WHERE company_id=$1`, [company.id]);
      await client.query(`DELETE FROM ${q('gosi_accounts')} WHERE company_id=$1`, [company.id]);
      for (const table of ['payroll_settlements','attendance_records','leave_requests','loans','penalties','temporary_earnings']) {
        await client.query(`DELETE FROM ${q(table)} WHERE company_id=$1`, [company.id]);
      }
      await client.query(`DELETE FROM ${q('journal_batches')} WHERE company_id=$1`, [company.id]);
      await client.query(`DELETE FROM ${q('payroll_runs')} WHERE company_id=$1`, [company.id]);
      await client.query(`DELETE FROM ${q('employees')} WHERE company_id=$1`, [company.id]);
      for (const table of ['company_departments','cost_centers','company_bank_definitions','integration_configs','application_audit_logs','hr_lifecycle_alert_deliveries','subscription_notice_deliveries']) {
        await client.query(`DELETE FROM ${q(table)} WHERE company_id=$1`, [company.id]);
      }

      if (orphanUserIds.length) {
        await client.query(`DELETE FROM ${q('sessions')} WHERE user_id=ANY($1::text[])`, [orphanUserIds]);
        await client.query(`DELETE FROM ${q('password_reset_tokens')} WHERE user_id=ANY($1::text[])`, [orphanUserIds]);
        await client.query(`DELETE FROM ${q('audit_log')} WHERE user_id=ANY($1::text[])`, [orphanUserIds]);
      }
      await client.query(`UPDATE ${q('users')} SET company_ids=company_ids-$1,updated_at=now() WHERE company_ids ? $1`, [company.id]);
      if (orphanUserIds.length) await client.query(`DELETE FROM ${q('users')} WHERE id=ANY($1::text[])`, [orphanUserIds]);

      await scrubSnapshotTable(client,'app_state','id',company.id);
      await scrubSnapshotTable(client,'app_state_migration_backups','id',company.id);
      await scrubSnapshotTable(client,'app_state_restore_snapshots','id',company.id);
      await client.query(`DELETE FROM ${q('companies')} WHERE id=$1`, [company.id]);
      await client.query('COMMIT');
      logger.info?.('Subscription retention expired; company data purged', { companyId:company.id,companyCode:company.company_code });
      return true;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  };

  const run = async () => {
    if (runInProgress) return;
    runInProgress = true;
    let changed = false;
    try {
      const transitioned = await pool.query(`UPDATE ${q('companies')} SET
        subscription_status='SUSPENDED',
        subscription_suspended_at=COALESCE(subscription_suspended_at,now()),
        deletion_scheduled_at=COALESCE(deletion_scheduled_at,now()+interval '3 months'),
        updated_at=now()
        WHERE is_archived=false
          AND (
            subscription_status IN ('EXPIRED','SUSPENDED')
            OR (subscription_status='TRIAL' AND trial_ends_at IS NOT NULL AND trial_ends_at <= now())
            OR (subscription_status='ACTIVE' AND subscription_ends_at IS NOT NULL AND subscription_ends_at <= now())
          )
          AND (subscription_status<>'SUSPENDED' OR subscription_suspended_at IS NULL OR deletion_scheduled_at IS NULL)
        RETURNING id`);
      changed = transitioned.rowCount > 0;

      const due = await pool.query(`SELECT id,company_code FROM ${q('companies')}
        WHERE is_archived=false AND subscription_status='SUSPENDED'
          AND deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= now()`);
      for (const company of due.rows) changed = await purgeCompany(company) || changed;
      await reserveAndSendNotices();
      if (changed) await onStateChanged();
    } catch (error) {
      logger.error?.('Subscription lifecycle scheduler failed', error?.message || error);
    } finally {
      runInProgress = false;
    }
  };

  return { run,purgeCompany };
}
