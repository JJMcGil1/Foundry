import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LuBrainCircuit } from 'react-icons/lu';
import styles from './ThinkingBlock.module.css';

export default function ThinkingBlock({ content, isStreaming }) {
  const [expanded, setExpanded] = useState(false);

  const preview = useMemo(() => {
    if (!content) return '...';
    const clean = content.replace(/\n+/g, ' ').trim();
    return clean.length > 48 ? clean.slice(0, 45) + '...' : clean;
  }, [content]);

  return (
    <div className={styles.thinkingBlock}>
      <button
        className={`${styles.thinkingToggle} ${expanded ? styles.thinkingExpanded : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <LuBrainCircuit size={16} className={styles.thinkingIcon} />
        <span className={styles.thinkingLabel}>Thought</span>
        {!expanded && (
          <span className={styles.thinkingPreview}>
            &ldquo;{isStreaming && !content ? '...' : preview}&rdquo;
          </span>
        )}
        {isStreaming && (
          <span className={styles.pulseDots}>
            <span className={styles.pulseDot} />
            <span className={styles.pulseDot} />
            <span className={styles.pulseDot} />
          </span>
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            className={styles.thinkingContent}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className={styles.thinkingText}>
              {content || '...'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
