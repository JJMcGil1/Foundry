import React, { useRef, useEffect, useCallback } from 'react';
import { FiX, FiFolder, FiFile } from 'react-icons/fi';
import styles from './EditorArea.module.css';

function getFileIcon(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  const colors = {
    js: '#F7DF1E', jsx: '#61DAFB', ts: '#3178C6', tsx: '#3178C6',
    py: '#3776AB', rb: '#CC342D', go: '#00ADD8', rs: '#DEA584',
    css: '#1572B6', scss: '#CD6799', html: '#E34F26',
    json: '#A1A1AA', md: '#A1A1AA', yml: '#A1A1AA', yaml: '#A1A1AA',
    svg: '#FFB13B',
  };
  return colors[ext] || 'var(--zinc-500)';
}

function TabBar({ tabs, activeTab, onSelectTab, onCloseTab }) {
  return (
    <div className={styles.tabBar}>
      {tabs.map(tab => (
        <div
          key={tab.path}
          className={`${styles.tab} ${activeTab === tab.path ? styles.tabActive : ''}`}
          onClick={() => onSelectTab(tab.path)}
        >
          <div className={styles.tabDot} style={{ background: getFileIcon(tab.name) }} />
          <span className={styles.tabName}>{tab.name}</span>
          {tab.modified && <span className={styles.tabModified} />}
          <button
            className={styles.tabClose}
            onClick={(e) => { e.stopPropagation(); onCloseTab(tab.path); }}
          >
            <FiX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function CodeEditor({ tab, onContentChange, onSave }) {
  const textareaRef = useRef(null);
  const lineCountRef = useRef(null);

  const lines = (tab?.content || '').split('\n');
  const lineNumbers = lines.map((_, i) => i + 1);

  const handleKeyDown = (e) => {
    // Tab key inserts 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onContentChange(tab.path, newValue);
      // Restore cursor position after React re-renders
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      onSave(tab.path);
    }
  };

  const handleScroll = () => {
    if (lineCountRef.current && textareaRef.current) {
      lineCountRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className={styles.editorWrapper}>
      <div className={styles.lineNumbers} ref={lineCountRef}>
        {lineNumbers.map(n => (
          <div key={n} className={styles.lineNumber}>{n}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className={styles.codeArea}
        value={tab?.content || ''}
        onChange={(e) => onContentChange(tab.path, e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}

function WelcomePane({ onOpenFolder }) {
  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeIcon}>
        <svg viewBox="0 0 56 43" width={48} height={37} fill="none">
          <defs>
            <linearGradient id="wg" x1="28" y1="0" x2="28" y2="43" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E4E4E7" />
              <stop offset="1" stopColor="#52525B" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="56" height="11" rx="2.5" fill="url(#wg)" />
          <rect x="14" y="11" width="28" height="17" rx="2" fill="url(#wg)" />
          <rect x="7" y="28" width="42" height="7" rx="2" fill="url(#wg)" />
          <rect x="4" y="35" width="48" height="4" rx="2" fill="url(#wg)" />
        </svg>
      </div>
      <h2 className={styles.welcomeTitle}>Welcome to Foundry</h2>
      <p className={styles.welcomeDesc}>Open a project to start coding</p>
      <div className={styles.welcomeActions}>
        <button className={styles.welcomeBtn} onClick={onOpenFolder}>
          <FiFolder size={16} />
          Open Folder
        </button>
      </div>
      <div className={styles.welcomeShortcuts}>
        <div className={styles.shortcutRow}>
          <kbd className={styles.kbd}>⌘ B</kbd>
          <span>Toggle sidebar</span>
        </div>
        <div className={styles.shortcutRow}>
          <kbd className={styles.kbd}>⌘ J</kbd>
          <span>Toggle chat</span>
        </div>
        <div className={styles.shortcutRow}>
          <kbd className={styles.kbd}>⌘ S</kbd>
          <span>Save file</span>
        </div>
        <div className={styles.shortcutRow}>
          <kbd className={styles.kbd}>⌘ ,</kbd>
          <span>Settings</span>
        </div>
      </div>
    </div>
  );
}

export default function EditorArea({ tabs, activeTab, onSelectTab, onCloseTab, onContentChange, onSaveFile, onOpenFolder, project }) {
  const currentTab = tabs.find(t => t.path === activeTab);

  return (
    <div className={styles.root}>
      {tabs.length > 0 && (
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />
      )}
      <div className={styles.editorContent}>
        {currentTab ? (
          <CodeEditor
            tab={currentTab}
            onContentChange={onContentChange}
            onSave={onSaveFile}
          />
        ) : (
          <WelcomePane onOpenFolder={onOpenFolder} />
        )}
      </div>
    </div>
  );
}
