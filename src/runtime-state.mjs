const stages = new Set(['starting','runtime_readiness','catalog_discovery','authentication_and_configuration','ready','stopped','failed']);
export function createRuntimeState() {
  let state = { stage:'starting', ready:false, code:null };
  return {
    set(stage, code = null) {
      if (!stages.has(stage)) throw new Error('invalid_runtime_stage');
      state = { stage, ready:stage === 'ready', code };
    },
    snapshot: () => ({ apiVersion:1, ...state }),
  };
}
