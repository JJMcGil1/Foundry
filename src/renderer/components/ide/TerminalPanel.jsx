import React, { useRef, useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { FiTerminal, FiPlus, FiX, FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import styles from './TerminalPanel.module.css';

/* ── Read current theme colors from CSS custom properties ── */
function getTerminalTheme() {
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

function TerminalTab({ id, label, active, onSelect, onClose }) {
  return (
    <button
      className={`${styles.tab} ${active ? styles.tabActive : ''}`}
      onClick={() => onSelect(id)}
    >
      <FiTerminal size={12} />
      <span>{label}</span>
      <span
        className={styles.tabClose}
        onClick={(e) => { e.stopPropagation(); onClose(id); }}
      >
        <FiX size={11} />
      </span>
    </button>
  );
}

export default function TerminalPanel({ height, onHeightChange, projectPath, onClose, isMaximized, onToggleMaximize }) {
  const [isResizing, setIsResizing] = useState(false);
  const [terminals, setTerminals] = useState([]);
  const [activeTermId, setActiveTermId] = useState(null);
  const containerRef = useRef(null);
  const terminalsRef = useRef(new Map());
  const resizeObserverRef = useRef(null);
  const counterRef = useRef(0);
  const initializedRef = useRef(false);

  // Create a new terminal instance
  const createTerminal = useCallback(async () => {
    const cwd = projectPath || undefined;

    let result;
    try {
      result = await window.foundry?.terminalCreate(cwd);
    } catch (err) {
      console.error('Failed to create terminal:', err);
      return;
    }
    if (!result) return;

    const ptyId = result.id;
    const shellName = result.shellName || 'terminal';
    counterRef.current += 1;
    const id = `term-${ptyId}`;
    const label = shellName;

    const xterm = new Terminal({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: getTerminalTheme(),
      scrollback: 5000,
      drawBoldTextInBrightColors: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.onData((data) => {
      window.foundry?.terminalWrite(ptyId, data);
    });

    // Force our cursor color and shape on every theme application
    const applyCursorStyle = () => {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const cursorHex = isDark ? '#E4E4E7' : '#27272A';
      xterm.write(`\x1b]12;${cursorHex}\x07`);  // OSC 12: set cursor color
      xterm.write('\x1b[2 q');                    // DECSCUSR: solid block cursor
      xterm.options.cursorStyle = 'block';
      xterm.options.cursorBlink = true;
    };

    // Apply after shell initializes (shell profile may override cursor)
    setTimeout(applyCursorStyle, 200);
    setTimeout(applyCursorStyle, 600);
    setTimeout(applyCursorStyle, 1500);

    terminalsRef.current.set(id, { xterm, fitAddon, ptyId, applyCursorStyle });

    setTerminals(prev => [...prev, { id, label, ptyId }]);
    setActiveTermId(id);
  }, [projectPath]);

  // Watch for theme changes and update all terminals
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = getTerminalTheme();
      for (const [, entry] of terminalsRef.current) {
        entry.xterm.options.theme = theme;
        if (entry.applyCursorStyle) entry.applyCursorStyle();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  // Strip escape sequences that override cursor color or shape
  // OSC 12 = cursor color, OSC 112 = reset cursor color, DECSCUSR = cursor shape
  const stripCursorEscapes = useCallback((data) => {
    return data
      .replace(/\x1b\]12;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')   // OSC 12: set cursor color
      .replace(/\x1b\]112(?:\x07|\x1b\\)/g, '')                 // OSC 112: reset cursor color
      .replace(/\x1b\[\d* ?q/g, '');                             // DECSCUSR: cursor shape
  }, []);

  // Listen for PTY data from main process
  useEffect(() => {
    const removeDataListener = window.foundry?.onTerminalData((ptyId, data) => {
      for (const [, entry] of terminalsRef.current) {
        if (entry.ptyId === ptyId) {
          entry.xterm.write(stripCursorEscapes(data));
          break;
        }
      }
    });

    const removeExitListener = window.foundry?.onTerminalExit((ptyId) => {
      for (const [, entry] of terminalsRef.current) {
        if (entry.ptyId === ptyId) {
          entry.xterm.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
          break;
        }
      }
    });

    return () => {
      removeDataListener?.();
      removeExitListener?.();
    };
  }, []);

  // Mount active terminal into the DOM
  useEffect(() => {
    if (!activeTermId || !containerRef.current) return;
    const entry = terminalsRef.current.get(activeTermId);
    if (!entry) return;

    containerRef.current.innerHTML = '';

    if (!entry.xterm.element) {
      entry.xterm.open(containerRef.current);
    } else {
      containerRef.current.appendChild(entry.xterm.element);
    }

    const timer = setTimeout(() => {
      try {
        entry.fitAddon.fit();
        window.foundry?.terminalResize(entry.ptyId, entry.xterm.cols, entry.xterm.rows);
      } catch {}
      entry.xterm.focus();
    }, 80);

    return () => clearTimeout(timer);
  }, [activeTermId]);

  // Refit on height change
  useEffect(() => {
    if (!activeTermId) return;
    const entry = terminalsRef.current.get(activeTermId);
    if (!entry) return;

    const timer = setTimeout(() => {
      try {
        entry.fitAddon.fit();
        window.foundry?.terminalResize(entry.ptyId, entry.xterm.cols, entry.xterm.rows);
      } catch {}
    }, 50);

    return () => clearTimeout(timer);
  }, [height, activeTermId]);

  // ResizeObserver for width changes
  useEffect(() => {
    if (!containerRef.current) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      if (!activeTermId) return;
      const entry = terminalsRef.current.get(activeTermId);
      if (!entry) return;
      try {
        entry.fitAddon.fit();
        window.foundry?.terminalResize(entry.ptyId, entry.xterm.cols, entry.xterm.rows);
      } catch {}
    });

    resizeObserverRef.current.observe(containerRef.current);
    return () => resizeObserverRef.current?.disconnect();
  }, [activeTermId]);

  // Auto-create first terminal on mount (once)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      createTerminal();
    }
  }, [createTerminal]);

  const handleClose = useCallback((id) => {
    const entry = terminalsRef.current.get(id);
    if (entry) {
      window.foundry?.terminalKill(entry.ptyId);
      entry.xterm.dispose();
      terminalsRef.current.delete(id);
    }

    setTerminals(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTermId === id) {
        setActiveTermId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [activeTermId]);

  const handleClear = useCallback(() => {
    if (!activeTermId) return;
    const entry = terminalsRef.current.get(activeTermId);
    if (entry) {
      entry.xterm.clear();
    }
  }, [activeTermId]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = height;

    const handleMouseMove = (e) => {
      const newHeight = Math.max(120, Math.min(600, startHeight - (e.clientY - startY)));
      onHeightChange(newHeight);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height, onHeightChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, entry] of terminalsRef.current) {
        window.foundry?.terminalKill(entry.ptyId);
        entry.xterm.dispose();
      }
      terminalsRef.current.clear();
    };
  }, []);

  return (
    <motion.div
      className={`${styles.panel} ${isMaximized ? styles.panelMaximized : ''}`}
      style={isResizing ? { height } : undefined}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={isResizing ? { duration: 0 } : { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {!isMaximized && <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />}
      <div className={styles.header}>
        <div className={styles.tabs}>
          {terminals.map(t => (
            <TerminalTab
              key={t.id}
              id={t.id}
              label={t.label}
              active={activeTermId === t.id}
              onSelect={setActiveTermId}
              onClose={handleClose}
            />
          ))}
          <button className={styles.newBtn} onClick={createTerminal} title="New Terminal">
            <FiPlus size={13} />
          </button>
        </div>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={onToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
            {isMaximized ? <FiMinimize2 size={13} /> : <FiMaximize2 size={13} />}
          </button>
          <button className={styles.actionBtn} onClick={onClose} title="Close Terminal">
            <FiX size={13} />
          </button>
        </div>
      </div>
      <div className={styles.terminalContainer} ref={containerRef} />
    </motion.div>
  );
}
