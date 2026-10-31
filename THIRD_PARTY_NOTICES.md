# Third-party notices

LocalAgent reuses these pinned runtimes. Their notices are retained below; existing bundled transitive license/notice files remain in node_modules. The Phase 5 inventory found missing declarations/notices and unresolved distribution obligations, so this candidate is not cleared for public distribution. See docs/RELEASE.md and validation/phase5/licenses.json; metadata is not legal clearance.

## OpenCode 1.18.31

MIT License

Copyright (c) 2025 opencode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## OmniRoute 3.8.52

MIT License

Copyright (c) 2026 diegosouzapw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Solid 1.9.17

Bundled workspace UI runtime; MIT license:
MIT License

Copyright (c) 2016-2025 Ryan Carniato

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


The version-matched @opencode-ai/sdk 1.18.31 and vendored OpenCode window-state helper are MIT-licensed under the OpenCode notice above. The gateway is rebuilt from official source using Next 16.4.3 (MIT), with its own dependency notices retained.

Desktop distribution includes Electron 42.11.18 (MIT plus Chromium/third-party notices in its distribution) and Node 24.22.1 (Node's complete LICENSE is included beside node.exe). Keep Electron's LICENSE.electron.txt and LICENSES.chromium.html. LocalAgent's icon is an original generated vector/canvas composition.

Phase 4 also distributes playwright-core 1.62.1 (Apache-2.0, Microsoft Corporation) for local browser inspection, and yazl 3.3.1 (MIT, Josh Wolfe) for filtered source export. Their complete LICENSE/NOTICE files remain in the packaged runtime's node_modules/playwright-core and node_modules/yazl directories. Desktop inspection reuses Electron's Chromium, without an additional browser download or paid evaluator.

Build-only tools include electron-builder 26.15.3 (MIT), Bun 1.3.14 (MIT), Vite 7.3.7 (MIT), vite-plugin-solid 2.11.10 (MIT), and Playwright 1.62.1 (Apache-2.0). Retain their packaged notices if distributing them. No paid design library, external font asset or React UI runtime was added to LocalAgent; OmniRoute retains its upstream React dependencies.

Phase 5 uses axe-core 4.14.0 (MPL-2.0) only as a development auditor; it is not included in the desktop payload. KaTeX resolves to 0.18.2 under the security override, retaining its MIT notices. The Windows payload omits postinstall duplicate OpenCode executables, ONNX native binaries for other platforms/architectures and unused Electron locales; it retains license files even inside omitted-platform directories. No paid artwork/font asset was added.

Before publication, resolve undeclared @splinetool/runtime and @giscus/react metadata, root notice gaps, sharp/libvips LGPL/source/relinking obligations, caniuse-lite attribution, and embedded Electron/Chromium/OpenCode/Bun/native-Rust obligations. Khroma's included license is MIT despite missing package metadata. Optional OpenCode binary-package metadata inherits the upstream OpenCode distribution notice; its duplicate executables are omitted. LocalAgent's own distribution license and public name still require an owner decision.

Phase 5.1 clarifies unresolved obligations in docs/LICENSE_REVIEW.md. Spline runtime permission remains unverified; no permission is inferred from its React wrapper. No dependency was removed or relicensed.

Phase 5.2's reduced backend artifact excludes external Spline, Giscus, Lobe UI, Ant Design and Monaco packages. Next's React framework peers remain; LocalAgent's interface stays Solid. Earlier candidate obligations above are historical and are not cleared retroactively. Exact Bun 1.3.14, JavaScriptCore and TinyCC notices/build provenance and Sharp/libvips notices are supplied under docs/third-party. Corresponding-source, native dependency and relinking review is incomplete; see docs/LICENSE_REVIEW.md. No own-project license is selected by these notices.


## Phase 6.3 browser rendering dependencies

New source UI builds directly use the existing locked Marked 15.0.12 (MIT), DOMPurify 3.4.17 (MPL-2.0 OR Apache-2.0) and Shiki 4.5.0 (MIT). Full license texts remain at node_modules/marked/LICENSE.md, node_modules/dompurify/LICENSE and node_modules/shiki/LICENSE. Include these and Shiki grammar/transitive notices in any new bundle distribution. Existing binary installers predate this source checkpoint. This inventory is not distribution clearance or a selection of LocalAgent's own license.
