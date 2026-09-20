import express from 'express';

export function createEmployeePortalRouter({ auth,pool,q }) {
  const router = express.Router();

  router.get('/employee-portal/me', auth, async (req,res,next) => {
    try {
      if (req.user.role !== 'EMPLOYEE') return res.status(403).json({ error:'EMPLOYEE_ROLE_REQUIRED' });
      if (!req.user.employee_id) return res.status(409).json({ error:'EMPLOYEE_PORTAL_NOT_LINKED' });
      const result = await pool.query(`SELECT
          e.id,e.company_id,e.employee_no,e.first_name_ar,e.last_name_ar,e.first_name_en,e.last_name_en,
          e.department,e.job_title,e.hire_date::text,e.status,e.payload,
          c.company_code,c.name_ar company_name_ar,c.name_en company_name_en,c.payload company_payload
        FROM ${q('employees')} e
        JOIN ${q('companies')} c ON c.id=e.company_id AND c.is_archived=false
        WHERE e.id=$1 AND e.company_id=ANY($2::text[]) AND e.is_archived=false
        LIMIT 1`, [req.user.employee_id,req.user.company_ids]);
      if (!result.rowCount) return res.status(404).json({ error:'EMPLOYEE_PORTAL_PROFILE_NOT_FOUND' });
      const row = result.rows[0];
      const employee = row.payload || {};
      const company = row.company_payload || {};
      res.json({
        profile:{
          id:row.id,
          employeeNo:row.employee_no,
          firstNameAr:row.first_name_ar,
          lastNameAr:row.last_name_ar,
          firstNameEn:row.first_name_en,
          lastNameEn:row.last_name_en,
          department:row.department,
          jobTitle:row.job_title,
          hireDate:row.hire_date,
          status:row.status,
          email:String(employee.email || req.user.email || ''),
          phone:String(employee.phone || req.user.phone || ''),
        },
        company:{
          id:row.company_id,
          companyCode:row.company_code,
          nameAr:row.company_name_ar,
          nameEn:row.company_name_en,
          logo:typeof company.logo === 'string' ? company.logo : undefined,
        },
        subscription:req.subscription || null,
      });
    } catch (error) { next(error); }
  });

  return router;
}
