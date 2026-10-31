export const formatAmount = cents => {
  const sign = cents < 0 ? -1 : 1;
  const absolute = Math.abs(cents);
  const text = String(Math.floor(absolute / 100)) + '.' + String(absolute % 100).padStart(2, '0');
  return sign < 0 ? '(' + text + ')' : text;
};
