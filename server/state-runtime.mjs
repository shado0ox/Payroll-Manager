export function createStateRuntime({ q,buildId,workflowError,readNormalizedApplicationState }) {
  const stateEventClients = new Set();

  const disconnectStateEventClients = (userId) => {
    for (const client of stateEventClients) {
      if (userId && client.userId !== userId) continue;
      stateEventClients.delete(client);
      try { client.response.end(); } catch {}
    }
  };

  const broadcastStateUpdate = (payload) => {
    for (const client of stateEventClients) {
      const scopedCompanyIds = Array.isArray(payload.companyIds) ? payload.companyIds : [];
      const canSeeChange = !scopedCompanyIds.length || scopedCompanyIds.some(id => client.companyIds.has(id));
      const { companyIds:_companyIds,changes:_changes,...metadata } = payload;
      const eventPayload = canSeeChange ? { ...metadata,changes:_changes } : { ...metadata,changes:[] };
      try { client.response.write(`data: ${JSON.stringify({ ...eventPayload,buildId })}\n\n`); }
      catch { stateEventClients.delete(client); }
    }
  };

  const addStateEventClient = (client) => {
    stateEventClients.add(client);
    return () => stateEventClients.delete(client);
  };

  async function bumpStateVersion(client, userId) {
    const updated = await client.query(`UPDATE ${q('app_state')}
      SET version=version+1,updated_by=$1,updated_at=now()
      WHERE id=1 RETURNING version,updated_at`, [userId]);
    if (!updated.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
    return updated;
  }

  async function lockStateVersion(client) {
    const current = await client.query(`SELECT version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!current.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
    return Number(current.rows[0].version || 0);
  }

  async function readLockedNormalizedState(client) {
    await lockStateVersion(client);
    return readNormalizedApplicationState(client);
  }

  return { addStateEventClient,disconnectStateEventClients,broadcastStateUpdate,bumpStateVersion,lockStateVersion,readLockedNormalizedState };
}
