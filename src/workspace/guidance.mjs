// Ambient execution guidance for small free models. Upstream reads the global
// AGENTS.md at <config>/opencode/AGENTS.md, so this file adds instructions
// without a new request, a second prompt pipeline or a permission change.
// Opt-in: nothing is written unless the owner enables executionGuidance.
export const GUIDANCE_MARKER = '<!-- localagent-guidance v1 -->';

export function guidanceText() {
  return `${GUIDANCE_MARKER}
You are a coding agent working in a real project. Be efficient and literal.

Work:
- Find code with targeted search or grep instead of reading whole files.
- Read only the section you need. Never read the same unchanged file twice.
- Inspect before editing; prefer small targeted edits over rewrites.
- Run the narrowest relevant test, then the wider suite only if it changes behavior.
- Keep tool output small: ask for head/tail or quiet modes, not whole files or logs.
- Never repeat a command that already failed unchanged; change the approach or report it.

Progress:
- Before a longer task, state the objective, the next step and what remains.
- After each meaningful step, keep a one-line checkpoint of what changed and what is left.
- If interrupted, resume from the checkpoint instead of restarting finished work.

Honesty:
- Do not claim a test passed unless it ran and passed; show the command and result.
- If a command fails, report the failing command and the first useful error line.
- Do not modify unrelated files, and never print or commit credentials.
`;
}

// Conservative truncation for small contexts. Upstream saves the full output to
// disk and leaves a marker, so nothing is lost permanently.
export const TOOL_OUTPUT_LIMITS = { max_lines: 600, max_bytes: 16384 };

export function toolOutputLimits(enabled) {
  return enabled === true ? { ...TOOL_OUTPUT_LIMITS } : null;
}

export function guidancePath(profileDirectory) {
  return `${profileDirectory}/config/opencode/AGENTS.md`.replaceAll('\\', '/');
}

// Writes or removes only LocalAgent's own file. A file without our marker is
// never deleted or overwritten.
export async function prepareGuidance({ profileDirectory, enabled, fs } = {}) {
  const io = fs || await import('node:fs');
  const path = guidancePath(profileDirectory);
  const existing = io.existsSync(path) ? io.readFileSync(path, 'utf8') : null;
  if (!enabled) {
    if (existing?.startsWith(GUIDANCE_MARKER)) io.rmSync(path, { force: true });
    return { path, active: false };
  }
  if (existing !== null && !existing.startsWith(GUIDANCE_MARKER)) return { path, active: false, skipped: true };
  if (existing !== guidanceText()) {
    io.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    io.writeFileSync(path, guidanceText(), { mode: 0o600 });
  }
  return { path, active: true };
}
