import { workflowAgents } from './workflow-models.mjs';

// Match the pinned engine's last-match-wins V1 permission rules. This check
// detects project configuration that has weakened the installed role. The
// actual ask/reject contract is exercised by the native integration verifier.
const matches = (value, pattern) => new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*') + '$', 's').test(value);
export function permissionAction(rules, action, resource) {
  return rules.findLast(rule => matches(action, rule.permission) && matches(resource, rule.pattern))?.action || 'ask';
}

export async function verifyNativeRole(client, agent, privateDirectory) {
  const expected = workflowAgents(privateDirectory)[agent];
  if (!expected) throw Error('workflow_unknown_role');
  const actual = (await client.app.agents()).data?.find(item => item.name === agent);
  if (!Array.isArray(actual?.permission)) throw Error('workflow_native_permission_bridge_unverified');
  for (const [action, effect] of Object.entries(expected.permission)) {
    if (action === '*') continue;
    const checks = typeof effect === 'string' ? [['*', effect]] : Object.entries(effect);
    for (const [pattern, required] of checks) {
      const resource = pattern.replaceAll('*', 'probe');
      if (permissionAction(actual.permission, action, resource) !== required) throw Error('workflow_native_permission_mismatch');
    }
  }
  if (permissionAction(actual.permission, 'unknown_tool', '*') !== 'deny') throw Error('workflow_native_permission_mismatch');
  return { verified: true, adapter: 'opencode-1.18.31-permission-only' };
}
