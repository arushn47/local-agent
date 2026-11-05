import {createEffect,createSignal,For,Show} from 'solid-js';
import {api,errorText} from './api';
import {Modal} from './Modal';
const purposes={balanced:'General coding',scan:'Project understanding',reasoning:'Planning / difficult debugging',coding:'Implementation',quick:'Small changes / tests'};
export function ModelPicker(props){
  const [purpose,setPurpose]=createSignal('balanced'),[models,setModels]=createSignal([]),[open,setOpen]=createSignal(false),[error,setError]=createSignal('');
  let revision=0;
  createEffect(()=>{setPurpose(props.session?.purpose||'balanced');});
  createEffect(()=>{const value=purpose(),generation=++revision;void api('model-options?purpose='+value).then(result=>{if(generation===revision)setModels(result.models||[]);}).catch(()=>{if(generation===revision)setModels([]);});});
  async function choose(modelId){setError('');try{await props.onSelect(modelId,purpose());}catch(e){setError(errorText(e));}}
  return <div class="model-controls">
    <label>Task type <select aria-label="Task type" value={purpose()} disabled={props.busy} onChange={e=>setPurpose(e.currentTarget.value)}><For each={Object.entries(purposes)}>{([id,label])=><option value={id}>{label}</option>}</For></select></label>
    <label>Model <select aria-label="Coding model" value={props.session?.modelId||'auto'} disabled={props.busy} onChange={e=>void choose(e.currentTarget.value)}>
      <option value="auto">Automatic free route</option><option value="recommended" disabled={!models().some(m=>m.selectable)}>Recommended for task type</option>
      <For each={models().filter(m=>m.selectable)}>{m=><option value={m.id}>{m.name} · {Math.round(m.contextWindow/1024)}K · {m.provider}</option>}</For>
      <Show when={props.session?.modelId&&!['auto','recommended'].includes(props.session.modelId)&&!models().some(m=>m.selectable&&m.id===props.session.modelId)}><option value={props.session.modelId}>{props.session.modelId} · unavailable</option></Show>
    </select></label>
    <button type="button" class="btn-sm" onClick={()=>setOpen(true)}>Compare free models ({models().length})</button>
    <Show when={error()}><p role="alert">{error()}</p></Show>
    <Show when={open()}><Modal onClose={()=>setOpen(false)}><section class="modal model-comparison" role="dialog" aria-modal="true" aria-labelledby="models-title"><button type="button" class="modal-close" aria-label="Close model comparison" onClick={()=>setOpen(false)}>×</button><h2 id="models-title">Free models for {purposes[purpose()]}</h2><p>All discovered free candidates are ranked. Order reflects metadata fit, not measured coding quality or guaranteed quota. Unvalidated models stay unavailable for coding.</p><div class="model-table"><table><thead><tr><th>Rank / model</th><th>Context</th><th>Availability / reason</th></tr></thead><tbody><For each={models()}>{m=><tr><td>{m.rank}. {m.name}<br/><code>{m.id}</code></td><td>{m.contextWindow?.toLocaleString()||'Unknown'}</td><td>{m.selectable?'Ready':m.unavailable}<br/>{m.rationale}</td></tr>}</For></tbody></table><Show when={!models().length}><p>Connect a free provider and refresh its metadata. No inference is used for discovery.</p></Show></div></section></Modal></Show>
  </div>;
}
