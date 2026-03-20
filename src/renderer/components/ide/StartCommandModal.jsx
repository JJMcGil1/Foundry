import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VscPlay, VscDebugStop } from 'react-icons/vsc';
import styles from './StartCommandModal.module.css';

// Strip ANSI escape sequences for clean log output
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

export default function StartCommandModal({
  open,
  onClose,
  projectPath,
  running,
  command,
  output,
  onCommandChange,
  onStart,
  onStop,
}) {
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Focus input when modal opens and not running
  useEffect(() => {
    if (open && !running && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, running]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose?.();
    if (e.key === 'Enter' && !running && command.trim()) onStart?.();
  }, [onClose, running, command, onStart]);

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const displayOutput = output ? stripAnsi(output) : '';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              <span className={styles.title}>Start Command</span>
              {running ? (
                <span className={`${styles.statusBadge} ${styles.statusRunning}`}>
                  <span className={styles.runningDot} />
                  Running
                </span>
              ) : (
                <span className={`${styles.statusBadge} ${styles.statusStopped}`}>
                  Stopped
                </span>
              )}
            </div>
            <div className={styles.body}>
              <div className={styles.label}>Command</div>
              <input
                ref={inputRef}
                className={styles.commandInput}
                type="text"
                value={command}
                onChange={(e) => onCommandChange(e.target.value)}
                placeholder="e.g. npm run dev"
                disabled={running}
                spellCheck={false}
              />
              <div className={styles.output} ref={outputRef}>
                {displayOutput || (
                  <span className={styles.outputPlaceholder}>
                    Output will appear here...
                  </span>
                )}
              </div>
            </div>
            <div className={styles.actions}>
              <button className={styles.closeBtn} onClick={onClose}>
                Close
              </button>
              {running ? (
                <button className={styles.stopBtn} onClick={onStop}>
                  <VscDebugStop size={14} />
                  Stop
                </button>
              ) : (
                <button
                  className={styles.startBtn}
                  onClick={onStart}
                  disabled={!command.trim() || !projectPath}
                >
                  <VscPlay size={14} />
                  Start
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
