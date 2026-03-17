/* ── Read current theme colors from CSS custom properties ── */
export function getTerminalTheme() {
  const s = getComputedStyle(document.documentElement);
  const get = (v) => s.getPropertyValue(v).trim();
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

  return {
    background: get('--surface-1') || (isDark ? '#111113' : '#F5F5F6'),
    foreground: get('--zinc-200') || (isDark ? '#E4E4E7' : '#27272A'),
    cursor: isDark ? '#E4E4E7' : '#27272A',
    cursorAccent: get('--surface-1') || (isDark ? '#111113' : '#F5F5F6'),
    selectionBackground: isDark ? 'rgba(228, 228, 231, 0.15)' : 'rgba(39, 39, 42, 0.15)',
    selectionForeground: undefined,
    // ANSI colors tuned for both themes
    black:         isDark ? '#18181B' : '#D4D4D8',
    red:           isDark ? '#f87171' : '#DC2626',
    green:         isDark ? '#4ade80' : '#16A34A',
    yellow:        isDark ? '#facc15' : '#CA8A04',
    blue:          isDark ? '#60a5fa' : '#2563EB',
    magenta:       isDark ? '#c084fc' : '#9333EA',
    cyan:          isDark ? '#22d3ee' : '#0891B2',
    white:         isDark ? '#d4d4d8' : '#3F3F46',
    brightBlack:   isDark ? '#52525b' : '#A1A1AA',
    brightRed:     isDark ? '#fca5a5' : '#EF4444',
    brightGreen:   isDark ? '#86efac' : '#22C55E',
    brightYellow:  isDark ? '#fde68a' : '#EAB308',
    brightBlue:    isDark ? '#93c5fd' : '#3B82F6',
    brightMagenta: isDark ? '#d8b4fe' : '#A855F7',
    brightCyan:    isDark ? '#67e8f9' : '#06B6D4',
    brightWhite:   isDark ? '#fafafa' : '#18181B',
  };
}
