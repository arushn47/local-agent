// Distribution-only omissions. Never edit installed/source upstream packages.
// The hash-pinned NSIS overlay uses Windows tar, including verified ZIP64 support.
export function omitDesktopFile(path){
  const name=path.replaceAll('\\','/');
  if(!name.includes('/node_modules/'))return false;
  const base=name.split('/').at(-1);
  // Retain notices even inside a test fixture or documentation directory.
  if(/license|notice|copying|copyright/i.test(base))return false;
  // Upstream postinstall may create a package-local .env. Desktop supplies its
  // own per-user runtime configuration; never distribute a build-time env file.
  if(base==='.env'||/^\.env\.(?!example$)/i.test(base)||base==='.npmrc')return true;
  // OpenCode's postinstall has already selected/copied the runnable binary to
  // opencode-ai/bin. LocalAgent invokes that exact path; optional package copies
  // are install-time alternatives, never runtime dependencies.
  if (/\/node_modules\/opencode-(windows|linux|darwin)-[^/]+\/bin\//.test(name))return true;
  // ONNX loads only process.platform/process.arch (see dist/binding.js). Retain
  // its Windows x64 DLLs and binding; do not remove WASM or runtime JS assets.
  const ort=name.match(/\/onnxruntime-node\/bin\/napi-v\d+\/([^/]+)\/([^/]+)\//);
  if(ort&&(ort[1]!=='win32'||ort[2]!=='x64'))return true;
  return /\.d\.(ts|mts|cts)$|\.map$|\.tsbuildinfo$/.test(base)
    || /\/(test|tests|__tests__)\//.test(name)
    || /\.(md|mdx)$/i.test(base)
    || /^(README|CHANGELOG|HISTORY|CONTRIBUTING|CODE_OF_CONDUCT)(\..*)?$/i.test(base);
}
