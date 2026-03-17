import { useState, useEffect } from 'react';

/* ── Theme detection hook ───────────────────────────────── */
export function useAppTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(t);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export const EXT_TO_LANGUAGE = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  json: 'json', jsonc: 'json',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', mdx: 'markdown',
  py: 'python', pyw: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql',
  xml: 'xml', svg: 'xml',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  dockerfile: 'dockerfile',
  graphql: 'graphql', gql: 'graphql',
  vue: 'html',
  makefile: 'shell',
};

export function getLanguageFromFilename(filename) {
  if (!filename) return 'plaintext';
  const lower = filename.toLowerCase();
  // Handle special filenames
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile' || lower === 'gnumakefile') return 'shell';
  const ext = lower.split('.').pop();
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

/* ── Helper: fade the wrapper in via direct DOM ── */
export function fadeInWrapper(el) {
  if (!el) return;
  // Start invisible
  el.style.transition = 'none';
  el.style.opacity = '0';
  // Force the browser to commit opacity:0
  void el.offsetHeight;
  // Now transition to visible
  el.style.transition = 'opacity 200ms ease-out';
  el.style.opacity = '1';
}
