import React from 'react';
import { FiFile, FiSearch, FiGitBranch, FiSettings, FiMessageSquare } from 'react-icons/fi';
import styles from './ActivityBar.module.css';

const panels = [
  { id: 'files', icon: FiFile, label: 'Explorer' },
  { id: 'search', icon: FiSearch, label: 'Search' },
  { id: 'git', icon: FiGitBranch, label: 'Source Control' },
];

export default function ActivityBar({ activePanel, onPanelClick, profile, showSettings }) {
  const initials = profile
    ? `${(profile.first_name || profile.firstName || '').charAt(0)}${(profile.last_name || profile.lastName || '').charAt(0)}`.toUpperCase()
    : '?';

  return (
    <div className={styles.bar}>
      <div className={styles.top}>
        {panels.map(p => {
          const Icon = p.icon;
          const active = activePanel === p.id && !showSettings;
          return (
            <button
              key={p.id}
              className={`${styles.item} ${active ? styles.itemActive : ''}`}
              onClick={() => onPanelClick(p.id)}
              title={p.label}
            >
              <Icon size={20} />
              {active && <div className={styles.activeIndicator} />}
            </button>
          );
        })}
      </div>
      <div className={styles.bottom}>
        <button
          className={`${styles.item} ${showSettings ? styles.itemActive : ''}`}
          onClick={() => onPanelClick('settings')}
          title="Settings"
        >
          <FiSettings size={20} />
          {showSettings && <div className={styles.activeIndicator} />}
        </button>
        <div className={styles.avatar} title={`${profile?.first_name || ''} ${profile?.last_name || ''}`}>
          {profile?.profile_photo_data ? (
            <img src={profile.profile_photo_data} alt="" className={styles.avatarImg} />
          ) : (
            <span className={styles.avatarText}>{initials}</span>
          )}
        </div>
      </div>
    </div>
  );
}
