import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { omniRoot, stateDir, secrets, urls, requestJSON, guardToken } from './config.mjs';
import { compilePlan } from './routing.mjs';
import { compactionSettings } from './context.mjs';
import { toolOutputLimits } from './workspace/guidance.mjs';
import { workflowCandidates } from './workspace/workflow-models.mjs';

export async function management(config) {
  const { getCliToken, CLI_TOKEN_HEADER } = await import(pathToFileURL(join(omniRoot, 'bin/cli/utils/cliToken.mjs')).href);
  const response = await fetch(urls(config).gateway + '/api/auth/login', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: secrets().password }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`OmniRoute login failed: HTTP ${response.status}`);
  const headers = { [CLI_TOKEN_HEADER]: await getCliToken(), Cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
  return async (path, options = {}) => {
    const request = method => requestJSON(urls(config).gateway + path, { ...options, method: method || options.method, headers: { ...headers, ...options.headers } });
    try { return await request(); }
    catch (error) {
      // 3.8.50 ships some PUT routes while its generated CLI describes PATCH.
      if (options.method === 'PATCH' && error.message.endsWith('HTTP 405')) return request('PUT');
      throw error;
    }
  };
}
function list(data, field) { return Array.isArray(data) ? data : data[field] || []; }
// A slash inside an upstream model name must not be mistaken for its provider.
export const qualifyModel = (providerId, model) => `${providerId}/${model}`;
export async function registerWorkflowAttempt(config,{id,provider,model},{managementAPI}={}){
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('invalid_workflow_scope');
  const api=managementAPI||await management(config),name=`LocalAgent attempt ${id}`,baseUrl=`${urls(config).guard}/workflow-egress/${provider}/${id}/v1`;
  const nodeData=await api('/api/provider-nodes',{method:'POST',body:{name,prefix:'la-'+id.slice(0,20),apiType:'chat',type:'openai-compatible',baseUrl}}),node=nodeData.node||nodeData;
  const connectionData=await api('/api/providers',{method:'POST',body:{name,provider:node.id,apiKey:guardToken(secrets(),`workflow:${provider}`),providerSpecificData:{baseUrl},defaultModel:model}}),connection=connectionData.connection||connectionData;
  await api('/api/providers/'+connection.id+'/sync-models',{method:'POST',body:{}});
  const alias='localagent/attempt/'+id,target={model:qualifyModel(node.id,model),providerId:node.id,connectionId:connection.id};
  await api('/api/combos',{method:'POST',body:{name:alias,strategy:'priority',models:[target],config:{disableSessionStickiness:true}}});
  const keyData=await api('/api/keys',{method:'POST',body:{name,noLog:true,modelAccessMode:'restricted',allowedModels:[target.model],allowedCombos:[alias],allowedConnections:[connection.id]}});
  const key=keyData.key||keyData.apiKey?.key||keyData.apiKey;
  if(typeof key!=='string')throw Error('workflow_gateway_key_unavailable');
  return {alias,key,disable:async()=>{const keys=list(await api('/api/keys'),'keys'),meta=keys.find(k=>k.name===name);if(meta)await api('/api/keys/'+meta.id,{method:'PATCH',body:{isActive:false}});}};
}
export async function configureGateway(config, catalog, { managementAPI } = {}) {
  const plan = compilePlan(config, catalog);
  const api = managementAPI || await management(config); const secret = secrets();
  const nodes = list(await api('/api/provider-nodes'), 'nodes');
  const connections = list(await api('/api/providers'), 'connections');
  const targets = []; const routes = {}; const codingCaps = []; 
  for (const provider of config.routingOrder) {
    const entry = catalog.providers[provider];
    if (!entry?.enabled || !entry.allowed || !entry.models.length) continue;
    const name = `LocalAgent ${provider}`;
    const baseUrl = `${urls(config).guard}/egress/${provider}/v1`;
    let node = nodes.find(n => n.name === name);
    if (!node) { const created = await api('/api/provider-nodes', { method: 'POST', body: { name, prefix: `localagent-${provider}`, apiType: 'chat', type: 'openai-compatible', baseUrl } }); node = created.node || created; }
    else if (node.baseUrl !== baseUrl) await api('/api/provider-nodes/' + node.id, { method: 'PATCH', body: { baseUrl } });
    let connection = connections.find(c => c.name === name);
    const connectionBody = { provider: node.id, name, apiKey: guardToken(secret, provider), providerSpecificData: { baseUrl }, defaultModel: entry.models[0] };
    if (!connection) { const created = await api('/api/providers', { method: 'POST', body: connectionBody }); connection = created.connection || created; }
    else await api('/api/providers/' + connection.id, { method: 'PATCH', body: connectionBody });
    await api('/api/providers/' + connection.id + '/sync-models', { method: 'POST', body: {} });
    for (const model of entry.models) { const cap = entry.capabilities?.[model]; if (plan.targets.some(t => t.provider === provider && t.model === model)) { targets.push({ model: qualifyModel(node.id, model), providerId: node.id, connectionId: connection.id }); codingCaps.push(cap.contextWindow); } }
    routes[provider] = { nodeId: node.id, connectionId: connection.id, models: entry.models };
  }
  const codingContext = codingCaps.length ? Math.min(...codingCaps) : 32768;
  const combos = list(await api('/api/combos'), 'combos');
  const workflowModels={},workflowTargets=[];
  for(const provider of config.routingOrder){
    const candidates=workflowCandidates(config,catalog).filter(c=>c.provider===provider);
    if(!candidates.length)continue;
    const name=`LocalAgent Workflow ${provider}`,baseUrl=`${urls(config).guard}/workflow-egress/${provider}/v1`;
    let node=nodes.find(n=>n.name===name);
    if(!node){const data=await api('/api/provider-nodes',{method:'POST',body:{name,prefix:`localagent-workflow-${provider}`,apiType:'chat',type:'openai-compatible',baseUrl}});node=data.node||data;}
    else if(node.baseUrl!==baseUrl)await api('/api/provider-nodes/'+node.id,{method:'PATCH',body:{baseUrl}});
    let connection=connections.find(c=>c.name===name);
    const body={provider:node.id,name,apiKey:guardToken(secret,`workflow:${provider}`),providerSpecificData:{baseUrl},defaultModel:candidates[0].model};
    if(!connection){const data=await api('/api/providers',{method:'POST',body});connection=data.connection||data;}
    else await api('/api/providers/'+connection.id,{method:'PATCH',body});
    await api('/api/providers/'+connection.id+'/sync-models',{method:'POST',body:{}});
    for(const candidate of candidates){
      const existing=combos.find(c=>c.name===candidate.alias);
      const target={model:qualifyModel(node.id,candidate.model),providerId:node.id,connectionId:connection.id};
      await api(existing?'/api/combos/'+existing.id:'/api/combos',{method:existing?'PATCH':'POST',body:{name:candidate.alias,strategy:'priority',context_length:candidate.context,models:[target],config:{disableSessionStickiness:true}}});
      workflowModels[candidate.qualified]=candidate;workflowTargets.push({...target,alias:candidate.alias});
    }
  }
  const existing = combos.find(c => c.name === 'localagent/coding');
  if(targets.length) await api(existing ? '/api/combos/' + existing.id : '/api/combos', { method: existing ? 'PATCH' : 'POST', body: { name: 'localagent/coding', strategy: 'priority', context_length: codingContext, models: targets, config: { disableSessionStickiness: false } } });
  else if(existing) await api('/api/combos/'+existing.id,{method:'DELETE'});
  for (const [provider, route] of Object.entries(routes)) {
    const name = `localagent/check/${provider}`;
    const existingCheck = combos.find(c => c.name === name);
    await api(existingCheck ? '/api/combos/' + existingCheck.id : '/api/combos', { method: existingCheck ? 'PATCH' : 'POST', body: { name, strategy: 'priority', context_length: codingContext, models: [{ model: qualifyModel(route.nodeId, route.models[0]), providerId: route.nodeId, connectionId: route.connectionId }], config: { disableSessionStickiness: true } } });
  }
  await api('/api/settings', { method: 'PATCH', body: { requireApiKey: true, promptCacheAffinityEnabled: false } });
  await api('/api/resilience', { method: 'PATCH', body: { requestQueue: { maxWaitMs: 600000 }, comboCooldownWait: { enabled: false }, waitForCooldown: { enabled: false } } });
  const keyPath = join(stateDir, 'gateway-key.json');
  let apiKey;
  try { apiKey = JSON.parse(readFileSync(keyPath, 'utf8')).key; } catch {}
  if (!apiKey) {
    // Upstream createKeySchema rejects an explicit empty connection list.
    // Empty onboarding has no providers; deactivate the key below until a
    // coding plan exists, using upstream's supported permission mechanism.
    const allowedConnections = [...new Set(targets.map(t => t.connectionId))];
    const created = await api('/api/keys', { method: 'POST', body: { name: 'LocalAgent OpenCode', noLog: true, ...(allowedConnections.length ? { allowedConnections } : {}) } });
    apiKey = created.key || created.apiKey?.key || created.apiKey;
    if (typeof apiKey !== 'string') throw new Error('Unexpected OmniRoute API key response; no key printed');
    writeFileSync(keyPath, JSON.stringify({ key: apiKey }), { mode: 0o600 });
  }
  const keys = list(await api('/api/keys'), 'keys');
  const keyMetadata = keys.find(k => k.name === 'LocalAgent OpenCode');
  if (!keyMetadata?.id) throw new Error('LocalAgent inference key metadata is missing');
  await api('/api/keys/' + keyMetadata.id, { method: 'PATCH', body: { isActive: targets.length+workflowTargets.length > 0, modelAccessMode: 'restricted', allowedModels: [...targets,...workflowTargets].map(t => t.model), allowedCombos: [...(targets.length ? ['localagent/coding', ...Object.keys(routes).map(p => `localagent/check/${p}`)] : []),...workflowTargets.map(t=>t.alias)], allowedConnections: [...new Set([...targets,...workflowTargets].map(t => t.connectionId))], noLog: true } });
  writeFileSync(join(stateDir,'workflow-models.json'),JSON.stringify(workflowModels,null,2),{mode:0o600});
  writeFileSync(join(stateDir, 'routes.json'), JSON.stringify(routes, null, 2));
  writeFileSync(join(stateDir, 'route-plan.json'), JSON.stringify(plan, null, 2));
  // Upstream automatic compaction must fire before the guard's byte bound rejects
  // the same request, otherwise the guard stops the task and compaction never runs.
  const compaction = compactionSettings(codingContext, config.outputTokens);
  // Opt-in: bound tool output so one large read cannot consume a small free
  // context. Upstream still saves the full text to disk with a marker.
  const toolOutput = toolOutputLimits(config.executionGuidance);
  const generated = { '$schema': 'https://opencode.ai/config.json', model: 'omniroute/localagent/coding', small_model: 'omniroute/localagent/coding', enabled_providers: ['omniroute'], autoupdate: false, share: 'disabled', ...(compaction ? { compaction } : {}), ...(toolOutput ? { tool_output: toolOutput } : {}), provider: { omniroute: { npm: '@ai-sdk/openai-compatible', name: 'LocalAgent', options: { baseURL: urls(config).gateway + '/v1', apiKey: '{env:LOCALAGENT_GATEWAY_KEY}', timeout: 600000 }, models: { 'localagent/coding': { name: 'LocalAgent free coding', tool_call: true, limit: { context: codingContext, output: config.outputTokens } } } } } };
  for(const candidate of Object.values(workflowModels))generated.provider.omniroute.models[candidate.alias]={name:`LocalAgent exact ${candidate.qualified}`,tool_call:true,limit:{context:candidate.context,output:candidate.output}};
  writeFileSync(join(stateDir, 'opencode.json'), JSON.stringify(generated, null, 2));
  return { targets: plan.targets, excluded: plan.excluded, gateway: urls(config).gateway };
}
