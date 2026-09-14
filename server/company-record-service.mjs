export function createCompanyRecordService({ q,asArray,clone,subscriptionState,workflowError }) {
  function validateCompanyRecord(record, user, requireAssigned = true) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id
      || record.id.length > 100 || typeof record.companyCode !== 'string' || !record.companyCode.trim() || record.companyCode.length > 50
      || typeof record.nameAr !== 'string' || !record.nameAr.trim() || record.nameAr.length > 300
      || (record.nameEn != null && (typeof record.nameEn !== 'string' || record.nameEn.length > 300))) {
      throw workflowError(400, 'INVALID_COMPANY');
    }
    if (requireAssigned && !user.company_ids.includes(record.id)) throw workflowError(403, 'FORBIDDEN');
    const departments = asArray(record.departments);
    const costCenters = asArray(record.costCenters);
    const bankDefinitions = asArray(record.bankDefinitions);
    if (departments.length > 1_000 || costCenters.length > 1_000 || bankDefinitions.length > 100) {
      throw workflowError(400, 'INVALID_COMPANY_COLLECTION_SIZE');
    }
    const validChild = item => item && typeof item === 'object' && typeof item.id === 'string' && item.id;
    if (departments.some(item => !validChild(item)) || costCenters.some(item => !validChild(item))) {
      throw workflowError(400, 'INVALID_COMPANY_STRUCTURE');
    }
    const departmentIds = new Set(departments.map(item => item.id));
    const costCenterIds = new Set(costCenters.map(item => item.id));
    if (departmentIds.size !== departments.length || costCenterIds.size !== costCenters.length) {
      throw workflowError(409, 'DUPLICATE_COMPANY_STRUCTURE_ID');
    }
    const bankCodes = new Set();
    for (const bank of bankDefinitions) {
      const code = String(bank?.ibanBankCode || '').trim();
      const swift = String(bank?.swiftCode || '').trim().toUpperCase();
      if (!/^\d{2}$/.test(code) || !String(bank?.nameAr || '').trim()
        || !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(swift) || bankCodes.has(code)) {
        throw workflowError(400, 'INVALID_COMPANY_BANK_DEFINITION');
      }
      bankCodes.add(code);
    }
  }

  async function updateCompanyAggregate(client, record) {
    const existing = await client.query(`SELECT id,subscription_status,trial_ends_at,subscription_ends_at
      FROM ${q('companies')} WHERE id=$1 AND is_archived=false FOR UPDATE`, [record.id]);
    if (!existing.rowCount) throw workflowError(404, 'COMPANY_NOT_FOUND');
    const payload = clone(record);
    delete payload.departments;
    delete payload.costCenters;
    delete payload.bankDefinitions;
    delete payload.subscriptionStatus;
    delete payload.trialEndsAt;
    delete payload.subscriptionEndsAt;
    await client.query(`UPDATE ${q('companies')} SET company_code=$2,name_ar=$3,name_en=$4,payload=$5::jsonb,updated_at=now()
      WHERE id=$1`, [record.id,record.companyCode.trim(),record.nameAr.trim(),String(record.nameEn || ''),JSON.stringify(payload)]);

    await client.query(`DELETE FROM ${q('company_departments')} WHERE company_id=$1`, [record.id]);
    await client.query(`DELETE FROM ${q('cost_centers')} WHERE company_id=$1`, [record.id]);
    await client.query(`DELETE FROM ${q('company_bank_definitions')} WHERE company_id=$1`, [record.id]);
    await client.query(`INSERT INTO ${q('company_departments')} (company_id,id,code,name_ar,name_en,payload,sort_order)
      SELECT $1,department->>'id',COALESCE(department->>'code',''),COALESCE(department->>'nameAr',''),
        COALESCE(department->>'nameEn',''),department,(ordinality - 1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(department,ordinality)`, [record.id,JSON.stringify(asArray(record.departments))]);
    await client.query(`INSERT INTO ${q('cost_centers')} (company_id,id,code,name_ar,name_en,payload,sort_order)
      SELECT $1,center->>'id',COALESCE(center->>'code',''),COALESCE(center->>'nameAr',''),
        COALESCE(center->>'nameEn',''),center,(ordinality - 1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(center,ordinality)`, [record.id,JSON.stringify(asArray(record.costCenters))]);
    await client.query(`INSERT INTO ${q('company_bank_definitions')} (company_id,iban_bank_code,name_ar,name_en,swift_code,is_active,payload,sort_order)
      SELECT $1,bank->>'ibanBankCode',COALESCE(bank->>'nameAr',''),COALESCE(bank->>'nameEn',''),
        upper(COALESCE(bank->>'swiftCode','')),COALESCE((bank->>'isActive')::boolean,true),bank,(bank_ordinality - 1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(bank,bank_ordinality)`, [record.id,JSON.stringify(asArray(record.bankDefinitions))]);

    const row = existing.rows[0];
    return {
      ...record,
      subscriptionStatus:subscriptionState(row).status,
      trialEndsAt:row.trial_ends_at?.toISOString?.() || row.trial_ends_at || null,
      subscriptionEndsAt:row.subscription_ends_at?.toISOString?.() || row.subscription_ends_at || null,
    };
  }

  return { validateCompanyRecord,updateCompanyAggregate };
}
