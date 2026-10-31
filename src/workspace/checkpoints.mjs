import { existsSync, lstatSync, fstatSync, mkdirSync, readFileSync, openSync, writeSync, closeSync, ftruncateSync, fsyncSync, unlinkSync, readdirSync, constants } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { assertWorkflowId, confinedPath, stateDirectory, writeState, readState, assertPublicFile } from './workflow-storage.mjs';

const approvalKey = randomBytes(32); // Restart invalidates pending approvals.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const maxBytes = 1024 * 1024;
export const getCheckpointsDirectory = workspaceDir => stateDirectory(workspaceDir, 'checkpoints');

function currentFile(workspaceDir, path) {
  const file = confinedPath(workspaceDir, path);
  if (!existsSync(file)) return { exists: false, hash: null, content: null };
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > maxBytes) throw Error('invalid_checkpoint_file_size_or_type');
  const bytes = readFileSync(file);
  const content = bytes.toString('utf8');
  if (bytes.includes(0) || !Buffer.from(content).equals(bytes)) throw Error('invalid_checkpoint_binary_file');
  return { exists: true, hash: hash(bytes), content };
}

export function createCheckpoint({ workspaceDir, workflowId = 'default', stageId = 'default', targetFiles = [], description = '' }) {
  assertWorkflowId(workflowId); assertWorkflowId(stageId);
  if (!Array.isArray(targetFiles) || targetFiles.length > 100) throw Error('invalid_checkpoint_files');
  const normalized = [...new Set(targetFiles.map(assertPublicFile))];
  if (new Set(normalized.map(p => p.toLowerCase())).size !== normalized.length) throw Error('invalid_checkpoint_duplicate_path');
  const files = normalized.map(path => ({ path, ...currentFile(workspaceDir, path) }));
  if (files.reduce((n, f) => n + Buffer.byteLength(f.content || ''), 0) > 4 * maxBytes) throw Error('invalid_checkpoint_size');
  const checkpoint = { version: 2, checkpointId: `chk_${Date.now()}_${randomUUID().slice(0, 8)}`, workflowId, stageId, description: String(description).slice(0, 500), createdAt: new Date().toISOString(), files };
  writeState(workspaceDir, 'checkpoints', checkpoint.checkpointId, checkpoint, { createOnly: true });
  return checkpoint;
}

export function getCheckpoint({ workspaceDir, checkpointId }) {
  const chk = readState(workspaceDir, 'checkpoints', checkpointId);
  if (!chk) return null;
  assertWorkflowId(chk.workflowId); assertWorkflowId(chk.stageId);
  if (chk.checkpointId !== checkpointId || !Array.isArray(chk.files) || chk.files.length > 100) throw Error('invalid_checkpoint');
  const seen = new Set();
  for (const f of chk.files) {
    assertPublicFile(f.path);
    if (seen.has(f.path.toLowerCase()) || typeof f.exists !== 'boolean' || (!f.exists && (f.hash !== null || f.content !== null)) || (f.exists && (typeof f.content !== 'string' || Buffer.byteLength(f.content) > maxBytes || hash(Buffer.from(f.content)) !== f.hash))) throw Error('invalid_checkpoint');
    seen.add(f.path.toLowerCase());
  }
  return chk;
}

export function listCheckpoints({ workspaceDir, workflowId = null }) {
  if (workflowId) assertWorkflowId(workflowId);
  return readdirSync(getCheckpointsDirectory(workspaceDir)).filter(f => f.endsWith('.json')).flatMap(file => {
    try {
      const chk = getCheckpoint({ workspaceDir, checkpointId: file.slice(0, -5) });
      return chk && (!workflowId || chk.workflowId === workflowId) ? [{ checkpointId: chk.checkpointId, workflowId: chk.workflowId, stageId: chk.stageId, description: chk.description, createdAt: chk.createdAt, fileCount: chk.files.length }] : [];
    } catch { return []; }
  }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function previewCheckpointRestore({ workspaceDir, checkpointId, workflowId }) {
  const chk = getCheckpoint({ workspaceDir, checkpointId });
  if (!chk || (workflowId && chk.workflowId !== workflowId)) throw Error('invalid_checkpoint_owner');
  const files = chk.files.map(record => {
    const current = currentFile(workspaceDir, record.path);
    return { path: record.path, currentHash: current.hash, snapshotHash: record.hash, action: record.exists ? 'restore' : current.exists ? 'remove' : 'unchanged' };
  });
  const material = JSON.stringify({ workspaceDir, checkpointId, workflowId: chk.workflowId, files });
  const token = createHmac('sha256', approvalKey).update(material).digest('hex');
  return { checkpointId, workflowId: chk.workflowId, files, token, requiresApproval: true };
}

export function authorizeCheckpointRestore({ workspaceDir, checkpointId, workflowId, approval }) {
  const preview = previewCheckpointRestore({ workspaceDir, checkpointId, workflowId });
  if (approval?.approved !== true || typeof approval.token !== 'string' || !/^[a-f0-9]{64}$/.test(approval.token)) throw Error('checkpoint_restore_approval_required');
  if (!timingSafeEqual(Buffer.from(approval.token, 'hex'), Buffer.from(preview.token, 'hex'))) throw Error('checkpoint_restore_conflict');
  return preview;
}

export function restoreCheckpoint({ workspaceDir, checkpointId, workflowId, approval }) {
  const preview = authorizeCheckpointRestore({ workspaceDir, checkpointId, workflowId, approval });
  const chk = getCheckpoint({ workspaceDir, checkpointId });
  const restoredFiles = [], removedFiles = [];
  // Preflight all paths/hashes, then recheck before each mutation. This is not
  // a multi-file transaction and does not claim OS-level process isolation.
  for (const record of chk.files) {
    const expected = preview.files.find(f => f.path === record.path);
    if (currentFile(workspaceDir, record.path).hash !== expected.currentHash) throw Error('checkpoint_restore_conflict');
    const file = confinedPath(workspaceDir, record.path);
    if (record.exists && expected.currentHash !== record.hash) {
      mkdirSync(dirname(file), { recursive: true });
      confinedPath(workspaceDir, record.path);
      const fd = openSync(file, (existsSync(file) ? constants.O_RDWR : constants.O_RDWR | constants.O_CREAT | constants.O_EXCL) | (constants.O_NOFOLLOW || 0), 0o600);
      try {
        const stat = fstatSync(fd);
        confinedPath(workspaceDir, record.path);
        if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== lstatSync(file).ino || stat.size > maxBytes) throw Error('invalid_workflow_link');
        const prior = readFileSync(fd);
        if (expected.currentHash !== null && hash(prior) !== expected.currentHash) throw Error('checkpoint_restore_conflict');
        const bytes = Buffer.from(record.content);
        let written = 0;
        while (written < bytes.length) written += writeSync(fd, bytes, written, bytes.length - written, written);
        ftruncateSync(fd, bytes.length); fsyncSync(fd);
      } finally { closeSync(fd); }
      restoredFiles.push(record.path);
    } else if (!record.exists && existsSync(file)) {
      unlinkSync(file); removedFiles.push(record.path);
    }
  }
  return { success: true, checkpointId, workflowId: chk.workflowId, stageId: chk.stageId, restoredFiles, removedFiles };
}
