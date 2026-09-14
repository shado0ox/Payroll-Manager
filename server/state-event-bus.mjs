export function createStateEventBus({ buildId }) {
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

  return { addStateEventClient,disconnectStateEventClients,broadcastStateUpdate };
}
