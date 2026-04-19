import React, { useState } from 'react';
import { VscFiles, VscSourceControl, VscSettingsGear, VscGithubAction } from 'react-icons/vsc';
import { FiTerminal } from 'react-icons/fi';
import { RiChatAiLine } from 'react-icons/ri';
import { LuSquareCheckBig } from 'react-icons/lu';
import styles from '../ActivityBar.module.css';

const panels = [
  { id: 'chat',      icon: RiChatAiLine,     label: 'Chat',           size: 20 },
  { id: 'git',       icon: VscSourceControl, label: 'Source Control',  size: 24 },
  { id: 'terminal',  icon: FiTerminal,       label: 'Terminal',       size: 20 },
  { id: 'whatsDone', icon: LuSquareCheckBig, label: "What's Done",    size: 20 },
  { id: 'workflows', icon: VscGithubAction,   label: 'GitHub Actions', size: 22 },
  { id: 'files',     icon: VscFiles,         label: 'Explorer',       size: 24 },
];

export default function ActivityBar({ onPanelClick, profile, showSettings, gitChangeCount = 0, openPanelTypes = new Set() }) {
  const [hoveredId, setHoveredId] = useState(null);

  const initials = profile
    ? `${(profile.first_name || profile.firstName || '').charAt(0)}${(profile.last_name || profile.lastName || '').charAt(0)}`.toUpperCase()
    : '?';

  return (
    <nav className={styles.bar}>
      <div className={styles.top}>
        {panels.map(p => {
          const isOpen = openPanelTypes.has(p.id);
          const Icon = p.icon;
          const iconSize = p.size || 24;
          return (
            <div key={p.id} className={styles.itemWrap}>
              <button
                className={`${styles.item} ${isOpen ? styles.active : ''}`}
                onClick={() => onPanelClick(p.id)}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <span className={p.id === 'git' ? styles.iconWrap : undefined}>
                  <Icon size={iconSize} />
                  {p.id === 'git' && gitChangeCount > 0 && (
                    <span className={styles.badge}>{gitChangeCount > 99 ? '99+' : gitChangeCount}</span>
                  )}
                </span>
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
        <div className={styles.divider} />

        <div className={styles.itemWrap}>
          <button
            className={`${styles.item} ${showSettings ? styles.active : ''}`}
            onClick={() => onPanelClick('settings')}
            onMouseEnter={() => setHoveredId('settings')}
            onMouseLeave={() => setHoveredId(null)}
          >
            <VscSettingsGear size={22} />
          </button>
          {hoveredId === 'settings' && (
            <div className={styles.tooltip}>
              <span className={styles.tooltipText}>Settings</span>
            </div>
          )}
        </div>

        <div className={styles.itemWrap}>
          <button
            className={styles.avatar}
            onClick={() => onPanelClick('settings')}
            onMouseEnter={() => setHoveredId('profile')}
            onMouseLeave={() => setHoveredId(null)}
          >
            {profile?.profile_photo_data ? (
              <img src={profile.profile_photo_data} alt="" className={styles.avatarImg} />
            ) : (
              <span className={styles.avatarText}>{initials}</span>
            )}
          </button>
          {hoveredId === 'profile' && (
            <div className={styles.tooltip}>
              <span className={styles.tooltipText}>Profile</span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
