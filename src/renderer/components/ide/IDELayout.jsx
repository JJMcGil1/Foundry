import React, { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FiSidebar, FiSun, FiMoon } from 'react-icons/fi';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import EditorArea from './EditorArea';
import ChatPanel from './ChatPanel';
import SettingsPage from './SettingsPage';
import styles from './IDELayout.module.css';

export default function IDELayout({ profile, onProfileChange }) {
  const [activePanel, setActivePanel] = useState('files');
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [chatWidth, setChatWidth] = useState(340);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [chatVisible, setChatVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

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
          <div className={`${styles.titlebarActions} titlebar-no-drag`}>
            <button
              className={`${styles.titlebarBtn} ${sidebarVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setSidebarVisible(v => !v)}
              title="Toggle Sidebar"
            >
              <FiSidebar size={15} />
            </button>
            <button
              className={`${styles.titlebarBtn} ${chatVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setChatVisible(v => !v)}
              title="Toggle Right Panel"
            >
              <FiSidebar size={15} style={{ transform: 'scaleX(-1)' }} />
            </button>
            <div className={styles.titlebarDivider} />
            <button
              className={styles.titlebarBtn}
              onClick={handleToggleTheme}
              title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {currentTheme === 'dark' ? <FiSun size={15} /> : <FiMoon size={15} />}
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
          <div className={styles.editorContainer}>
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
            {chatVisible && !showSettings && (
              <ChatPanel key="chat" width={chatWidth} onWidthChange={setChatWidth} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
