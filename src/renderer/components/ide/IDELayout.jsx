import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FiSun, FiMoon } from 'react-icons/fi';
import { PiTerminalWindow, PiTerminalWindowFill } from 'react-icons/pi';
import { TbLayoutSidebar, TbLayoutSidebarFilled, TbLayoutSidebarRight, TbLayoutSidebarRightFilled } from 'react-icons/tb';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import EditorArea from './EditorArea';
import ChatPanel from './ChatPanel';
import TerminalPanel from './TerminalPanel';
import SettingsPage from './SettingsPage';
import SearchBar from './SearchBar';
import styles from './IDELayout.module.css';
import foundryIconDark from '../../assets/foundry-icon-dark.svg';
import foundryIconLight from '../../assets/foundry-icon-light.svg';

export default function IDELayout({ profile, onProfileChange }) {
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

  const [project, setProject] = useState(null);
  const [fileTree, setFileTree] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [gitStatus, setGitStatus] = useState({ branch: '', files: [], isRepo: false });

  // Derive current effective theme
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

  const handleSidebarWidthChange = useCallback((newWidth) => {
    setSidebarWidth(newWidth);
  }, []);

  const handleToggleTheme = useCallback(async () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    await window.foundry?.updateProfile({ theme: newTheme });
    if (onProfileChange) onProfileChange();
  }, [currentTheme, onProfileChange]);

  const handleOpenFolder = useCallback(async () => {
    const result = await window.foundry?.openFolder();
    if (result) {
      setProject({ path: result.path, name: result.name });
      setFileTree(result.tree);
      setOpenTabs([]);
      setActiveTab(null);
      const status = await window.foundry?.gitStatus(result.path);
      if (status) setGitStatus(status);
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

  const refreshTree = useCallback(async () => {
    if (!project) return;
    const tree = await window.foundry?.readDir(project.path);
    if (tree) setFileTree(tree);
    const status = await window.foundry?.gitStatus(project.path);
    if (status) setGitStatus(status);
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
        <div className={`${styles.trafficLightSpacer} titlebar-drag`} />
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
            <img
              src={currentTheme === 'dark' ? foundryIconDark : foundryIconLight}
              alt="Foundry"
              className={styles.titlebarLogo}
              draggable={false}
            />
          </div>
          <SearchBar projectPath={project?.path} onOpenFile={handleOpenFile} />
          <div className={`${styles.titlebarActions} titlebar-no-drag`}>
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
                <PiTerminalWindow size={20} className={`${styles.iconBase} ${terminalVisible ? styles.iconHidden : ''}`} />
                <PiTerminalWindowFill size={20} className={`${styles.iconFill} ${terminalVisible ? '' : styles.iconHidden}`} />
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
            <div className={styles.titlebarDivider} />
            <button
              className={styles.titlebarBtn}
              onClick={handleToggleTheme}
              title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {currentTheme === 'dark' ? <FiSun size={20} /> : <FiMoon size={20} />}
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
              {showSettings ? (
                <SettingsPage profile={profile} onClose={() => setShowSettings(false)} onProfileChange={onProfileChange} />
              ) : (
                <EditorArea
                  tabs={openTabs} activeTab={activeTab} onSelectTab={setActiveTab}
                  onCloseTab={handleCloseTab} onContentChange={handleContentChange}
                  onSaveFile={handleSaveFile} onOpenFolder={handleOpenFolder} project={project}
                />
              )}
            </div>
            <AnimatePresence initial={false}>
              {terminalVisible && !showSettings && (
                <TerminalPanel
                  key="terminal"
                  height={terminalMaximized ? maxTerminalHeight : terminalHeight}
                  onHeightChange={setTerminalHeight}
                  projectPath={project?.path}
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
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence initial={false}>
            {chatVisible && !showSettings && (
              <ChatPanel key="chat" width={chatWidth} onWidthChange={setChatWidth} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
