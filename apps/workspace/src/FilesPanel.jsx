import { For, Show, createSignal, createEffect } from 'solid-js';
import { api, errorText } from './api';

export function FilesPanel(props) {
  const [subtab, setSubtab] = createSignal('explorer');
  const [files, setFiles] = createSignal([]);
  const [expandedDirs, setExpandedDirs] = createSignal(new Set());
  const [selectedPath, setSelectedPath] = createSignal('');
  const [fileData, setFileData] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  let codeContainer;

  async function loadFiles() {
    if (!props.project?.id) return;
    setLoading(true);
    setError('');
    try {
      const items = await api(`projects/${props.project.id}/files`);
      setFiles(items);
      // Auto-expand top-level directories
      const dirs = new Set();
      for (const item of items) {
        if (item.type === 'directory' && !item.path.includes('/')) {
          dirs.add(item.path);
        }
      }
      setExpandedDirs(dirs);
      // If nothing selected, select first file
      if (!selectedPath()) {
        const firstFile = items.find(i => i.type === 'file');
        if (firstFile) selectFile(firstFile.path);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  async function selectFile(path) {
    if (!props.project?.id || !path) return;
    setSelectedPath(path);
    setError('');
    try {
      const data = await api(`projects/${props.project.id}/files/content?path=${encodeURIComponent(path)}`);
      setFileData(data);
    } catch (e) {
      setFileData({ path, name: path.split('/').pop(), content: `Unable to display file: ${errorText(e)}` });
    }
  }

  createEffect(() => {
    props.project?.id;
    setSelectedPath('');
    setFileData(null);
    void loadFiles();
  });

  createEffect(() => {
    const _theme = props.theme;
    if (fileData() && codeContainer) {
      const active = () => true;
      void import('./highlight.mjs').then((m) => m.highlightCode(codeContainer, active)).catch(() => {});
    }
  });

  function toggleDir(dirPath) {
    const next = new Set(expandedDirs());
    if (next.has(dirPath)) next.delete(dirPath);
    else next.add(dirPath);
    setExpandedDirs(next);
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  const visibleFiles = () => {
    if (subtab() === 'changed') {
      return (props.diffs || []).map(d => ({
        path: d.file,
        name: d.file.split(/[/\\]/).pop(),
        type: 'file',
        changed: true,
        additions: d.additions,
        deletions: d.deletions
      }));
    }
    const result = [];
    const expanded = expandedDirs();
    for (const item of files()) {
      const parts = item.path.split('/');
      if (parts.length === 1) {
        result.push({ ...item, depth: 0 });
      } else {
        const parentDir = parts.slice(0, -1).join('/');
        let isVisible = true;
        let testDir = '';
        for (let i = 0; i < parts.length - 1; i++) {
          testDir = testDir ? `${testDir}/${parts[i]}` : parts[i];
          if (!expanded.has(testDir)) {
            isVisible = false;
            break;
          }
        }
        if (isVisible) {
          result.push({ ...item, depth: parts.length - 1 });
        }
      }
    }
    return result;
  };

  const codeLines = () => {
    if (!fileData()?.content) return [];
    return fileData().content.split('\n');
  };

  const getLanguage = (filename) => {
    if (!filename) return 'text';
    const ext = filename.split('.').pop().toLowerCase();
    const map = { js: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', jsx: 'javascript', json: 'json', css: 'css', html: 'html', py: 'python', sh: 'bash', bash: 'bash' };
    return map[ext] || 'text';
  };

  return (
    <div class="files-panel">
      <div class="subtabs">
        <button
          type="button"
          aria-pressed={subtab() === 'explorer'}
          onClick={() => setSubtab('explorer')}
        >
          EXPLORER
        </button>
        <button
          type="button"
          aria-pressed={subtab() === 'changed'}
          onClick={() => setSubtab('changed')}
        >
          CHANGED ({props.diffs?.length || 0})
        </button>
        <span class="spacer" />
        <span class="subtab-meta">read-only view</span>
      </div>

      <div class="files-layout">
        <div class="tree" role="region" aria-label="Project files">
          <Show when={loading()}>
            <div class="tree-loading">Loading project files…</div>
          </Show>
          <Show when={error()}>
            <div class="tree-error">{error()}</div>
          </Show>
          <For each={visibleFiles()}>
            {(item) => (
              <div
                class={'tree-row ' + (item.type === 'directory' ? 'dir ' : '') + (selectedPath() === item.path ? 'sel' : '')}
                style={{ 'padding-left': `${(item.depth || 0) * 14 + 8}px` }}
                onClick={() => (item.type === 'directory' ? toggleDir(item.path) : selectFile(item.path))}
                role="button"
                tabindex="0"
                aria-label={item.name + (item.type === 'directory' ? ' folder' : ' file')}
              >
                <Show when={item.type === 'directory'}>
                  <span class="caret2">{expandedDirs().has(item.path) ? '▾' : '▸'}</span>
                </Show>
                <span class="tree-name">{item.name}</span>
                <Show when={item.changed}>
                  <span class="sz stat-changed">
                    <Show when={item.additions}><span class="add">+{item.additions}</span> </Show>
                    <Show when={item.deletions}><span class="del">−{item.deletions}</span></Show>
                  </span>
                </Show>
                <Show when={!item.changed && item.type === 'file' && item.size !== undefined}>
                  <span class="sz">{formatSize(item.size)}</span>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class="viewer">
          <div class="viewer-head">
            <span class="viewer-filename">{fileData()?.path || selectedPath() || 'No file selected'}</span>
            <Show when={fileData()}>
              <span class="viewer-meta">{formatSize(fileData()?.size)}</span>
            </Show>
            <div class="viewer-acts">
              <button
                type="button"
                class="btn-sm"
                onClick={() => props.onEditViaAgent?.(`Check ${selectedPath()} and `)}
              >
                Edit via agent
              </button>
            </div>
          </div>

          <div class="viewer-code-wrapper" ref={codeContainer}>
            <Show when={fileData()} fallback={<div class="viewer-empty">Select a file from the explorer to view its contents.</div>}>
              <pre class="code" role="region" aria-label="File contents, read only">
                <code class={'language-' + getLanguage(fileData()?.name)}>
                  <For each={codeLines()}>
                    {(line, index) => (
                      <div class="code-line">
                        <span class="line-num">{index() + 1}</span>
                        <span class="line-text">{line || ' '}</span>
                      </div>
                    )}
                  </For>
                </code>
              </pre>
            </Show>
          </div>
        </div>
      </div>

      <div class="panel-foot">
        <span>Scoped to this project · symlinks and secrets excluded</span>
        <button
          type="button"
          class="btn-sm"
          onClick={() => {
            if (selectedPath()) navigator.clipboard?.writeText(selectedPath());
          }}
        >
          Copy path
        </button>
      </div>
    </div>
  );
}
