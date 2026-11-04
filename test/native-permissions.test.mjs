import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowAgents } from '../src/workspace/workflow-models.mjs';
import { verifyNativeRole, permissionAction } from '../src/workspace/native-permissions.mjs';

test('native role admission checks effective last-match rules and refuses weakened project configuration', async () => {
  for (const [name, agent] of Object.entries(workflowAgents('C:/private-profile'))) {
    const permission = Object.entries(agent.permission).flatMap(([key, value]) =>
      typeof value === 'string' ? [{permission:key, pattern:'*', action:value}] :
        Object.entries(value).map(([pattern, action]) => ({permission:key, pattern, action})));
    const client = {app:{agents:async()=>({data:[{name, permission}]})}};
    assert.equal((await verifyNativeRole(client, name, 'C:/private-profile')).verified, true);
    permission.push({permission:'edit',pattern:'*',action:'allow'});
    await assert.rejects(verifyNativeRole(client, name, 'C:/private-profile'), /permission_mismatch/);
  }
  assert.equal(permissionAction([{permission:'*',pattern:'*',action:'deny'},{permission:'bash',pattern:'node --test',action:'ask'}], 'bash', 'node --test'), 'ask');
});
