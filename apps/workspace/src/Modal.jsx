import { onMount, onCleanup } from 'solid-js';
export function Modal(props){let element,previous;
  onMount(()=>{previous=props.returnFocus||document.activeElement;queueMicrotask(()=>element.querySelector('#provider-key, [autofocus], input:not(:disabled), textarea:not(:disabled), button:not(:disabled)')?.focus());});
  onCleanup(()=>{queueMicrotask(()=>{const target=previous?.isConnected?previous:document.querySelector('.nav-item[aria-current="page"]');target?.focus();});});
  function keydown(e){
    if(e.key==='Escape'&&!props.busy){e.preventDefault();props.onClose();}
    if(e.key!=='Tab')return;
    const focusable=[...element.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(e=>e.getClientRects().length&&!e.inert);
    const first=focusable[0],last=focusable.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
  return <div ref={element} class="modal-backdrop" onKeyDown={keydown} onClick={e=>{if(e.target===e.currentTarget&&!props.busy)props.onClose();}}>{props.children}</div>;
}
