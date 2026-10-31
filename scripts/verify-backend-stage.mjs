import {readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {checkBackendProof, backendTreeHash} from './backend-contract.mjs';

const closureBytes = readFileSync('validation/phase52/backend-closure.json'), closure = JSON.parse(closureBytes);
const proof = JSON.parse(readFileSync('validation/phase52/backend-proof.json'));
const profile = checkBackendProof({closure, proof, closureBytes, lock: JSON.parse(readFileSync('package-lock.json')),
  candidate: closure.output, workspace: resolve('.')});
const stage = resolve('.localagent/desktop-stage'), packaged = resolve('release/desktop-0.5.2/win-unpacked/resources');
const stageHash = backendTreeHash(join(stage, 'runtime/node_modules'));
const packageHash = backendTreeHash(join(packaged, 'runtime/node_modules'));
if (stageHash !== profile.treeSha256 || packageHash !== profile.treeSha256) throw Error('Staged or packaged backend differs from verified candidate');
const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json')));
manifest.backendProfile = profile;
writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
copyFileSync(join(stage, 'manifest.json'), join(packaged, 'runtime-manifest.json'));
writeFileSync('validation/phase52/backend-stage.json', JSON.stringify({candidate: profile.treeSha256, stageHash, packageHash, passed: true}, null, 2));
console.log('Backend candidate, stage and packaged dependency bytes match');
