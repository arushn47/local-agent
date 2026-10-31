import {Marked} from 'marked';

const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeLink(href) {
  try {const url=new URL(href);return ['https:','http:','mailto:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
// Reuse upstream's parser, but never interpret model-supplied HTML or fetch images.
const parser=new Marked({gfm:true,renderer:{
  html:token=>escape(token.text),
  image:token=>`<span>[Image: ${escape(token.text)}]</span>`,
  link(token){const text=this.parser.parseInline(token.tokens);const href=safeLink(token.href);return href?`<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`:text;},
}});
export const markdownHtml=text=>parser.parse(String(text||'').slice(0,16000));
