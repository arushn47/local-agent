import {createSignal,For,Show} from 'solid-js';
export function ChatQueue(props){
  const [editing,setEditing]=createSignal(null),[text,setText]=createSignal('');
  return <Show when={props.session?.queue?.length}><section class="chat-queue" aria-label="Queued messages">
    <div class="queue-heading"><strong>Queued ({props.session.queue.length})</strong><span>{props.session.queuePaused?'Held · resume to send':'Sends after successful completion'}</span><button type="button" disabled={props.busy} onClick={()=>props.onAction({action:props.session.queuePaused?'resume':'pause'})}>{props.session.queuePaused?'Resume queue':'Hold queue'}</button></div>
    <For each={props.session.queue}>{item=><article class="queued-message" aria-label="Queued message">
      <Show when={editing()===item.id} fallback={<p>{item.text}</p>}><textarea aria-label="Edit queued message" value={text()} maxlength="16000" onInput={e=>setText(e.currentTarget.value)}/><button type="button" disabled={props.busy} onClick={async()=>{await props.onAction({action:'edit',messageId:item.id,text:text()});setEditing(null);}}>Save message</button><button type="button" onClick={()=>setEditing(null)}>Cancel edit</button></Show>
      <Show when={item.state==='queued'} fallback={<span role="status">{item.state==='uncertain'?'Delivery uncertain. Inspect chat history before removing; it will not be resent.':'Sending…'}</span>}>
        <button type="button" disabled={props.busy} onClick={()=>props.onAction({action:'steer',messageId:item.id})} title="Send guidance to the current run at its next input boundary">Steer now</button>
        <button type="button" disabled={props.busy} onClick={()=>{setText(item.text);setEditing(item.id);}}>Edit message</button>
      </Show>
      <button type="button" disabled={props.busy||item.state==='dispatching'} onClick={()=>props.onAction({action:'remove',messageId:item.id})}>Remove</button>
    </article>}</For>
    <p>Steering sends immediately to OpenCode; an in-progress tool may finish before it reads the guidance. Stop or errors hold the queue. Restart requires resume.</p>
  </section></Show>;
}
