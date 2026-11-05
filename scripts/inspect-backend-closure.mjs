// Reproduce backend seeds from the pinned, verified build; never execute upstream config.
import {readFileSync, readdirSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const pin = JSON.parse(readFileSync('integrations/omniroute/source.json'));
const root = resolve('.localagent/omniroute-source-' + pin.commit);
const tree = JSON.parse(readFileSync('.localagent/omniroute-source-tree.json'));
const seeds = new Set(), files = new Set();
let traces = 0;
function source(path) {
  const bytes = readFileSync(join(root, path));
  const actual = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  if (tree.tree.find(f => f.path === path)?.sha !== actual) throw Error('Upstream source hash mismatch: ' + path);
  return ts.createSourceFile(path, bytes.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText() === 'serverExternalPackages' && ts.isArrayLiteralExpression(node.initializer)) {
    for (const e of node.initializer.elements) if (ts.isStringLiteral(e)) seeds.add(e.text);
  }
  if (ts.isPropertyAssignment(node) && ['src', 'dest'].includes(node.name.getText()) && ts.isArrayLiteralExpression(node.initializer)) {
    const parts = node.initializer.elements.map(e => ts.isStringLiteral(e) ? e.text : null);
    if (parts[0] === 'node_modules' && parts[1]) seeds.add(parts[1].startsWith('@') && parts[2] ? parts[1] + '/' + parts[2] : parts[1]);
  }
  ts.forEachChild(node, visit);
}
visit(source('next.config.mjs'));
visit(source('scripts/build/assembleStandalone.mjs'));
function scan(directory) {
  for (const e of readdirSync(directory, {withFileTypes: true})) {
    if (e.isSymbolicLink() || e.name === 'node_modules' || e.name === 'standalone') continue;
    const path = join(directory, e.name);
    if (e.isDirectory()) scan(path);
    else if (e.name.endsWith('.nft.json')) {
      traces++;
      for (const file of JSON.parse(readFileSync(path)).files) {
        const absolute = resolve(dirname(path), file);
        files.add(absolute);
        const packages = absolute.replaceAll('\\', '/').split('/node_modules/').slice(1);
        for (const p of packages) seeds.add(p.startsWith('@') ? p.split('/').slice(0, 2).join('/') : p.split('/')[0]);
      }
    }
  }
}
scan(join(root, '.build/next'));
if (!traces) throw Error('Build traces missing; run gateway:build and gateway:adopt first');
const evidence=resolve(process.env.LOCALAGENT_BUILD_EVIDENCE||'validation/phase52');
mkdirSync(evidence, {recursive: true});
writeFileSync(join(evidence,'gateway-seeds.json'), JSON.stringify([...seeds].sort(), null, 2));
writeFileSync(join(evidence,'trace-inventory.json'), JSON.stringify({commit: pin.commit, traces, files: [...files].sort(), packages: [...seeds].sort()}, null, 2));
console.log(JSON.stringify({commit: pin.commit, traces, tracedPaths: files.size, seeds: seeds.size}));
