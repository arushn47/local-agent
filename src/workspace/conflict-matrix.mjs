import { resolve, normalize } from 'node:path';

export const LOCK_MODES = Object.freeze({
  READ: 'read',     // Shared lock
  WRITE: 'write'    // Exclusive lock
});

export class ConflictMatrix {
  constructor(baseDir = '') {
    this.baseDir = baseDir;
    // Map<normalizedFilePath, { mode: 'read'|'write', holders: Set<taskId> }>
    this.locks = new Map();
    // Map<taskId, { writeFiles: Set<string>, readFiles: Set<string> }>
    this.taskAllocations = new Map();
  }

  _normalizePath(filePath) {
    if (!filePath || typeof filePath !== 'string') return '';
    const clean = filePath.trim().replace(/\\/g, '/');
    return this.baseDir ? normalize(resolve(this.baseDir, clean)).toLowerCase() : clean.toLowerCase();
  }

  canAcquire(taskId, { writeFiles = [], readFiles = [] }) {
    const writes = writeFiles.map(f => this._normalizePath(f)).filter(Boolean);
    const reads = readFiles.map(f => this._normalizePath(f)).filter(Boolean);

    // 1. Check write targets
    for (const file of writes) {
      if (this.locks.has(file)) {
        const lock = this.locks.get(file);
        for (const holder of lock.holders) {
          if (holder !== taskId) {
            return {
              allowed: false,
              conflictType: lock.mode === LOCK_MODES.WRITE ? 'write_write_conflict' : 'write_read_conflict',
              file,
              conflictWithTaskId: holder
            };
          }
        }
      }
    }

    // 2. Check read targets
    for (const file of reads) {
      if (this.locks.has(file)) {
        const lock = this.locks.get(file);
        if (lock.mode === LOCK_MODES.WRITE) {
          for (const holder of lock.holders) {
            if (holder !== taskId) {
              return {
                allowed: false,
                conflictType: 'read_write_conflict',
                file,
                conflictWithTaskId: holder
              };
            }
          }
        }
      }
    }

    return { allowed: true };
  }

  acquireLocks(taskId, { writeFiles = [], readFiles = [] }) {
    const check = this.canAcquire(taskId, { writeFiles, readFiles });
    if (!check.allowed) {
      throw new Error(`cannot_acquire_lock: ${check.conflictType} on "${check.file}" held by task "${check.conflictWithTaskId}"`);
    }

    const writes = writeFiles.map(f => this._normalizePath(f)).filter(Boolean);
    const reads = readFiles.map(f => this._normalizePath(f)).filter(Boolean);

    if (!this.taskAllocations.has(taskId)) {
      this.taskAllocations.set(taskId, { writeFiles: new Set(), readFiles: new Set() });
    }
    const alloc = this.taskAllocations.get(taskId);

    // Acquire write locks
    for (const file of writes) {
      if (!this.locks.has(file)) {
        this.locks.set(file, { mode: LOCK_MODES.WRITE, holders: new Set([taskId]) });
      } else {
        const lock = this.locks.get(file);
        lock.mode = LOCK_MODES.WRITE;
        lock.holders.add(taskId);
      }
      alloc.writeFiles.add(file);
    }

    // Acquire read locks
    for (const file of reads) {
      if (alloc.writeFiles.has(file)) continue; // Already have write lock
      if (!this.locks.has(file)) {
        this.locks.set(file, { mode: LOCK_MODES.READ, holders: new Set([taskId]) });
      } else {
        const lock = this.locks.get(file);
        lock.holders.add(taskId);
      }
      alloc.readFiles.add(file);
    }

    return { success: true, taskId, writes, reads };
  }

  releaseLocks(taskId) {
    if (!this.taskAllocations.has(taskId)) return false;
    const alloc = this.taskAllocations.get(taskId);

    for (const file of alloc.writeFiles) {
      if (this.locks.has(file)) {
        const lock = this.locks.get(file);
        lock.holders.delete(taskId);
        if (lock.holders.size === 0) {
          this.locks.delete(file);
        }
      }
    }

    for (const file of alloc.readFiles) {
      if (this.locks.has(file)) {
        const lock = this.locks.get(file);
        lock.holders.delete(taskId);
        if (lock.holders.size === 0) {
          this.locks.delete(file);
        }
      }
    }

    this.taskAllocations.delete(taskId);
    return true;
  }

  getActiveLocks() {
    const list = [];
    for (const [file, lock] of this.locks.entries()) {
      list.push({
        file,
        mode: lock.mode,
        holders: Array.from(lock.holders)
      });
    }
    return list;
  }

  hasConflicts(stepA, stepB) {
    const writesA = (Array.isArray(stepA.targetFiles) ? stepA.targetFiles : []).map(f => this._normalizePath(f)).filter(Boolean);
    const readsA = (Array.isArray(stepA.readFiles) ? stepA.readFiles : []).map(f => this._normalizePath(f)).filter(Boolean);

    const writesB = (Array.isArray(stepB.targetFiles) ? stepB.targetFiles : []).map(f => this._normalizePath(f)).filter(Boolean);
    const readsB = (Array.isArray(stepB.readFiles) ? stepB.readFiles : []).map(f => this._normalizePath(f)).filter(Boolean);

    // 1. Write-Write conflict
    for (const wA of writesA) {
      if (writesB.includes(wA)) return { conflict: true, type: 'write_write', file: wA };
    }

    // 2. Write-Read conflict (A writes, B reads)
    for (const wA of writesA) {
      if (readsB.includes(wA)) return { conflict: true, type: 'write_read', file: wA };
    }

    // 3. Read-Write conflict (A reads, B writes)
    for (const rA of readsA) {
      if (writesB.includes(rA)) return { conflict: true, type: 'read_write', file: rA };
    }

    return { conflict: false };
  }

  scheduleParallelBatches(candidateSteps = []) {
    const waves = [];
    const remaining = [...candidateSteps];

    while (remaining.length > 0) {
      const currentWave = [];
      const postponed = [];

      for (const step of remaining) {
        let hasConflictWithCurrentWave = false;
        for (const active of currentWave) {
          if (this.hasConflicts(active, step).conflict) {
            hasConflictWithCurrentWave = true;
            break;
          }
        }

        if (!hasConflictWithCurrentWave) {
          currentWave.push(step);
        } else {
          postponed.push(step);
        }
      }

      waves.push(currentWave);
      remaining.length = 0;
      remaining.push(...postponed);
    }

    return waves;
  }
}

