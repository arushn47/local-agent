import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {backendTreeHash, lockGraphHash, checkBackendProof} from '../scripts/backend-contract.mjs';

test('backend staging rejects stale proof, graph drift, UI dependencies and changed runtime bytes', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'localagent-closure-'));
  const candidate = resolve(workspace, '.localagent/backend'), modules = join(candidate, 'node_modules');
  for (const name of ['@opencode-ai/sdk', 'opencode-ai', 'solid-js', 'playwright-core', 'yazl', 'next', 'react', 'react-dom', 'omniroute']) {
    mkdirSync(join(modules, name), {recursive: true});
    writeFileSync(join(modules, name, 'package.json'), JSON.stringify({name, version: ({next:'16.4.3',omniroute:'3.8.52'})[name] || 'fixture'}));
  }
  try {
    const lock = {packages: {'': {version: '0.5.2'}, 'node_modules/next': {version: '16.4.3'}}};
    const closure = {gateway: '3.8.52', next: '16.4.3', lockGraphSha256: lockGraphHash(lock), output: candidate, inventory: [], packages: 8};
    const closureBytes = Buffer.from(JSON.stringify(closure));
    const proof = {passed: true, moduleEscapes: 0, gatewayFixturePassed: true, candidate,
      closureSha256: createHash('sha256').update(closureBytes).digest('hex'), treeSha256: backendTreeHash(modules)};
    const input = {closure, closureBytes, proof, lock, candidate, workspace};
    assert.equal(checkBackendProof(input).profile, 'backend');
    assert.equal(lockGraphHash({...lock, packages: {...lock.packages, '': {version: '0.5.3'}}}), lockGraphHash(lock));
    assert.throws(() => checkBackendProof({...input, proof: {...proof, moduleEscapes: 1}}), /stale/);
    assert.throws(() => checkBackendProof({...input, lock: {packages: {...lock.packages, new: {version: '1'}}}}), /mismatch/);
    assert.throws(() => checkBackendProof({...input, closure: {...closure, inventory: [{name: '@splinetool/runtime'}]}}), /UI package/);
    writeFileSync(join(modules, 'solid-js/package.json'), '{}');
    assert.throws(() => checkBackendProof(input), /payload changed/);
  } finally {rmSync(workspace, {recursive: true, force: true});}
});
