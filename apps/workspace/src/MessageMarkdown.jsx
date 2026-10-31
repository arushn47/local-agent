import {createEffect,onCleanup} from 'solid-js';
import DOMPurify from 'dompurify';
import {markdownHtml} from './markdown.mjs';

export function Markdown(props) {
 let root,revision=0;
 onCleanup(()=>revision++);
 createEffect(()=>{
   const text = props.text, theme = props.theme, version = ++revision;
   root.innerHTML=DOMPurify.sanitize(markdownHtml(text),{
     ALLOWED_TAGS:['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','pre','code','a','span','table','thead','tbody','tr','th','td'],
     ALLOWED_ATTR:['href','target','rel','class','start'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,
   });
   // A focusable, scrollable code block needs a named role so screen readers
   // announce it; a bare aria-label on a generic element is not reliably exposed.
   for(const pre of root.querySelectorAll('pre')){pre.tabIndex=0;pre.setAttribute('role','group');pre.setAttribute('aria-label','Code block');}
   if(root.querySelector('pre > code'))void import('./highlight.mjs').then(m=>m.highlightCode(root,()=>revision===version)).catch(()=>{});
 });
 return <div ref={root} class="message-text markdown"/>;
}
