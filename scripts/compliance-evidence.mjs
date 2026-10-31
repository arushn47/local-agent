import {readFileSync, writeFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join, resolve, relative} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root = resolve('.localagent/desktop-stage/runtime/node_modules');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const binaries = [], notices = [];
const expectedBlobs = {
  'docs/third-party/sharp-0.35.5/libvips-8.18.7-LICENSE': '4362b49151d7b34ef83b3067a8f9c9f877d72a0e',
  'docs/third-party/bun-1.3.14/TinyCC-COPYING': '223ede7de3ec74eb86253f9ce9ed7ba3c5aa9130',
};
function walk(directory) {
  for (const item of readdirSync(directory, {withFileTypes: true})) {
    if (item.isSymbolicLink()) throw Error('Unexpected payload link');
    const path = join(directory, item.name);
    if (item.isDirectory()) walk(path);
    else if (/\.(exe|node|dll|wasm)$/i.test(item.name)) binaries.push({path: relative(root, path).replaceAll('\\', '/'), bytes: statSync(path).size, sha256: sha256(readFileSync(path))});
  }
}
walk(root);
function collect(directory) {
  for (const item of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, item.name);
    if (item.isDirectory()) collect(path);
    else {
      const bytes = readFileSync(path), name = path.replaceAll('\\', '/');
      const gitBlob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
      if (expectedBlobs[name] && expectedBlobs[name] !== gitBlob) throw Error('Official notice blob mismatch');
      notices.push({path: name, bytes: bytes.length, sha256: sha256(bytes), ...(expectedBlobs[name] ? {gitBlob, expectedBlobMatched: true} : {})});
    }
  }
}
collect('docs/third-party');
const sourceUrls = {
  'bun-0d9b296af.tar.gz': 'https://codeload.github.com/oven-sh/bun/tar.gz/0d9b296af33f2b851fcbf4df3e9ec89751734ba4',
  'opencode-014614d35.tar.gz': 'https://codeload.github.com/anomalyco/opencode/tar.gz/014614d35b397775e5d397a490fc72368c894ec2',
  'libvips-24ad4d042.tar.gz': 'https://codeload.github.com/libvips/libvips/tar.gz/24ad4d042940e6bf99a68871ba886ca8847c9c82',
  'tinycc-12882eee0.tar.gz': 'https://codeload.github.com/oven-sh/tinycc/tar.gz/12882eee073cfe5c7621bcfadf679e1372d4537b',
  'sharp-51a990faa.tar.gz': 'https://codeload.github.com/lovell/sharp/tar.gz/51a990faa26ade5586a4934ac9673c98d8893326',
  'sharp-libvips-ebb95f8ad.tar.gz': 'https://codeload.github.com/lovell/sharp-libvips/tar.gz/ebb95f8add54eee8bed840e3fb587e4cbec857d7',
  'vips-mxe-ef19ca09a.tar.gz': 'https://codeload.github.com/libvips/build-win64-mxe/tar.gz/ef19ca09af2453d127453d677c849ccb37cf5694',
};
const archives = Object.entries(sourceUrls).filter(([name]) => existsSync(join('.localagent/compliance-sources', name)))
  .map(([name, url]) => {
    const path = join('.localagent/compliance-sources', name);
    const listed = spawnSync(join(process.env.SystemRoot, 'System32/tar.exe'), ['-tzf', resolve(path)], {encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024});
    if (listed.status !== 0) throw Error('Unreadable source archive: ' + name);
    const members = listed.stdout.trim().split(/\r?\n/);
    if (members.some(p => /^(\/|[a-z]:)|(^|\/)\.\.(\/|$)/i.test(p))) throw Error('Unsafe source archive path');
    return {path, url, bytes: statSync(path).size, sha256: sha256(readFileSync(path)), archiveMembers: members.length, readableIndex: true, scope: 'Source archive obtained; not by itself a complete corresponding-source/relinking package'};
  });
const native = JSON.parse(readFileSync(join(root, 'omniroute/dist/config/release/wreq-js-native-manifest.json')));
const wreq = native.nativeAddons.filter(p => p.target === 'win32-x64-msvc').map(p => {
  const actual = binaries.find(b => b.path.endsWith('/' + p.path));
  return {target: p.target, sourceCommit: native.source.commit, expected: p.sha256, actual: actual?.sha256, matches: actual?.sha256 === p.sha256};
});
if (!wreq.length || wreq.some(p => !p.matches)) throw Error('wreq native provenance mismatch');
writeFileSync('validation/phase52/compliance.json', JSON.stringify({scope: 'Engineering provenance inventory, not legal clearance', binaries, notices, archives, wreq,
  additionalReviewMaterials: {directory: '.localagent/compliance-review/sharp-libvips-1.3.4', packaged: false,
    scope: 'Matching native build notice table/recipe and official native LICENSE acquired after payload freeze. Main libvips DLL matches official asset; C++ wrapper is separately built by Sharp binding.gyp. No blanket native clearance.'},
  publicReleaseCleared: false, remaining: ['Original engine build flags and matching JSC objects/relinking materials', 'WebKit corresponding-source archive', 'Sharp transitive native build/license mapping', 'Remaining embedded native notice/source review', 'Owner license and redistribution review']}, null, 2));
console.log(JSON.stringify({binaries: binaries.length, notices: notices.length, archives: archives.length, wreq, publicReleaseCleared: false}));
