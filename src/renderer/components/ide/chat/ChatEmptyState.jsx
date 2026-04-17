import React, { useState, useEffect } from 'react';
import { FiSettings, FiChevronRight } from 'react-icons/fi';
import SageIcon from './SageIcon';
import styles from './ChatEmptyState.module.css';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getSubtitle() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Ready to help you start the day strong.';
  if (hour < 17) return 'What are we building together?';
  return 'Let\'s make the most of the evening.';
}

export default function ChatEmptyState({ hasProvider, hasMessages, onOpenSettings }) {
  const [firstName, setFirstName] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const p = await window.foundry?.getProfile?.();
        if (!cancelled && p) {
          setFirstName(p.first_name || p.firstName || '');
        }
      } catch {
        // silent
      }
    }
    loadProfile();
    return () => { cancelled = true; };
  }, []);

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
              Open Provider Settings
              <FiChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!hasMessages) {
    const greeting = firstName
      ? `${getGreeting()}, ${firstName}`
      : getGreeting();

    return (
      <div className={styles.emptyState}>
        <div className={styles.hero}>
          <div className={styles.iconWrap}>
            <SageIcon size={68} glyphOnly />
          </div>
          <h2 className={styles.greeting}>{greeting}</h2>
          <p className={styles.subtitle}>{getSubtitle()}</p>
          <span className={styles.agentName}>Sage</span>
        </div>
      </div>
    );
  }

  return null;
}
