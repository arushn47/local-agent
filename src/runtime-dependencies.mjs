import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { opencodeExe, omniRoot } from './config.mjs';
export const runtimeVersions = JSON.parse(readFileSync(new URL('../integrations/runtime-versions.json', import.meta.url)));

export function checkRuntimes() {
  const checks = [
    { name: 'opencode', expected: runtimeVersions.opencode, manifest: join(dirname(dirname(opencodeExe)), 'package.json'), artifact: opencodeExe },
    { name: 'omniroute', expected: runtimeVersions.omniroute, manifest: join(omniRoot, 'package.json'), artifact: join(omniRoot, 'dist/server-ws.mjs') },
  ].map(({name,expected,manifest,artifact}) => {
    let installed; try { installed = JSON.parse(readFileSync(manifest, 'utf8')).version; } catch {}
    return { name, expected, installed: installed || null, ready: installed === expected && existsSync(artifact) };
  });
  return { ready: Number(process.versions.node.split('.')[0]) >= 24 && checks.every(c=>c.ready), node: process.versions.node, checks };
}
