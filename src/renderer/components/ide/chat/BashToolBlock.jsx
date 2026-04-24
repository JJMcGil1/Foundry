import React, { memo, useState, useMemo } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';
import { HiTerminal } from 'react-icons/hi';
import styles from './BashToolBlock.module.css';

function BashToolBlock({ input, isStreaming }) {
  const [copied, setCopied] = useState(false);
  const data = useMemo(() => {
    if (!input) return {};
    const d = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return null; } })() : input;
    return d || {};
  }, [input]);

  const command = data.command || '';
  const description = data.description || '';

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`${styles.bashBlock} ${isStreaming ? styles.bashBlockRunning : ''}`}>
      <div className={styles.bashHeader}>
        <div className={styles.bashHeaderLeft}>
          <HiTerminal size={13} className={styles.bashIcon} />
          <span className={styles.bashTitle}>Terminal</span>
        </div>
        <div className={styles.bashHeaderRight}>
          {isStreaming && (
            <div className={styles.statusRunning}>
              <span className={styles.statusDot} />
              <span>Running</span>
            </div>
          )}
          {!isStreaming && command && (
            <div className={styles.statusDone}>
              <FiCheck size={11} />
              <span>Done</span>
            </div>
          )}
          <button className={styles.copyBtn} onClick={handleCopy} title="Copy command">
            {copied ? <FiCheck size={11} /> : <FiCopy size={11} />}
          </button>
        </div>
      </div>
      <div className={styles.bashBody}>
        <div className={styles.commandLine}>
          <span className={styles.prompt}>$</span>
          <span className={styles.command}>{command}</span>
        </div>
        {description && (
          <div className={styles.description}>{description}</div>
        )}
        {isStreaming && (
          <div className={styles.activity}>
            <div className={styles.activityBar} />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(BashToolBlock);
