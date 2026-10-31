import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictMatrix, LOCK_MODES } from '../src/workspace/conflict-matrix.mjs';

test('shared read locks allow concurrent readers on the same file', () => {
  const cm = new ConflictMatrix();
  const file = 'src/utils.js';

  // Task 1 acquires read lock
  const r1 = cm.acquireLocks('task-1', { readFiles: [file] });
  assert.equal(r1.success, true);

  // Task 2 can also acquire read lock on the same file
  const canRead = cm.canAcquire('task-2', { readFiles: [file] });
  assert.equal(canRead.allowed, true);
  const r2 = cm.acquireLocks('task-2', { readFiles: [file] });
  assert.equal(r2.success, true);

  // But Task 3 CANNOT acquire write lock on that file
  const canWrite = cm.canAcquire('task-3', { writeFiles: [file] });
  assert.equal(canWrite.allowed, false);
  assert.equal(canWrite.conflictType, 'write_read_conflict');
  assert.throws(() => cm.acquireLocks('task-3', { writeFiles: [file] }), /cannot_acquire_lock/);
});

test('exclusive write lock blocks both concurrent readers and writers', () => {
  const cm = new ConflictMatrix();
  const file = 'src/feature.js';

  // Task 1 acquires write lock
  cm.acquireLocks('task-1', { writeFiles: [file] });

  // Task 2 cannot read
  const canRead = cm.canAcquire('task-2', { readFiles: [file] });
  assert.equal(canRead.allowed, false);
  assert.equal(canRead.conflictType, 'read_write_conflict');

  // Task 2 cannot write
  const canWrite = cm.canAcquire('task-2', { writeFiles: [file] });
  assert.equal(canWrite.allowed, false);
  assert.equal(canWrite.conflictType, 'write_write_conflict');

  // Releasing lock permits subsequent acquisition
  cm.releaseLocks('task-1');
  const canWriteAfterRelease = cm.canAcquire('task-2', { writeFiles: [file] });
  assert.equal(canWriteAfterRelease.allowed, true);
});

test('scheduleParallelBatches partitions conflicting steps into sequential waves', () => {
  const cm = new ConflictMatrix();
  const candidates = [
    { id: 'step-a', targetFiles: ['src/shared.js'] },
    { id: 'step-b', targetFiles: ['src/other.js'] },
    { id: 'step-c', targetFiles: ['src/shared.js'] }, // Conflicts with step-a
    { id: 'step-d', targetFiles: ['src/unique.js'] }
  ];

  const waves = cm.scheduleParallelBatches(candidates);
  assert.equal(waves.length, 2, 'Must partition into 2 waves');

  // Wave 1 contains non-conflicting steps
  const wave1Ids = waves[0].map(s => s.id);
  assert.ok(wave1Ids.includes('step-a'));
  assert.ok(wave1Ids.includes('step-b'));
  assert.ok(wave1Ids.includes('step-d'));
  assert.ok(!wave1Ids.includes('step-c'), 'step-c must be postponed');

  // Wave 2 contains the deferred conflicting step
  const wave2Ids = waves[1].map(s => s.id);
  assert.deepEqual(wave2Ids, ['step-c']);
});

