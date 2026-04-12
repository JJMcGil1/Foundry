import { FiUser, FiMoon, FiGithub, FiGlobe, FiCpu, FiFolder } from 'react-icons/fi';

export const SECTIONS = [
  { id: 'account', label: 'Account', icon: FiUser },
  { id: 'workspace', label: 'Workspace', icon: FiFolder },
  { id: 'providers', label: 'Providers', icon: FiCpu },
  { id: 'github', label: 'GitHub', icon: FiGithub },
  { id: 'appearance', label: 'Appearance', icon: FiMoon },
  { id: 'about', label: 'About', icon: FiGlobe },
];

// Model aliases — the CLI always resolves these to the latest version
export const CLAUDE_MODELS_DEFAULT = [
  { id: 'opus', label: 'Opus 4.6', desc: 'Most capable', resolvedId: null },
  { id: 'sonnet', label: 'Sonnet 4.6', desc: 'Balanced', resolvedId: null },
  { id: 'haiku', label: 'Haiku 4.5', desc: 'Fastest', resolvedId: null },
];

export const THINKING_LEVELS = [
  { key: 'off', label: 'Off', budget: 0, desc: 'No extended thinking' },
  { key: 'low', label: 'Low', budget: 4000, desc: '4k token budget' },
  { key: 'medium', label: 'Medium', budget: 10000, desc: '10k token budget' },
  { key: 'high', label: 'High', budget: 32000, desc: '32k token budget' },
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
