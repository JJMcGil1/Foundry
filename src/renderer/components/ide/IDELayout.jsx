import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { TbLayoutBottombar, TbLayoutBottombarFilled, TbLayoutSidebar, TbLayoutSidebarFilled, TbLayoutSidebarRight, TbLayoutSidebarRightFilled } from 'react-icons/tb';
import { FiSun, FiMoon } from 'react-icons/fi';
import { ActivityBar, Sidebar } from './sidebar';
import { EditorArea } from './editor';
import ChatPanelContainer from './ChatPanelContainer';
import { TerminalPanel } from './terminal';
import { SettingsPage } from './settings';
import { SearchBar, ProjectControls } from './titlebar';
import styles from './IDELayout.module.css';
import foundryIconDark from '../../assets/foundry-icon-dark.svg';
import foundryIconLight from '../../assets/foundry-icon-light.svg';

export default function IDELayout({ profile, onProfileChange, initialProjectPath }) {
  const [activePanel, setActivePanel] = useState('files');
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [chatWidth, setChatWidth] = useState(340);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [chatVisible, setChatVisible] = useState(true);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [preMaxTerminalHeight, setPreMaxTerminalHeight] = useState(240);
  const [maxTerminalHeight, setMaxTerminalHeight] = useState(600);
  const [showSettings, setShowSettings] = useState(false);
  const editorContainerRef = useRef(null);

  const [windowState, setWindowState] = useState({ isFullScreen: false, isMaximized: false });

  // Convenience booleans
  const isFullScreen = windowState.isFullScreen;
  const isMaximizedOrFullscreen = windowState.isFullScreen || windowState.isMaximized;

  useEffect(() => {
    // Live window state updates from main process
    const cleanup = window.foundry?.onWindowStateChange?.((state) => {
      setWindowState(state);
    });

    // Initial check
    window.foundry?.getWindowState?.().then(state => {
      if (state && typeof state === 'object') setWindowState(state);
    }).catch(() => {});

    return () => {
      cleanup?.();
    };
  }, []);

  const [project, setProject] = useState(null);
  const [fileTree, setFileTree] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [gitStatus, setGitStatus] = useState({ branch: '', files: [], isRepo: false });

  // Restore project on mount: prefer initialProjectPath (new window), fall back to last opened
  useEffect(() => {
    async function restoreProject() {
      const targetPath = initialProjectPath || await window.foundry?.getSetting('last_project_path');
      if (!targetPath) return;
      try {
        const tree = await window.foundry?.readDir(targetPath);
        if (tree) {
          const name = targetPath.split('/').pop() || targetPath.split('\\').pop() || targetPath;
          setProject({ path: targetPath, name });
          setFileTree(tree);
          const status = await window.foundry?.gitStatus(targetPath);
          if (status) setGitStatus(status);
          // Only update last_project_path if no explicit initial path (avoid overwriting other windows)
          if (!initialProjectPath) return;
          await window.foundry?.setSetting('last_project_path', targetPath);
        }
      } catch {
        // Folder no longer exists
        if (!initialProjectPath) {
          await window.foundry?.setSetting('last_project_path', '');
        }
      }
    }
    restoreProject();
  }, []);

  // Derive current effective theme (reactive via state)
  const [currentTheme, setCurrentTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  );

  // Watch for theme attribute changes (from settings page, system changes, etc.)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme') || 'dark';
      setCurrentTheme(t);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleThemeToggle = useCallback(async () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    setCurrentTheme(newTheme);
    await window.foundry?.updateProfile({ theme: newTheme });
    if (onProfileChange) await onProfileChange();
  }, [currentTheme, onProfileChange]);

  const handleSidebarWidthChange = useCallback((newWidth) => {
    setSidebarWidth(newWidth);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const result = await window.foundry?.openFolder();
    if (result) {
      setProject({ path: result.path, name: result.name });
      setFileTree(result.tree);
      setOpenTabs([]);
      setActiveTab(null);
      const status = await window.foundry?.gitStatus(result.path);
      if (status) setGitStatus(status);
      // Persist last project
      await window.foundry?.setSetting('last_project_path', result.path);
    }
  }, []);

  const handleOpenFile = useCallback(async (filePath) => {
    const existing = openTabs.find(t => t.path === filePath);
    if (existing) { setActiveTab(filePath); return; }
    const file = await window.foundry?.readFile(filePath);
    if (file && !file.error) {
      setOpenTabs(prev => [...prev, {
        path: file.path, name: file.name, content: file.content,
        language: file.language, modified: false, originalContent: file.content,
      }]);
      setActiveTab(filePath);
    }
  }, [openTabs]);

  const handleCloseTab = useCallback((filePath) => {
    setOpenTabs(prev => {
      const next = prev.filter(t => t.path !== filePath);
      if (activeTab === filePath) setActiveTab(next.length > 0 ? next[next.length - 1].path : null);
      return next;
    });
  }, [activeTab]);

  const handleContentChange = useCallback((filePath, newContent) => {
    setOpenTabs(prev => prev.map(t =>
      t.path === filePath ? { ...t, content: newContent, modified: newContent !== t.originalContent } : t
    ));
  }, []);

  const handleSaveFile = useCallback(async (filePath) => {
    const tab = openTabs.find(t => t.path === filePath);
    if (!tab) return;
    const result = await window.foundry?.writeFile(filePath, tab.content);
    if (result?.success) {
      setOpenTabs(prev => prev.map(t =>
        t.path === filePath ? { ...t, modified: false, originalContent: tab.content } : t
      ));
    }
  }, [openTabs]);

  const handleSwitchWorkspace = useCallback(async (workspace) => {
    try {
      const tree = await window.foundry?.readDir(workspace.path);
      if (tree) {
        setProject({ path: workspace.path, name: workspace.name });
        setFileTree(tree);
        setOpenTabs([]);
        setActiveTab(null);
        const status = await window.foundry?.gitStatus(workspace.path);
        if (status) setGitStatus(status);
        await window.foundry?.setSetting('last_project_path', workspace.path);
      }
    } catch {
      // Folder may no longer exist
    }
  }, []);

  const refreshTree = useCallback(async () => {
    if (!project) return;
    const tree = await window.foundry?.readDir(project.path);
    if (tree) setFileTree(tree);
    const status = await window.foundry?.gitStatus(project.path);
    if (status) setGitStatus(status);
  }, [project]);

  // Poll git status for real-time updates
  useEffect(() => {
    if (!project) return;
    const interval = setInterval(async () => {
      const status = await window.foundry?.gitStatus(project.path);
      if (status) setGitStatus(status);
    }, 3000);
    return () => clearInterval(interval);
  }, [project]);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (activeTab) handleSaveFile(activeTab); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setSidebarVisible(v => !v); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') { e.preventDefault(); setChatVisible(v => !v); }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') { e.preventDefault(); setTerminalVisible(v => !v); }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); setShowSettings(v => !v); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSaveFile]);

  const handleActivityClick = (panel) => {
    if (panel === 'settings') { setShowSettings(v => !v); return; }
    if (showSettings) { setShowSettings(false); setActivePanel(panel); setSidebarVisible(true); return; }
    if (activePanel === panel && sidebarVisible) { setSidebarVisible(false); }
    else { setActivePanel(panel); setSidebarVisible(true); }
  };

  return (
    <div className={styles.root}>
      <div className={styles.activityColumn}>
        <div className={`${styles.trafficLightSpacer} titlebar-drag`}>
          {isFullScreen && (
            <img
              src={currentTheme === 'dark' ? foundryIconDark : foundryIconLight}
              alt="Foundry"
              className={styles.titlebarLogo}
              draggable={false}
            />
          )}
        </div>
        <ActivityBar
          activePanel={activePanel}
          onPanelClick={handleActivityClick}
          profile={profile}
          showSettings={showSettings}
        />
      </div>

      <div className={styles.rightColumn}>
        <div className={`${styles.titlebar} titlebar-drag`}>
          <div className={`${styles.titlebarLeft} titlebar-no-drag`}>
            {!isFullScreen && (
              <img
                src={currentTheme === 'dark' ? foundryIconDark : foundryIconLight}
                alt="Foundry"
                className={styles.titlebarLogo}
                draggable={false}
              />
            )}
            <ProjectControls
              currentProject={project}
              onSwitchWorkspace={handleSwitchWorkspace}
              onOpenFolder={handleOpenFolder}
              gitStatus={gitStatus}
              projectPath={project?.path}
              onRefresh={refreshTree}
            />
          </div>
          <SearchBar projectPath={project?.path} onOpenFile={handleOpenFile} />
          <div className={`${styles.titlebarActions} titlebar-no-drag`}>
            <button
              className={styles.titlebarBtn}
              onClick={handleThemeToggle}
              title={currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <span className={styles.iconCrossfade}>
                <FiSun size={18} className={`${styles.themeIcon} ${currentTheme === 'dark' ? '' : styles.themeIconHidden}`} />
                <FiMoon size={18} className={`${styles.themeIcon} ${currentTheme === 'dark' ? styles.themeIconHidden : ''}`} />
              </span>
            </button>
            <div className={styles.titlebarDivider} />
            <button
              className={`${styles.titlebarBtn} ${sidebarVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setSidebarVisible(v => !v)}
              title="Toggle Sidebar"
            >
              <span className={styles.iconCrossfade}>
                <TbLayoutSidebar size={20} className={`${styles.iconBase} ${sidebarVisible ? styles.iconHidden : ''}`} />
                <TbLayoutSidebarFilled size={20} className={`${styles.iconFill} ${sidebarVisible ? '' : styles.iconHidden}`} />
              </span>
            </button>
            <button
              className={`${styles.titlebarBtn} ${terminalVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setTerminalVisible(v => !v)}
              title="Toggle Terminal"
            >
              <span className={styles.iconCrossfade}>
                <TbLayoutBottombar size={20} className={`${styles.iconBase} ${terminalVisible ? styles.iconHidden : ''}`} />
                <TbLayoutBottombarFilled size={20} className={`${styles.iconFill} ${terminalVisible ? '' : styles.iconHidden}`} />
              </span>
            </button>
            <button
              className={`${styles.titlebarBtn} ${chatVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setChatVisible(v => !v)}
              title="Toggle Right Panel"
            >
              <span className={styles.iconCrossfade}>
                <TbLayoutSidebarRight size={20} className={`${styles.iconBase} ${chatVisible ? styles.iconHidden : ''}`} />
                <TbLayoutSidebarRightFilled size={20} className={`${styles.iconFill} ${chatVisible ? '' : styles.iconHidden}`} />
              </span>
            </button>
          </div>
        </div>
        <div className={styles.main}>
          <AnimatePresence initial={false}>
            {sidebarVisible && !showSettings && (
              <Sidebar
                key="sidebar"
                panel={activePanel}
                width={sidebarWidth}
                project={project}
                fileTree={fileTree}
                gitStatus={gitStatus}
                onOpenFile={handleOpenFile}
                onOpenFolder={handleOpenFolder}
                onRefresh={refreshTree}
                projectPath={project?.path}
                onWidthChange={handleSidebarWidthChange}
                activeFile={activeTab}
              />
            )}
          </AnimatePresence>
          <div className={styles.editorContainer} ref={editorContainerRef}>
            <div className={`${styles.editorArea} ${terminalMaximized ? styles.editorAreaHidden : ''}`}>
              {/* Keep both mounted; toggle visibility so SettingsPage retains state across open/close */}
              <div style={{ display: showSettings ? 'contents' : 'none' }}>
                <SettingsPage
                  profile={profile}
                  onClose={() => setShowSettings(false)}
                  onProfileChange={onProfileChange}
                  onCloneRepo={(result) => {
                    setProject({ path: result.path, name: result.name });
                    setFileTree(result.tree);
                    setOpenTabs([]);
                    setActiveTab(null);
                    setShowSettings(false);
                    window.foundry?.setSetting('last_project_path', result.path);
                    window.foundry?.gitStatus(result.path).then(status => {
                      if (status) setGitStatus(status);
                    });
                  }}
                />
              </div>
              <div style={{ display: showSettings ? 'none' : 'contents' }}>
                <EditorArea
                  tabs={openTabs} activeTab={activeTab} onSelectTab={setActiveTab}
                  onCloseTab={handleCloseTab} onContentChange={handleContentChange}
                  onSaveFile={handleSaveFile} onOpenFolder={handleOpenFolder} project={project}
                  onReorderTabs={setOpenTabs}
                />
              </div>
            </div>
            <TerminalPanel
              height={terminalMaximized ? maxTerminalHeight : terminalHeight}
              onHeightChange={setTerminalHeight}
              projectPath={project?.path}
              visible={terminalVisible && !showSettings}
              onClose={() => { setTerminalVisible(false); setTerminalMaximized(false); }}
              isMaximized={terminalMaximized}
              onToggleMaximize={() => {
                if (!terminalMaximized) {
                  // Capture the full container height BEFORE state change
                  const fullHeight = editorContainerRef.current?.clientHeight || 600;
                  setPreMaxTerminalHeight(terminalHeight);
                  setMaxTerminalHeight(fullHeight);
                  setTerminalMaximized(true);
                } else {
                  setTerminalMaximized(false);
                  setTerminalHeight(preMaxTerminalHeight);
                }
              }}
            />
          </div>
          <ChatPanelContainer
            visible={chatVisible && !showSettings}
            width={chatWidth}
            onWidthChange={setChatWidth}
            projectPath={project?.path}
            onOpenSettings={(section) => {
              setShowSettings(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
