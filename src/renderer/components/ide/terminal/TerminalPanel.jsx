import React, { useRef, useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiX, FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from './terminalTheme';
import TerminalTab from './TerminalTab';
import styles from '../TerminalPanel.module.css';

export default function TerminalPanel({ height, onHeightChange, projectPath, visible = true, onClose, isMaximized, onToggleMaximize }) {
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
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Menlo', 'Consolas', monospace",
      lineHeight: 1.0,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: getTerminalTheme(),
      scrollback: 5000,
      drawBoldTextInBrightColors: true,
      allowTransparency: false,
      minimumContrastRatio: 1,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(new WebLinksAddon());

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
      // Load WebGL renderer after terminal is in the DOM (requires canvas context)
      try {
        entry.xterm.loadAddon(new WebglAddon());
      } catch {
        // WebGL not available — falls back to canvas renderer automatically
      }
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

  // Refit on height change or when becoming visible again
  useEffect(() => {
    if (!visible || !activeTermId) return;
    const entry = terminalsRef.current.get(activeTermId);
    if (!entry) return;

    const timer = setTimeout(() => {
      try {
        entry.fitAddon.fit();
        window.foundry?.terminalResize(entry.ptyId, entry.xterm.cols, entry.xterm.rows);
      } catch {}
      entry.xterm.focus();
    }, 50);

    return () => clearTimeout(timer);
  }, [height, activeTermId, visible]);

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

  // Auto-create first terminal when panel becomes visible for the first time
  useEffect(() => {
    if (visible && !initializedRef.current) {
      initializedRef.current = true;
      createTerminal();
    }
  }, [visible, createTerminal]);

  const handleClose = useCallback((id) => {
    const entry = terminalsRef.current.get(id);
    if (entry) {
      window.foundry?.terminalKill(entry.ptyId);
      // Detach xterm element from DOM before disposing to avoid visible teardown flash
      if (entry.xterm.element?.parentNode) {
        entry.xterm.element.parentNode.removeChild(entry.xterm.element);
      }
      entry.xterm.dispose();
      terminalsRef.current.delete(id);
    }

    setTerminals(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        // Last terminal closed — auto-hide the panel
        setActiveTermId(null);
        onClose?.();
        return next;
      }
      if (activeTermId === id) {
        setActiveTermId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeTermId, onClose]);

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
      initial={false}
      animate={
        visible
          ? { height, opacity: 1, y: 0 }
          : { height: 0, opacity: 0, y: 10 }
      }
      transition={
        isResizing
          ? { duration: 0 }
          : visible
            ? { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }
            : { height: { duration: 0 }, opacity: { duration: 0.15 }, y: { duration: 0.15 } }
      }
    >
      <div style={{ display: visible ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
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
      </div>
    </motion.div>
  );
}
