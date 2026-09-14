export function createStateVersionService({ q,workflowError,readNormalizedApplicationState }) {
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

  return { bumpStateVersion,lockStateVersion,readLockedNormalizedState };
}
