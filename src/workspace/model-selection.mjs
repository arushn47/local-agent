import {createHash} from 'node:crypto';
import {getAllModels} from './models.mjs';
export const TASK_PURPOSES=Object.freeze({balanced:'General coding',scan:'Project understanding',reasoning:'Planning and difficult debugging',coding:'Implementation',quick:'Small changes and tests'});
export const singleModelAlias=id=>'localagent/model/'+createHash('sha256').update(id).digest('hex').slice(0,24);

export function rankTaskModels(catalog,registry={},purpose='balanced'){
  if(!Object.hasOwn(TASK_PURPOSES,purpose))throw Error('invalid_task_purpose');
  const fresh=Date.parse(catalog?.expiresAt)>Date.now();
  return getAllModels(catalog).filter(m=>m.tier==='free').map(model=>{
    const id=model.qualifiedId,entry=catalog.providers[model.provider],cap=entry.capabilities?.[model.id];
    const free=model.freeTierVerified===true&&['prompt','completion','request'].every(k=>model.pricing?.[k]===0);
    let unavailable=!free?'free_price_unverified':!fresh&&model.provider!=='ollama'?'catalog_expired':!model.tools?'tools_unavailable':!(model.contextWindow>=32768)?'context_too_small':!entry.models?.includes(model.id)||!cap?.codingApproved?'coding_compatibility_unvalidated':!registry[id]?'runtime_refresh_required':null;
    const reasoning=model.supportsReasoning===true;
    const coding=/coder|code/i.test(model.id);
    const context=Math.log2(Math.max(1,model.contextWindow||1));
    // Explicit metadata fit, never a model-quality benchmark or an invented IQ.
    const fit=purpose==='scan'?context:purpose==='reasoning'?(reasoning?100:0)+context:purpose==='coding'?(coding?100:0)+context:purpose==='quick'?(model.provider==='groq'?20:0)+(model.id.includes('lite')?10:0):context+(coding?5:0)+(reasoning?5:0);
    const rationale=purpose==='scan'?'Larger declared context first':purpose==='reasoning'?'Declared reasoning support first, then context':purpose==='coding'?'Coding-specialized model names first, then context':purpose==='quick'?'Groq/lite family preference; latency is unmeasured':'Context, coding specialization and declared reasoning support';
    return {id,name:model.name||model.id,provider:model.provider,contextWindow:model.contextWindow,tools:!!model.tools,supportsReasoning:reasoning,selectable:!unavailable,unavailable,fit,rationale,evidence:'metadata heuristic; coding quality and quota availability are not benchmarked'};
  }).sort((a,b)=>Number(b.selectable)-Number(a.selectable)||b.fit-a.fit||a.id.localeCompare(b.id)).map((model,index)=>({...model,rank:index+1}));
}

export function resolveSingleModel(id,registry,catalog){
  const record=registry[id];
  if(!record||record.qualified!==id||record.alias!==singleModelAlias(id)||`${record.provider}/${record.model}`!==id)throw Error('session_model_not_registered');
  const available=rankTaskModels(catalog,registry).find(m=>m.id===id);
  if(!available?.selectable)throw Error('session_model_unavailable');
  return {providerID:'omniroute',modelID:record.alias};
}
