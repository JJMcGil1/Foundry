import React from 'react';
import { FiFile, FiSearch, FiGitBranch, FiSettings } from 'react-icons/fi';
import styles from './ActivityBar.module.css';

const panels = [
  { id: 'files', icon: FiFile, label: 'Files' },
  { id: 'search', icon: FiSearch, label: 'Search' },
  { id: 'git', icon: FiGitBranch, label: 'Git' },
];

export default function ActivityBar({ activePanel, onPanelClick, profile, showSettings }) {
  const initials = profile
    ? `${(profile.first_name || profile.firstName || '').charAt(0)}${(profile.last_name || profile.lastName || '').charAt(0)}`.toUpperCase()
    : '?';

  return (
    <nav className={styles.bar}>
      <div className={styles.top}>
        {panels.map(p => {
          const Icon = p.icon;
          const active = activePanel === p.id && !showSettings;
          return (
            <button
              key={p.id}
              className={`${styles.item} ${active ? styles.active : ''}`}
              onClick={() => onPanelClick(p.id)}
              title={p.label}
            >
              <Icon size={20} />
            </button>
          );
        })}
      </div>

      <div className={styles.bottom}>
        <button
          className={`${styles.item} ${showSettings ? styles.active : ''}`}
          onClick={() => onPanelClick('settings')}
        >
          <FiSettings size={20} />
        </button>

        <div className={styles.divider} />

        <div className={styles.avatar}>
          {profile?.profile_photo_data ? (
            <img src={profile.profile_photo_data} alt="" className={styles.avatarImg} />
          ) : (
            <span className={styles.avatarText}>{initials}</span>
          )}
        </div>
      </div>
    </nav>
  );
}
