import React, { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef, memo } from 'react';
import { FiPlus, FiX } from 'react-icons/fi';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { getTerminalTheme } from './terminalTheme';
import TerminalTab from './TerminalTab';
import styles from '../TerminalPanel.module.css';

const TerminalPanel = forwardRef(function TerminalPanel({ projectPath, onClose, panelDragProps }, ref) {
  const [terminals, setTerminals] = useState([]);
  const [activeTermId, setActiveTermId] = useState(null);
  const containerRef = useRef(null);
  const terminalsRef = useRef(new Map());
  const resizeObserverRef = useRef(null);
  const counterRef = useRef(0);

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
      xterm.write(`\x1b]12;${cursorHex}\x07`);
      xterm.write('\x1b[2 q');
      xterm.options.cursorStyle = 'block';
      xterm.options.cursorBlink = true;
    };

    setTimeout(applyCursorStyle, 200);
    setTimeout(applyCursorStyle, 600);
    setTimeout(applyCursorStyle, 1500);

    terminalsRef.current.set(id, { xterm, fitAddon, ptyId, applyCursorStyle });

    setTerminals(prev => [...prev, { id, label, ptyId }]);
    setActiveTermId(id);
  }, [projectPath]);

  // Watch for theme changes and update all terminals. Also watch the
  // `app-idle` class on <html> — xterm's cursor blink forces a canvas
  // redraw twice per second per terminal, so pausing it when the
  // window isn't focused is a real battery win.
  useEffect(() => {
    const applyIdleBlink = () => {
      const idle = document.documentElement.classList.contains('app-idle');
      for (const [, entry] of terminalsRef.current) {
        entry.xterm.options.cursorBlink = !idle;
      }
    };
    const applyTheme = () => {
      const theme = getTerminalTheme();
      for (const [, entry] of terminalsRef.current) {
        entry.xterm.options.theme = theme;
        if (entry.applyCursorStyle) entry.applyCursorStyle();
      }
    };
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.attributeName === 'data-theme') applyTheme();
        else if (r.attributeName === 'class') applyIdleBlink();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    applyIdleBlink();
    return () => observer.disconnect();
  }, []);

  // Strip escape sequences that override cursor color or shape
  const stripCursorEscapes = useCallback((data) => {
    return data
      .replace(/\x1b\]12;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\]112(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[\d* ?q/g, '');
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
      try {
        entry.xterm.loadAddon(new WebglAddon());
      } catch {}
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

  // ResizeObserver for container size changes. During panel drag/resize we
  // update style.width/height imperatively every frame, which fires the
  // observer every frame — fitAddon.fit() reads layout and spawns an IPC
  // round-trip, so left unthrottled it turns panel drag into layout thrash.
  // rAF-coalesce to at most one fit per frame, and only fit if dimensions
  // actually changed since the last run.
  useEffect(() => {
    if (!containerRef.current) return;

    let pending = false;
    let lastW = 0;
    let lastH = 0;
    resizeObserverRef.current = new ResizeObserver((entries) => {
      if (!activeTermId) return;
      const cr = entries[0]?.contentRect;
      if (cr) {
        if (Math.abs(cr.width - lastW) < 1 && Math.abs(cr.height - lastH) < 1) return;
        lastW = cr.width;
        lastH = cr.height;
      }
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const entry = terminalsRef.current.get(activeTermId);
        if (!entry) return;
        try {
          entry.fitAddon.fit();
          window.foundry?.terminalResize(entry.ptyId, entry.xterm.cols, entry.xterm.rows);
        } catch {}
      });
    });

    resizeObserverRef.current.observe(containerRef.current);
    return () => resizeObserverRef.current?.disconnect();
  }, [activeTermId]);

  // Auto-create a terminal on mount
  useEffect(() => {
    if (terminals.length === 0) {
      createTerminal();
    }
  }, [createTerminal, terminals.length]);

  const handleClose = useCallback((id) => {
    const entry = terminalsRef.current.get(id);
    if (entry) {
      window.foundry?.terminalKill(entry.ptyId);
      if (entry.xterm.element?.parentNode) {
        entry.xterm.element.parentNode.removeChild(entry.xterm.element);
      }
      entry.xterm.dispose();
      terminalsRef.current.delete(id);
    }

    setTerminals(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        setActiveTermId(null);
        return next;
      }
      if (activeTermId === id) {
        setActiveTermId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeTermId]);

  // Auto-close panel when user closes the last terminal tab
  const hadTerminalsRef = useRef(false);
  useEffect(() => {
    if (terminals.length > 0) {
      hadTerminalsRef.current = true;
    } else if (hadTerminalsRef.current) {
      hadTerminalsRef.current = false;
      onClose?.();
    }
  }, [terminals.length, onClose]);

  // Expose methods for parent to run/kill commands
  useImperativeHandle(ref, () => ({
    async runCommand(cmd) {
      const cwd = projectPath || undefined;
      let result;
      try {
        result = await window.foundry?.terminalCreate(cwd);
      } catch (err) {
        console.error('Failed to create terminal for command:', err);
        return null;
      }
      if (!result) return null;

      const ptyId = result.id;
      const id = `term-${ptyId}`;
      counterRef.current += 1;

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

      const applyCursorStyle = () => {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        const cursorHex = isDark ? '#E4E4E7' : '#27272A';
        xterm.write(`\x1b]12;${cursorHex}\x07`);
        xterm.write('\x1b[2 q');
        xterm.options.cursorStyle = 'block';
        xterm.options.cursorBlink = true;
      };

      setTimeout(applyCursorStyle, 200);
      setTimeout(applyCursorStyle, 600);
      setTimeout(applyCursorStyle, 1500);

      terminalsRef.current.set(id, { xterm, fitAddon, ptyId, applyCursorStyle });
      setTerminals(prev => [...prev, { id, label: cmd.split(' ')[0], ptyId }]);
      setActiveTermId(id);

      await new Promise((resolve) => {
        let resolved = false;
        const cleanup = window.foundry?.onTerminalData((dataId, data) => {
          if (dataId === ptyId && !resolved) {
            resolved = true;
            cleanup?.();
            resolve();
          }
        });
        setTimeout(() => {
          if (!resolved) { resolved = true; cleanup?.(); resolve(); }
        }, 2000);
      });

      window.foundry?.terminalWrite(ptyId, cmd + '\n');
      return ptyId;
    },

    killByPtyId(ptyId) {
      for (const [id, entry] of terminalsRef.current) {
        if (entry.ptyId === ptyId) {
          window.foundry?.terminalKill(entry.ptyId);
          return true;
        }
      }
      return false;
    },
  }), [projectPath]);

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
    <div className={styles.panel}>
      <div
        className={styles.header}
        onMouseDown={panelDragProps?.onMouseDown}
      >
        {panelDragProps && <div className={styles.dragGrip}><span /><span /><span /><span /><span /><span /></div>}
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
        {panelDragProps && (
          <button className={styles.panelCloseBtn} onClick={onClose} title="Close panel">
            <FiX size={13} />
          </button>
        )}
      </div>
      <div className={styles.terminalContainer} ref={containerRef} />
    </div>
  );
});

export default memo(TerminalPanel);
