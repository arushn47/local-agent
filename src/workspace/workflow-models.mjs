import { createHash } from 'node:crypto';
import { ROLE_DEFINITIONS, workflowToolMask } from './roles.mjs';

export const workflowAlias = qualified => `localagent/workflow/${createHash('sha256').update(qualified).digest('hex').slice(0,24)}`;

export function workflowCandidates(config,catalog) {
  return config.routingOrder.flatMap(provider=>{
    const entry=catalog.providers?.[provider];
    if(!entry?.enabled||!entry.allowed)return [];
    return (entry.models||[]).flatMap(model=>{
      const cap=entry.capabilities?.[model], details=entry.modelsDetailed?.[model];
      if(!cap?.codingApproved||!cap.tools||!(cap.contextWindow>=32768))return [];
      // Never turn an estimated paid price or unknown tier into authorization.
      if(details && (details.tier!=='free'||details.freeTierVerified!==true||['prompt','completion','request'].some(k=>details.pricing?.[k]!==0)))return [];
      return [{provider,model,qualified:`${provider}/${model}`,alias:workflowAlias(`${provider}/${model}`),context:cap.contextWindow,output:Math.min(cap.maxOutputTokens||config.outputTokens,config.outputTokens)}];
    });
  });
}

export function workflowAgents(privateDirectory) {
  const privateReads={'**/.env*':'deny','**/*credential*':'deny','**/*secret*':'deny','**/.localagent/**':'deny','**/.ssh/**':'deny','**/.aws/**':'deny','**/.npmrc':'deny',[privateDirectory.replaceAll('\\','/')+'/**']:'deny'};
  return Object.fromEntries(Object.values(ROLE_DEFINITIONS).map(role=>{
    const mask=workflowToolMask(role.id);
    return [`localagent-${role.id}`,{mode:'all',hidden:true,prompt:role.systemInstruction,steps:8,tools:mask,
      permission:{'*':'deny',read:{'*':'allow',...privateReads},glob:'allow',grep:'allow',edit:mask.edit?'ask':'deny',write:mask.write?'ask':'deny',bash:mask.bash?'ask':'deny',external_directory:'deny',task:'deny',skill:'deny',webfetch:'deny',websearch:'deny',question:'deny'}}];
  }));
}

export function exactWorkflowModel(qualified,registry,catalog) {
  const selected=registry[qualified];
  if(!selected||selected.qualified!==qualified||selected.alias!==workflowAlias(qualified))throw Error('workflow_model_not_registered');
  const provider=catalog.providers?.[selected.provider];
  if(!provider?.allowed||!provider.enabled||!provider.models?.includes(selected.model))throw Error('workflow_model_unavailable');
  const cap=provider.capabilities?.[selected.model],details=provider.modelsDetailed?.[selected.model];
  if(!cap?.codingApproved||!cap.tools)throw Error('workflow_model_unavailable');
  if(details&&(details.tier!=='free'||details.freeTierVerified!==true||['prompt','completion','request'].some(k=>details.pricing?.[k]!==0)))throw Error('workflow_model_not_free');
  if(selected.provider!=='ollama'&&!(Date.parse(catalog.expiresAt)>Date.now()))throw Error('workflow_catalog_expired');
  return {providerID:'omniroute',modelID:selected.alias};
}
