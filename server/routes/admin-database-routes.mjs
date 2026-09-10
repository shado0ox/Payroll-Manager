import express from 'express';
import { validatePayrollCarryForwardState } from '../payroll-carryforward-validation.mjs';
import { buildPayrollRepairPlan } from '../payroll-data-repair.mjs';

export function createAdminDatabaseRouter({
  auth,
  writeLimiter,
  pool,
  q,
  isDeveloperUser,
  asArray,
  readNormalizedApplicationState,
  readLockedNormalizedState,
  validatePayrollWorkflowChanges,
  workflowError,
  persistReconciledPayrollRun,
  appendPayrollFinancialAudit,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}) {
  const router = express.Router();

  router.get('/database/normalization-status', auth, async (req, res, next) => {
    try {
      if (req.user.role !== 'ADMIN') return res.status(403).json({ error:'FORBIDDEN' });
      const [status, duplicateNumbers, totals] = await Promise.all([
        pool.query(`SELECT * FROM ${q('normalization_status')}`),
        pool.query(`SELECT company_id,employee_no,count(*)::integer AS duplicate_count
          FROM ${q('employees')} WHERE is_archived=false AND employee_no <> '' AND company_id=ANY($1::text[])
          GROUP BY company_id,employee_no HAVING count(*) > 1 ORDER BY duplicate_count DESC,company_id,employee_no LIMIT 100`,
          [req.user.company_ids]),
        pool.query(`SELECT
          COALESCE(sum(total_net_salaries),0)::text AS table_net_total
          FROM ${q('payroll_runs')} WHERE company_id=ANY($1::text[])`, [req.user.company_ids]),
      ]);
      res.json({
        status: { counts_match:Boolean(status.rows[0]?.counts_match) },
        payrollTotals: totals.rows[0] || null,
        duplicateEmployeeNumbers: duplicateNumbers.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/payroll-data-repair/scan', auth, async (req, res, next) => {
    try {
      if (!isDeveloperUser(req.user)) return res.status(403).json({ error:'FORBIDDEN' });
      const stored = await readNormalizedApplicationState(pool);
      const plan = buildPayrollRepairPlan(stored,req.user.company_ids);
      res.json({ issues:plan.issues,scannedAt:new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/payroll-data-repair/repair', auth, writeLimiter, async (req, res, next) => {
    const client = await pool.connect();
    try {
      if (!isDeveloperUser(req.user)) return res.status(403).json({ error:'FORBIDDEN' });
      const issueIds = asArray(req.body?.issueIds).map(String);
      if (!issueIds.length || issueIds.length > 500 || issueIds.some(id => !/^payroll-run:[A-Za-z0-9._:-]+$/.test(id))) {
        return res.status(400).json({ error:'INVALID_REPAIR_SELECTION' });
      }
      if (issueIds.length !== new Set(issueIds).size) return res.status(400).json({ error:'DUPLICATE_REPAIR_SELECTION' });
      await client.query('BEGIN');
      const stored = await readLockedNormalizedState(client);
      const plan = buildPayrollRepairPlan(stored,req.user.company_ids);
      const repairedRuns = issueIds.map(id => plan.proposedRuns.get(id));
      if (repairedRuns.some(run => !run)) throw workflowError(409,'REPAIR_SELECTION_STALE_OR_LOCKED');
      const repairedById = new Map(repairedRuns.map(run => [run.id,run]));
      const nextRuns = asArray(stored.payrollRuns).map(run => repairedById.get(run.id) || run);
      validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
      validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
      for (const run of repairedRuns) await persistReconciledPayrollRun(client,run);
      const nextState = { ...stored,payrollRuns:nextRuns };
      await appendPayrollFinancialAudit(client,q,{ stored,next:nextState,user:req.user });
      const updated = await bumpStateVersion(client,req.user.id);
      const companyIds = [...new Set(repairedRuns.map(run => run.companyId))];
      await appendStateAudit(client,q,{ companyIds,user:req.user,action:'REPAIR_PAYROLL_DATA',version:updated.rows[0].version });
      await client.query('COMMIT');
      const remainingIssues = buildPayrollRepairPlan(nextState,req.user.company_ids).issues;
      broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
        companyIds,changes:[{ collection:'payrollRuns',operation:'upsert',records:repairedRuns }] });
      res.json({ repairedRuns,remainingIssues,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
        return res.status(error.status).json({ error:error.message });
      }
      next(error);
    } finally {
      client.release();
    }
  });

  return router;
}
