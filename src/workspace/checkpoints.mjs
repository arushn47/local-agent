import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function getCheckpointsDirectory(workspaceDir) {
  return join(workspaceDir, '.localagent', 'checkpoints');
}

export function createCheckpoint({
  workspaceDir,
  workflowId = 'default',
  stageId = 'default',
  targetFiles = [],
  description = ''
}) {
  if (!workspaceDir) throw new Error('workspaceDir_required');
  const checkpointsDir = getCheckpointsDirectory(workspaceDir);
  mkdirSync(checkpointsDir, { recursive: true });

  const checkpointId = `chk_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const filesRecord = [];

  const normalizedFiles = Array.isArray(targetFiles) ? targetFiles : [targetFiles];
  for (const f of normalizedFiles) {
    if (!f || typeof f !== 'string') continue;
    const absPath = resolve(workspaceDir, f);
    const relPath = relative(workspaceDir, absPath).replace(/\\/g, '/');

    // Prevent directory traversal escape
    if (relPath.startsWith('..')) continue;

    if (existsSync(absPath)) {
      try {
        const content = readFileSync(absPath, 'utf8');
        const hash = createHash('sha256').update(content).digest('hex');
        filesRecord.push({
          path: relPath,
          exists: true,
          content,
          hash
        });
      } catch {}
    } else {
      // File did not exist at checkpoint time
      filesRecord.push({
        path: relPath,
        exists: false,
        content: null,
        hash: null
      });
    }
  }

  const checkpoint = {
    checkpointId,
    workflowId,
    stageId,
    description: description || `Checkpoint for stage ${stageId}`,
    createdAt: new Date().toISOString(),
    files: filesRecord
  };

  const checkpointPath = join(checkpointsDir, `${checkpointId}.json`);
  writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });

  return checkpoint;
}

export function listCheckpoints({ workspaceDir, workflowId = null }) {
  if (!workspaceDir) return [];
  const checkpointsDir = getCheckpointsDirectory(workspaceDir);
  if (!existsSync(checkpointsDir)) return [];

  const results = [];
  try {
    const files = readdirSync(checkpointsDir);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = readFileSync(join(checkpointsDir, f), 'utf8');
        const chk = JSON.parse(raw);
        if (chk.checkpointId && (!workflowId || chk.workflowId === workflowId)) {
          results.push({
            checkpointId: chk.checkpointId,
            workflowId: chk.workflowId,
            stageId: chk.stageId,
            description: chk.description,
            createdAt: chk.createdAt,
            fileCount: chk.files?.length || 0
          });
        }
      } catch {}
    }
  } catch {}

  return results.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function getCheckpoint({ workspaceDir, checkpointId }) {
  if (!workspaceDir || !checkpointId) return null;
  const checkpointsDir = getCheckpointsDirectory(workspaceDir);
  const filePath = join(checkpointsDir, `${checkpointId}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function restoreCheckpoint({ workspaceDir, checkpointId }) {
  if (!workspaceDir) throw new Error('workspaceDir_required');
  const checkpoint = getCheckpoint({ workspaceDir, checkpointId });
  if (!checkpoint) throw new Error(`checkpoint_not_found: ${checkpointId}`);

  const restoredFiles = [];
  const removedFiles = [];

  // Safety rule: strictly confine modifications to the tracked files recorded in the checkpoint.
  // Never touch, delete, or overwrite unrelated user files.
  for (const record of checkpoint.files) {
    const absPath = resolve(workspaceDir, record.path);
    const relPath = relative(workspaceDir, absPath).replace(/\\/g, '/');
    if (relPath.startsWith('..')) continue;

    if (record.exists) {
      // Restore file to its exact snapshot content
      const parentDir = resolve(absPath, '..');
      mkdirSync(parentDir, { recursive: true });
      writeFileSync(absPath, record.content, 'utf8');
      restoredFiles.push(record.path);
    } else {
      // File did not exist at checkpoint time: if it was created during failed step, remove it
      if (existsSync(absPath)) {
        try {
          unlinkSync(absPath);
          removedFiles.push(record.path);
        } catch {}
      }
    }
  }

  return {
    success: true,
    checkpointId,
    workflowId: checkpoint.workflowId,
    stageId: checkpoint.stageId,
    restoredFiles,
    removedFiles
  };
}

