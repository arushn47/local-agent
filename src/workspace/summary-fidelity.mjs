// Summary-fidelity check for post-compaction continuity. Expectations are
// keyword groups: every group must be matched by the post-compaction answer.
// A match is evidence that a fact survived, never proof that nothing was lost.
export function checkFidelity(answer, expectations) {
  const text = String(answer ?? '').toLowerCase();
  const missing = [];
  for (const expectation of expectations) {
    const label = expectation?.label || 'unnamed';
    const words = Array.isArray(expectation?.any) ? expectation.any.filter(word => String(word).trim()) : [];
    if (!words.length) { missing.push({label, reason:'no_keywords'}); continue; }
    if (!words.some(word => text.includes(String(word).toLowerCase()))) missing.push({label});
  }
  return {passed: missing.length === 0, checked: expectations.length, missing};
}
// Facts the live probe seeds before compaction and then asks for afterwards.
export const LIVE_COMPACTION_EXPECTATIONS = [
  {label:'objective', any:['retry','poll.mjs']},
  {label:'constraints', any:['free']},
  {label:'unresolvedError', any:['timeout']},
  {label:'pendingTask', any:['regression','test']},
  {label:'readFiles', any:['history.txt']},
];
