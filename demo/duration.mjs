export const TASK_MARKER = 'copper-heron-472';

export function parseDuration(text) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('Expected a duration string');
  const units = { ms: 1, s: 1000, m: 60000, h: 3600000 };
  const input = text.trim();
  const component = /\s*(\d+(?:\.\d+)?|\.\d+)\s*(ms|s|m|h)\s*/iy;
  let position = 0;
  let total = 0;
  while (position < input.length) {
    component.lastIndex = position;
    const match = component.exec(input);
    if (!match) throw new TypeError('Invalid duration');
    total += Number(match[1]) * units[match[2].toLowerCase()];
    position = component.lastIndex;
  }
  return total;
}
