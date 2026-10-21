import { manualPlatformOnly } from './platform-execution-policy.mjs';
import { readWorkspace } from './workspace.mjs';
import { revokeConnection } from './platform-connector.mjs';
import { readHosted, saveHosted, hostedRows, publicHosted } from './hosted-browser-store.mjs';

// Compatibility surface for old clients. Only history and explicit disconnection remain.
export function createHostedService(_options = {}) {
  function owned(email, id) {
    const row = readHosted(id, email);
    if (!readWorkspace(email).customers.some(c => c.id === row.customerId))
      throw Object.assign(new Error('业务已不存在'), { statusCode: 404 });
    return row;
  }
  const publicRow = row => ({ ...publicHosted(row), executionEnabled: false });
  function list(email) { return { available: false, connections: hostedRows(email).map(publicRow) }; }
  async function status(email, input) { return publicRow(owned(email, input.id)); }
  async function disconnect(email, input) {
    const row = owned(email, input.id);
    row.status = 'disconnected'; row.executionEnabled = false;
    delete row.storageState;
    saveHosted(row);
    if (row.connectionId) revokeConnection(email, { connectionId: row.connectionId });
    return publicRow(row);
  }
  const disabled = async () => manualPlatformOnly();
  return { list, status, disconnect, start: disabled, retry: disabled,
    frame: disabled, click: disabled, enable: manualPlatformOnly,
    async run() {}, startWorker() {}, async stop() {} };
}
export const hostedBrowser = createHostedService();
