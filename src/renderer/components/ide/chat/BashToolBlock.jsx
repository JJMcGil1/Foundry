import React, { useState, useMemo } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';
import { HiTerminal } from 'react-icons/hi';
import styles from './BashToolBlock.module.css';

export default function BashToolBlock({ input, isStreaming }) {
  const [copied, setCopied] = useState(false);
  const data = useMemo(() => {
    if (!input) return {};
    const d = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return null; } })() : input;
    return d || {};
  }, [input]);

  const command = data.command || '';
  const description = data.description || '';
  const displayCmd = command.length > 50 ? command.slice(0, 47) + '...' : command;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.bashBlock}>
      <div className={styles.bashHeader}>
        <div className={styles.bashDots}>
          <span className={styles.bashDotRed} />
          <span className={styles.bashDotYellow} />
          <span className={styles.bashDotGreen} />
        </div>
        <div className={styles.bashTitle}>
          <HiTerminal size={12} className={styles.bashTitleIcon} />
          <span>Terminal</span>
          <span className={styles.bashTitleCmd}>$ {displayCmd}</span>
        </div>
        <div className={styles.bashActions}>
          <button className={styles.bashActionBtn} onClick={handleCopy} title="Copy command">
            {copied ? <FiCheck size={11} /> : <FiCopy size={11} />}
          </button>
        </div>
      </div>
      <div className={styles.bashBody}>
        <span className={styles.bashPrompt}>$</span>
        <span className={styles.bashCommand}>{command}</span>
        {description && (
          <div className={styles.bashDescription}>{description}</div>
        )}
        {isStreaming && (
          <div className={styles.bashRunning}>
            <span className={styles.bashCursor} />
          </div>
        )}
        {!isStreaming && command && (
          <div className={styles.bashSuccess}>
            <FiCheck size={11} />
            <span>Success</span>
          </div>
        )}
      </div>
    </div>
  );
}
