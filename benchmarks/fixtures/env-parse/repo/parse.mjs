export function parseEnv(line) {
  const index = line.indexOf('=');
  if (index < 0) return {key: line, value: ''};
  return {key: line.slice(0, index), value: line.slice(index + 1)};
}
