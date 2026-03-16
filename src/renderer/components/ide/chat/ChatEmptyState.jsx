import React from 'react';
import { FiSettings, FiChevronRight } from 'react-icons/fi';
import styles from './ChatEmptyState.module.css';

const QUICK_PROMPTS = [
  { label: 'Explain this project', prompt: 'Give me a high-level overview of this project — its structure, key technologies, and how the pieces fit together.' },
  { label: 'Find bugs', prompt: 'Scan the current codebase for potential bugs, edge cases, or issues and suggest fixes.' },
  { label: 'Write tests', prompt: 'Suggest and write tests for the most critical parts of this codebase.' },
  { label: 'Refactor code', prompt: 'Identify areas of the codebase that could benefit from refactoring and suggest improvements.' },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function ChatEmptyState({ hasProvider, hasMessages, onOpenSettings, onSelectPrompt }) {
  if (hasProvider === null) return null;

  if (hasProvider === false) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyCard}>
          <div className={styles.emptyCardHeader}>
            <div className={styles.emptyCardIcon}>
              <FiSettings size={18} />
            </div>
            <h4 className={styles.emptyCardTitle}>Connect a Provider</h4>
            <p className={styles.emptyCardDesc}>
              Add your API key to start chatting with Sage.
            </p>
          </div>
          {onOpenSettings && (
            <button className={styles.emptyCardBtn} onClick={() => onOpenSettings('providers')}>
              Open Settings
              <FiChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!hasMessages) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyCard}>
          <div className={styles.emptyCardHeader}>
            <span className={styles.emptyGreetingIcon}>✦</span>
            <h3 className={styles.emptyCardTitle}>{getGreeting()}</h3>
            <p className={styles.emptyCardDesc}>
              What can I help you build today?
            </p>
          </div>
          <div className={styles.quickPrompts}>
            {QUICK_PROMPTS.map((qp, i) => (
              <button
                key={i}
                className={styles.quickPromptBtn}
                onClick={() => onSelectPrompt(qp.prompt)}
              >
                <span className={styles.quickPromptLabel}>{qp.label}</span>
                <FiChevronRight size={13} className={styles.quickPromptArrow} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
