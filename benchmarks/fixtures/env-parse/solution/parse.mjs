export function parseEnv(line) {
  const index = line.indexOf('=');
  if (index < 0) return {key: line.trim(), value: ''};
  const key = line.slice(0, index).trim();
  let value = line.slice(index + 1).trim();
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    value = value.slice(1, -1);
  }
  return {key, value};
}
