import React from 'react';
import { FiTerminal, FiX } from 'react-icons/fi';
import styles from '../TerminalPanel.module.css';

export default function TerminalTab({ id, label, active, onSelect, onClose }) {
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
