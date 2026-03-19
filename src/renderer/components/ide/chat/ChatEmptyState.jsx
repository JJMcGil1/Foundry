import React, { useState, useEffect } from 'react';
import { FiSettings, FiChevronRight } from 'react-icons/fi';
import styles from './ChatEmptyState.module.css';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function ChatEmptyState({ hasProvider, hasMessages, onOpenSettings, onSelectPrompt }) {
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
        <div className={styles.heroSection}>
          <div className={styles.sageIcon}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L18.5 13.5L30 16L18.5 18.5L16 30L13.5 18.5L2 16L13.5 13.5L16 2Z" fill="url(#sage-grad)" />
              <defs>
                <linearGradient id="sage-grad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FB923C" />
                  <stop offset="1" stopColor="#F97316" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h2 className={styles.greeting}>{greeting}</h2>
          <p className={styles.subtitle}>What are we building next?</p>
          <p className={styles.sageBadge}>Sage</p>
        </div>
      </div>
    );
  }

  return null;
}
