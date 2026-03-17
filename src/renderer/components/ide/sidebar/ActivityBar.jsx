import React, { useState } from 'react';
import { VscFiles, VscSourceControl, VscSettingsGear } from 'react-icons/vsc';
import styles from '../ActivityBar.module.css';

const panels = [
  { id: 'files',  icon: VscFiles,          label: 'Explorer' },
  { id: 'git',    icon: VscSourceControl,  label: 'Source Control' },
];

export default function ActivityBar({ activePanel, onPanelClick, profile, showSettings }) {
  const [hoveredId, setHoveredId] = useState(null);

  const initials = profile
    ? `${(profile.first_name || profile.firstName || '').charAt(0)}${(profile.last_name || profile.lastName || '').charAt(0)}`.toUpperCase()
    : '?';

  return (
    <nav className={styles.bar}>
      <div className={styles.top}>
        {panels.map(p => {
          const active = activePanel === p.id && !showSettings;
          const Icon = p.icon;
          return (
            <div key={p.id} className={styles.itemWrap}>
              <button
                className={`${styles.item} ${active ? styles.active : ''}`}
                onClick={() => onPanelClick(p.id)}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <Icon size={24} />
                {active && (
                  <span className={styles.indicator}>
                    <span className={styles.indicatorLine} />
                    <span className={styles.indicatorGlow} />
                  </span>
                )}
              </button>
              {hoveredId === p.id && (
                <div className={styles.tooltip}>
                  <span className={styles.tooltipText}>{p.label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.bottom}>
        <div className={styles.itemWrap}>
          <button
            className={`${styles.item} ${showSettings ? styles.active : ''}`}
            onClick={() => onPanelClick('settings')}
            onMouseEnter={() => setHoveredId('settings')}
            onMouseLeave={() => setHoveredId(null)}
          >
            <VscSettingsGear size={22} />
            {showSettings && (
              <span className={styles.indicator}>
                <span className={styles.indicatorLine} />
                <span className={styles.indicatorGlow} />
              </span>
            )}
          </button>
          {hoveredId === 'settings' && (
            <div className={styles.tooltip}>
              <span className={styles.tooltipText}>Settings</span>
            </div>
          )}
        </div>

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
