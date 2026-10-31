import { readdirSync, statSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, join, sep, extname } from 'node:path';

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
      const fullPath = join(base, relPath);

      try {
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
  const base = realpathSync(projectRoot);
  let canonical;
  try {
    const target = resolve(base, relFilePath);
    canonical = realpathSync(target);
  } catch {
    throw Error('project_file_not_found');
  }

  if (!canonical.toLowerCase().startsWith((base + sep).toLowerCase())) {
    throw Error('project_file_denied');
  }

  let cursor = base;
  for (const part of relative(base, canonical).split(sep)) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw Error('project_file_denied');
  }

  const filename = relFilePath.split(/[/\\]/).pop();
  if (forbiddenFilePatterns.test(filename)) {
    throw Error('project_file_denied');
  }

  const stat = statSync(canonical);
  if (!stat.isFile()) throw Error('project_file_denied');
  if (stat.size > maxBytes) throw Error('project_file_too_large');

  const content = readFileSync(canonical, 'utf8');
  return {
    path: relFilePath.replaceAll('\\', '/'),
    name: filename,
    size: stat.size,
    content
  };
}
