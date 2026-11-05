import { readdirSync, statSync, readFileSync, realpathSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { join, sep, extname } from 'node:path';
import { assertPublicFile, confinedPath } from './workflow-storage.mjs';
import { createHash } from 'node:crypto';

const forbiddenDirPatterns = /^(?:\.git|\.localagent|\.runtime|node_modules|coverage)$/i;
const forbiddenFilePatterns = /^(?:\.env.*|.*credential.*|.*secret.*|.*id_rsa.*|.*\.pem|.*\.key)$/i;
const binaryExtensions = new Set(['.exe', '.dll', '.so', '.dylib', '.bin', '.iso', '.zip', '.tar', '.gz', '.7z', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.wav']);

export function listProjectFiles(projectRoot, { maxFiles = 500 } = {}) {
  let base;
  try {
    base = realpathSync(projectRoot);
  } catch {
    return [];
  }
  const queue = [''];
  const items = [];
  let visited = 0;

  while (queue.length > 0 && items.length < maxFiles) {
    const relDir = queue.shift();
    const fullDir = relDir ? join(base, relDir) : base;

    let entries = [];
    try {
      entries = readdirSync(fullDir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (++visited > 2000 || items.length >= maxFiles) break;
      const name = entry.name;
      if (entry.isSymbolicLink()) continue;
      if (forbiddenDirPatterns.test(name)) continue;
      if (forbiddenFilePatterns.test(name)) continue;

      const relPath = relDir ? `${relDir}/${name}` : name;

      try {
        assertPublicFile(relPath);
        const fullPath = confinedPath(base, relPath);
        const canonical = realpathSync(fullPath);
        if (!canonical.toLowerCase().startsWith((base + sep).toLowerCase()) && canonical.toLowerCase() !== base.toLowerCase()) {
          continue;
        }

        if (entry.isDirectory()) {
          items.push({ path: relPath, name, type: 'directory' });
          queue.push(relPath);
        } else if (entry.isFile()) {
          const stat = statSync(canonical);
          items.push({
            path: relPath,
            name,
            type: 'file',
            size: stat.size,
            isBinary: binaryExtensions.has(extname(name).toLowerCase())
          });
        }
      } catch {
        continue;
      }
    }
  }

  return items;
}

export function readProjectFile(projectRoot, relFilePath, { maxBytes = 1024 * 1024 } = {}) {
  if (typeof relFilePath !== 'string' || !relFilePath.trim()) {
    throw Error('invalid_file_path');
  }
  let target;
  try {
    target = confinedPath(projectRoot, assertPublicFile(relFilePath));
  } catch (error) {
    if (error.code !== 'ENOENT') throw Error('project_file_denied');
    throw Error('project_file_not_found');
  }
  const filename = relFilePath.split(/[/\\]/).pop();
  let stat, content, sha256, fd;
  try {
    fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== statSync(target).ino) throw Error('project_file_denied');
    if (stat.size > maxBytes) throw Error('project_file_too_large');
    const bytes = readFileSync(fd);
    if (bytes.length > maxBytes) throw Error('project_file_too_large');
    if (bytes.includes(0)) throw Error('project_file_binary');
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw Error('project_file_binary'); }
    sha256 = createHash('sha256').update(bytes).digest('hex');
  } finally { if (fd !== undefined) closeSync(fd); }
  return {
    path: relFilePath.replaceAll('\\', '/'),
    name: filename,
    size: stat.size,
    sha256,
    content
  };
}
