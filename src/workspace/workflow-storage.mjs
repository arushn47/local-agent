import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, linkSync, openSync, closeSync, fsyncSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, relative, isAbsolute, join, dirname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export function assertWorkflowId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) || ['__proto__', 'prototype', 'constructor'].includes(id)) throw Error('invalid_workflow_identifier');
  return id;
}

export function assertPublicFile(path) {
  if (typeof path !== 'string' || !path || path.length > 500 || /[:\x00-\x1f]/.test(path) || isAbsolute(path) || /^[\\/]/.test(path)) throw Error('invalid_workflow_file_path');
  const parts = path.replaceAll('\\', '/').split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(p))) throw Error('invalid_workflow_file_path');
  if (parts.some(p => /^(?:\.git|\.localagent|\.runtime|\.workspace-check|\.aws|\.ssh|\.azure|\.kube|\.docker|\.npmrc|\.pypirc|\.netrc|\.git-credentials|auth\.json|tokens?\.json|oauth\.json|node_modules|release|coverage)$/i.test(p) || /^\.env|credential|secret|^id_(?:rsa|ed25519)|\.(?:pem|key|pfx|p12|keystore)$/i.test(p))) throw Error('private_workflow_file');
  return parts.join('/');
}

// Walk the lexical path before following anything. Reject links/junctions and
// multiply-linked files, including the workspace root and state directories.
export function confinedPath(workspaceDir, file, { privateState = false } = {}) {
  const base = resolve(workspaceDir);
  if (lstatSync(base).isSymbolicLink() || !lstatSync(base).isDirectory()) throw Error('invalid_workflow_workspace');
  const canonicalBase = realpathSync(base);
  const target = resolve(base, file);
  const rel = relative(base, target);
  if (!rel || rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) throw Error('invalid_workflow_file_path');
  if (!privateState) assertPublicFile(file);
  let cursor = base;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    let stat;
    try { stat = lstatSync(cursor); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) throw Error('invalid_workflow_link');
    const canonical = relative(canonicalBase, realpathSync(cursor));
    if (isAbsolute(canonical) || canonical === '..' || canonical.startsWith('..' + sep)) throw Error('invalid_workflow_file_path');
  }
  return target;
}

export function stateDirectory(workspaceDir, kind) {
  if (!['workflows', 'checkpoints'].includes(kind)) throw Error('invalid_workflow_state_kind');
  const dir = confinedPath(workspaceDir, `.localagent/${kind}`, { privateState: true });
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function statePath(workspaceDir, kind, id) {
  assertWorkflowId(id);
  stateDirectory(workspaceDir, kind);
  return confinedPath(workspaceDir, `.localagent/${kind}/${id}.json`, { privateState: true });
}

export function readState(workspaceDir, kind, id) {
  const file = statePath(workspaceDir, kind, id);
  if (!existsSync(file)) return null;
  if (lstatSync(file).size > 8 * 1024 * 1024) throw Error('invalid_workflow_state_size');
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeState(workspaceDir, kind, id, data, { createOnly = false } = {}) {
  const file = statePath(workspaceDir, kind, id);
  if (createOnly && existsSync(file)) throw Error('invalid_workflow_already_exists');
  const text = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw Error('invalid_workflow_state_size');
  const temporary = join(dirname(file), `${id}-${randomUUID()}.tmp`);
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
  try {
    confinedPath(workspaceDir, `.localagent/${kind}/${id}.json`, { privateState: true });
    if (createOnly) linkSync(temporary, file); // Atomic no-clobber publication.
    else renameSync(temporary, file);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
