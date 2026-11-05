export function commandOutcome(tool) {
  if (tool.status === 'error') return { kind:'fail', label:typeof tool.exit === 'number' ? `exit ${tool.exit}` : 'failed' };
  if (tool.status === 'completed') {
    if (tool.exit === 0) return {kind:'pass',label:'exit 0'};
    if (typeof tool.exit === 'number') return {kind:'fail',label:`exit ${tool.exit}`};
    return {kind:'unknown',label:'finished · exit unknown'};
  }
  return {kind:'busy',label:tool.status === 'pending' ? 'pending' : 'running'};
}

export const isTestCommand = command => /^(?:(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+test(?::[\w-]+)?|node\s+--test|(?:python(?:3)?\s+-m\s+)?pytest|cargo\s+test|go\s+test|(?:npx\s+)?(?:vitest|jest))(?:\s|$)/i.test(command.trim());
