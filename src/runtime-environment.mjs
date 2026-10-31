// The workspace session belongs only to the worker/native Chromium bootstrap.
// Provider/engine children do not need this separate UI API credential.
export function withoutWorkspaceAuthentication(environment){
  return Object.fromEntries(Object.entries(environment).filter(([name])=>!/^LOCALAGENT_WORKSPACE_COOKIE$/i.test(name)));
}
