// A credential belongs to a company, including users assigned to multiple companies.
// A shared unique index arbitrates concurrent writes across both account tables.
export async function migrateTenantCredentials({pool,q,schema}) {
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('tenant_credentials')} (
    company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE CASCADE,
    identifier text NOT NULL,account_group text NOT NULL,
    PRIMARY KEY(company_id,identifier)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('tenant_credential_memberships')} (
    company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE CASCADE,identifier text NOT NULL,account_type text NOT NULL,account_id text NOT NULL,account_group text NOT NULL,
    PRIMARY KEY(company_id,identifier,account_type,account_id)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tenant_credential_owner_idx ON ${q('tenant_credential_memberships')}(account_type,account_id)`);
  const credentials=`SELECT DISTINCT c.value company_id,lower(btrim(v.identifier)) identifier,'USER' account_type,u.id account_id,
      CASE WHEN u.employee_id IS NOT NULL THEN 'EMPLOYEE:'||u.employee_id ELSE 'USER:'||u.id END account_group
    FROM ${q('users')} u CROSS JOIN LATERAL jsonb_array_elements_text(u.company_ids) c(value)
    CROSS JOIN LATERAL (VALUES (u.username),(u.email)) v(identifier) WHERE btrim(v.identifier)<>''
    UNION
    SELECT DISTINCT p.company_id,lower(btrim(v.identifier)),'PORTAL',p.id,'EMPLOYEE:'||p.employee_id
    FROM ${q('employee_portal_accounts')} p CROSS JOIN LATERAL (VALUES(p.username),(p.email)) v(identifier)
    WHERE btrim(v.identifier)<>''`;
  const duplicates=await pool.query(`SELECT company_id,identifier FROM (${credentials}) identities GROUP BY company_id,identifier HAVING count(DISTINCT account_group)>1 LIMIT 1`);
  if(duplicates.rowCount)throw new Error('TENANT_CREDENTIAL_COLLISION: resolve duplicate sign-in identifiers within the same company before migration');
  await pool.query(`INSERT INTO ${q('tenant_credentials')} (company_id,identifier,account_group) SELECT DISTINCT company_id,identifier,account_group FROM (${credentials}) identities ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO ${q('tenant_credential_memberships')} ${credentials} ON CONFLICT DO NOTHING`);
  await pool.query(`CREATE OR REPLACE FUNCTION "${schema}".sync_tenant_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE kind text;companies jsonb;owner_group text;credential record;claimed integer;
    BEGIN
      kind:=CASE WHEN TG_TABLE_NAME='users' THEN 'USER' ELSE 'PORTAL' END;
      IF TG_OP<>'INSERT' THEN
        -- Lock existing claims before dropping memberships; mirrored employee/admin
        -- identities keep the claim until their final account is removed.
        PERFORM 1 FROM ${q('tenant_credentials')} claim JOIN ${q('tenant_credential_memberships')} member USING(company_id,identifier)
          WHERE member.account_type=kind AND member.account_id=OLD.id ORDER BY claim.company_id,claim.identifier FOR UPDATE OF claim;
        WITH removed AS (DELETE FROM ${q('tenant_credential_memberships')} WHERE account_type=kind AND account_id=OLD.id RETURNING company_id,identifier)
        DELETE FROM ${q('tenant_credentials')} claim USING removed
          WHERE claim.company_id=removed.company_id AND claim.identifier=removed.identifier
          AND NOT EXISTS (SELECT 1 FROM ${q('tenant_credential_memberships')} member WHERE member.company_id=claim.company_id AND member.identifier=claim.identifier
            AND NOT(member.account_type=kind AND member.account_id=OLD.id));
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF;
      companies:=CASE WHEN kind='USER' THEN to_jsonb(NEW)->'company_ids' ELSE jsonb_build_array(to_jsonb(NEW)->>'company_id') END;
      owner_group:=CASE WHEN to_jsonb(NEW)->>'employee_id' IS NOT NULL THEN 'EMPLOYEE:'||(to_jsonb(NEW)->>'employee_id') ELSE 'USER:'||NEW.id END;
      FOR credential IN SELECT DISTINCT company.value company_id,lower(btrim(value.identifier)) identifier
        FROM jsonb_array_elements_text(companies) company(value) CROSS JOIN LATERAL (VALUES(NEW.username),(NEW.email)) value(identifier)
        WHERE btrim(value.identifier)<>'' ORDER BY company_id,identifier LOOP
        INSERT INTO ${q('tenant_credentials')}(company_id,identifier,account_group) VALUES(credential.company_id,credential.identifier,owner_group)
          ON CONFLICT(company_id,identifier) DO UPDATE SET account_group=EXCLUDED.account_group
          WHERE ${q('tenant_credentials')}.account_group=EXCLUDED.account_group;
        GET DIAGNOSTICS claimed=ROW_COUNT;
        IF claimed=0 THEN RAISE EXCEPTION 'Tenant sign-in identifier already exists' USING ERRCODE='23505',CONSTRAINT='tenant_credentials_pkey'; END IF;
        INSERT INTO ${q('tenant_credential_memberships')}(company_id,identifier,account_type,account_id,account_group)
          VALUES(credential.company_id,credential.identifier,kind,NEW.id,owner_group);
      END LOOP;
      RETURN NEW;
    END $$`);
  for(const table of ['users','employee_portal_accounts']){
    await pool.query(`DROP TRIGGER IF EXISTS sync_tenant_credentials ON ${q(table)}`);
    await pool.query(`CREATE TRIGGER sync_tenant_credentials AFTER INSERT OR UPDATE OR DELETE ON ${q(table)} FOR EACH ROW EXECUTE FUNCTION "${schema}".sync_tenant_credentials()`);
  }
  await pool.query(`ALTER TABLE ${q('users')} DROP CONSTRAINT IF EXISTS users_username_key`);
  await pool.query(`ALTER TABLE ${q('employee_portal_accounts')} DROP CONSTRAINT IF EXISTS employee_portal_accounts_username_key`);
  for(const index of ['users_email_unique_idx','users_email_ci_unique','employee_portal_email_unique_idx'])await pool.query(`DROP INDEX IF EXISTS "${schema}".${index}`);
}
