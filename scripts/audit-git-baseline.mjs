// Read-only staged-content audit. Never prints matching secret values.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
const paths = git('diff', '--cached', '--name-only', '--diff-filter=ACM', '-z').toString().split('\0').filter(Boolean);
const known = [];
for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    const value = m?.[2].replace(/^['"]|['"]$/g, '');
    if (value?.length >= 12) known.push(value);
  }
}
const failures = [];
for (const path of paths) {
  if (/(^|\/)(?:node_modules|\.localagent|\.runtime|\.workspace-check|release)\/|\.(?:exe|pfx|pem|key|zip)$/i.test(path) || /(^|\/)\.env(?!\.example$)/.test(path)) {
    failures.push({ path, reason: 'private_or_generated_path' }); continue;
  }
  const data = git('show', `:${path}`);
  if (known.some(value => data.includes(Buffer.from(value)))) failures.push({ path, reason: 'known_local_secret' });
  if (/(?:AIza[\w-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:or-v1-)?[A-Za-z0-9_-]{32,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(data.toString())) {
    failures.push({ path, reason: 'credential_pattern' });
  }
}
console.log(JSON.stringify({ stagedFiles: paths.length, secretValuesPrinted: false, failures }, null, 2));
if (failures.length) process.exitCode = 1;
