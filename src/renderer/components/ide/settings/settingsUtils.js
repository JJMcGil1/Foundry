import { FiUser, FiMoon, FiGithub, FiGlobe, FiCpu, FiFolder } from 'react-icons/fi';

export const SECTIONS = [
  { id: 'account', label: 'Account', icon: FiUser },
  { id: 'workspace', label: 'Workspace', icon: FiFolder },
  { id: 'providers', label: 'Providers', icon: FiCpu },
  { id: 'github', label: 'GitHub', icon: FiGithub },
  { id: 'appearance', label: 'Appearance', icon: FiMoon },
  { id: 'about', label: 'About', icon: FiGlobe },
];

// Fallback model list shown before dynamic discovery completes (or for subscription-only users
// who can't use the /v1/models API — Anthropic rejects subscription OAuth tokens for that endpoint).
// `supports1M` → eligible for the 1M context window (Opus 4.7/4.6, Sonnet 4.6).
// `supportedEfforts` → subset of ['low','medium','high','xhigh','max'] accepted by that model.
// `defaultEffort` → what the API picks if effort is omitted (per Anthropic docs).
export const CLAUDE_MODELS_DEFAULT = [
  {
    id: 'claude-opus-4-7', label: 'Opus 4.7', desc: 'Most capable — 1M context, adaptive thinking',
    resolvedId: 'claude-opus-4-7', supportsThinking: true, supports1M: true,
    supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'xhigh',
  },
  {
    id: 'claude-opus-4-6', label: 'Opus 4.6', desc: 'Most capable — 1M context',
    resolvedId: 'claude-opus-4-6', supportsThinking: true, supports1M: true,
    supportedEfforts: ['low', 'medium', 'high', 'max'],
    defaultEffort: 'high',
  },
  {
    id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Balanced — 1M context',
    resolvedId: 'claude-sonnet-4-6', supportsThinking: true, supports1M: true,
    supportedEfforts: ['low', 'medium', 'high', 'max'],
    defaultEffort: 'high',
  },
  {
    id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fastest — 200K context',
    resolvedId: 'claude-haiku-4-5-20251001', supportsThinking: false, supports1M: false,
    supportedEfforts: [],
    defaultEffort: null,
  },
];

// Legacy short aliases stored before v1.0.47 — map to canonical full model IDs
export const LEGACY_ALIAS_MAP = {
  'opus': 'claude-opus-4-7',
  'sonnet': 'claude-sonnet-4-6',
  'haiku': 'claude-haiku-4-5-20251001',
};

// Effort levels (Anthropic API `output_config.effort`). Opus 4.7 supports all five;
// Opus 4.6 / Sonnet 4.6 skip `xhigh` (falls back to `high`).
export const THINKING_LEVELS = [
  { key: 'off',    label: 'Off',     desc: 'No extended reasoning' },
  { key: 'low',    label: 'Low',     desc: 'Fastest, cheapest — for scoped tasks' },
  { key: 'medium', label: 'Medium',  desc: 'Balanced speed, cost, and quality' },
  { key: 'high',   label: 'High',    desc: 'Deep reasoning — most tasks' },
  { key: 'xhigh',  label: 'XHigh',   desc: 'Extended reasoning — Opus 4.7 only' },
  { key: 'max',    label: 'Max',     desc: 'Unconstrained — deepest thinking' },
];

/* ── Language color map ── */
export const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Ruby: '#701516',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d', C: '#555555',
  'C#': '#178600', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
  HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', Vue: '#41b883', Svelte: '#ff3e00',
  Lua: '#000080', Zig: '#ec915c', Elixir: '#6e4a7e', Haskell: '#5e5086', Scala: '#c22d40',
};

/* ── Relative time helper ── */
export function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}
