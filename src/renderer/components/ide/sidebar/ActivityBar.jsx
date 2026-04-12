import React, { useState } from 'react';
import { VscFiles, VscSourceControl, VscSettingsGear } from 'react-icons/vsc';
import { FiGithub, FiGitCommit } from 'react-icons/fi';
import styles from '../ActivityBar.module.css';

const panels = [
  { id: 'files',  icon: VscFiles,          label: 'Explorer' },
  { id: 'git',    icon: VscSourceControl,  label: 'Source Control' },
];

export default function ActivityBar({ activePanel, onPanelClick, profile, showSettings, gitChangeCount = 0, rightActivePanel, rightSidebarVisible }) {
  const [hoveredId, setHoveredId] = useState(null);

  const initials = profile
    ? `${(profile.first_name || profile.firstName || '').charAt(0)}${(profile.last_name || profile.lastName || '').charAt(0)}`.toUpperCase()
    : '?';

  return (
    <nav className={styles.bar}>
      <div className={styles.top}>
        {panels.map(p => {
          const activeLeft = activePanel === p.id;
          const activeRight = rightSidebarVisible && rightActivePanel === p.id;
          const active = activeLeft || activeRight;
          const Icon = p.icon;
          const iconSize = p.size || 24;
          return (
            <div key={p.id} className={styles.itemWrap}>
              <button
                className={`${styles.item} ${active ? styles.active : ''}`}
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
                {activeLeft && (
                  <span className={styles.indicator}>
                    <span className={styles.indicatorLine} />
                    <span className={styles.indicatorGlow} />
                  </span>
                )}
                {activeRight && (
                  <span className={styles.indicatorRight}>
                    <span className={styles.indicatorLineRight} />
                    <span className={styles.indicatorGlowRight} />
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

        <div className={styles.itemWrap}>
          <button
            className={`${styles.item} ${(activePanel === 'graph' || (rightSidebarVisible && rightActivePanel === 'graph')) ? styles.active : ''}`}
            onClick={() => onPanelClick('graph')}
            onMouseEnter={() => setHoveredId('graph')}
            onMouseLeave={() => setHoveredId(null)}
          >
            <FiGitCommit size={21} />
            {activePanel === 'graph' && (
              <span className={styles.indicator}>
                <span className={styles.indicatorLine} />
                <span className={styles.indicatorGlow} />
              </span>
            )}
            {rightSidebarVisible && rightActivePanel === 'graph' && (
              <span className={styles.indicatorRight}>
                <span className={styles.indicatorLineRight} />
                <span className={styles.indicatorGlowRight} />
              </span>
            )}
          </button>
          {hoveredId === 'graph' && (
            <div className={styles.tooltip}>
              <span className={styles.tooltipText}>Commit Graph</span>
            </div>
          )}
        </div>

        <div className={styles.itemWrap}>
          <button
            className={`${styles.item} ${(activePanel === 'workflows' || (rightSidebarVisible && rightActivePanel === 'workflows')) ? styles.active : ''}`}
            onClick={() => onPanelClick('workflows')}
            onMouseEnter={() => setHoveredId('workflows')}
            onMouseLeave={() => setHoveredId(null)}
          >
            <FiGithub size={21} />
            {activePanel === 'workflows' && (
              <span className={styles.indicator}>
                <span className={styles.indicatorLine} />
                <span className={styles.indicatorGlow} />
              </span>
            )}
            {rightSidebarVisible && rightActivePanel === 'workflows' && (
              <span className={styles.indicatorRight}>
                <span className={styles.indicatorLineRight} />
                <span className={styles.indicatorGlowRight} />
              </span>
            )}
          </button>
          {hoveredId === 'workflows' && (
            <div className={styles.tooltip}>
              <span className={styles.tooltipText}>Workflows</span>
            </div>
          )}
        </div>
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
