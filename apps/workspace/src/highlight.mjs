import {createHighlighterCore} from 'shiki/core';
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript';
import themeDark from 'shiki/themes/github-dark.mjs';
import themeLight from 'shiki/themes/github-light.mjs';
import javascript from 'shiki/langs/javascript.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import json from 'shiki/langs/json.mjs';
import css from 'shiki/langs/css.mjs';
import html from 'shiki/langs/html.mjs';
import python from 'shiki/langs/python.mjs';
import bash from 'shiki/langs/bash.mjs';

const highlighter = createHighlighterCore({
  themes: [themeDark, themeLight],
  langs: [javascript, typescript, json, css, html, python, bash],
  engine: createJavaScriptRegexEngine()
});

export async function highlightCode(root, isCurrent, theme = 'github-dark') {
  const h = await highlighter;
  for (const code of root.querySelectorAll('pre > code')) {
    if (!isCurrent()) return;
    const lines = [...code.querySelectorAll('.line-text')];
    const source = lines.length ? lines.map(line => line.textContent).join('\n') : code.textContent;
    const lang = code.className.replace('language-', '');
    if (source.length > 8000 || !h.getLoadedLanguages().includes(lang)) continue;
    const activeTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'github-light' : 'github-dark';
    const {tokens} = h.codeToTokens(source, {lang, theme: activeTheme});
    const fragment = document.createDocumentFragment();
    tokens.forEach((line, index) => {
      const target = lines.length ? document.createDocumentFragment() : fragment;
      if (index && !lines.length) fragment.append('\n');
      for (const token of line) {
        const span = document.createElement('span');
        span.textContent = token.content;
        let c = token.color;
        if (c && c.toUpperCase() === '#6A737D') {
          c = activeTheme === 'github-light' ? '#57606a' : '#9da7b3';
        }
        span.style.color = c;
        target.append(span);
      }
      if (lines[index]) lines[index].replaceChildren(target);
    });
    if (!lines.length) code.replaceChildren(fragment);
  }
}
