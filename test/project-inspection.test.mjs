import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, linkSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listProjectFiles, readProjectFile } from '../src/workspace/project-files.mjs';

test('file inspection rejects private directory contents, Windows aliases, binary files and indirect links', () => {
  const root = mkdtempSync(join(tmpdir(), 'la-inspection-'));
  try {
    writeFileSync(join(root, 'visible.mjs'), 'export const value = 2;\n');
    for (const dir of ['.localagent', '.ssh', '.aws', '.git', 'node_modules']) {
      mkdirSync(join(root, dir)); writeFileSync(join(root, dir, 'ordinary.json'), 'private');
      assert.throws(() => readProjectFile(root, dir + '/ordinary.json'), /denied/);
    }
    writeFileSync(join(root, 'binary.dat'), Buffer.from([0, 1, 2, 255]));
    assert.throws(() => readProjectFile(root, 'binary.dat'), /binary/);
    for (const path of ['visible.mjs:stream', 'visible.mjs.', './visible.mjs', '../visible.mjs']) {
      assert.throws(() => readProjectFile(root, path), /denied/);
    }
    linkSync(join(root, 'visible.mjs'), join(root, 'linked.mjs'));
    assert.throws(() => readProjectFile(root, 'linked.mjs'), /denied/);
    // A directory junction needs no Windows symlink privilege. A canonical-only
    // check used to follow this alias before checking for links.
    mkdirSync(join(root, 'actual')); writeFileSync(join(root, 'actual', 'file.txt'), 'text');
    symlinkSync(join(root, 'actual'), join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => readProjectFile(root, 'alias/file.txt'), /denied/);
    const paths = listProjectFiles(root).map(item => item.path);
    assert.ok(paths.includes('actual/file.txt'));
    assert.ok(!paths.some(path => path.startsWith('.ssh') || path.startsWith('alias') || path === 'linked.mjs'));
    assert.equal(readProjectFile(root, 'actual/file.txt').content, 'text');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
