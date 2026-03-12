import React, { useState, useCallback, useEffect } from 'react';
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

  // Project state
  const [project, setProject] = useState(null);
  const [fileTree, setFileTree] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [gitStatus, setGitStatus] = useState({ branch: '', files: [], isRepo: false });

  // Open folder
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

  // Open file in editor
  const handleOpenFile = useCallback(async (filePath) => {
    const existing = openTabs.find(t => t.path === filePath);
    if (existing) {
      setActiveTab(filePath);
      return;
    }
    const file = await window.foundry?.readFile(filePath);
    if (file && !file.error) {
      const newTab = {
        path: file.path,
        name: file.name,
        content: file.content,
        language: file.language,
        modified: false,
        originalContent: file.content,
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTab(filePath);
    }
  }, [openTabs]);

  // Close tab
  const handleCloseTab = useCallback((filePath) => {
    setOpenTabs(prev => {
      const next = prev.filter(t => t.path !== filePath);
      if (activeTab === filePath) {
        setActiveTab(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  }, [activeTab]);

  // Update file content
  const handleContentChange = useCallback((filePath, newContent) => {
    setOpenTabs(prev => prev.map(t =>
      t.path === filePath
        ? { ...t, content: newContent, modified: newContent !== t.originalContent }
        : t
    ));
  }, []);

  // Save file
  const handleSaveFile = useCallback(async (filePath) => {
    const tab = openTabs.find(t => t.path === filePath);
    if (!tab) return;
    const result = await window.foundry?.writeFile(filePath, tab.content);
    if (result?.success) {
      setOpenTabs(prev => prev.map(t =>
        t.path === filePath
          ? { ...t, modified: false, originalContent: tab.content }
          : t
      ));
    }
  }, [openTabs]);

  // Refresh file tree
  const refreshTree = useCallback(async () => {
    if (!project) return;
    const tree = await window.foundry?.readDir(project.path);
    if (tree) setFileTree(tree);
    const status = await window.foundry?.gitStatus(project.path);
    if (status) setGitStatus(status);
  }, [project]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activeTab) handleSaveFile(activeTab);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarVisible(v => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        setChatVisible(v => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(v => !v);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSaveFile]);

  const handleActivityClick = (panel) => {
    if (panel === 'settings') {
      setShowSettings(v => !v);
      return;
    }
    // Clicking a non-settings panel always closes settings and switches to that panel
    if (showSettings) {
      setShowSettings(false);
      setActivePanel(panel);
      setSidebarVisible(true);
      return;
    }
    // Toggle sidebar if clicking the already-active panel
    if (activePanel === panel && sidebarVisible) {
      setSidebarVisible(false);
    } else {
      setActivePanel(panel);
      setSidebarVisible(true);
    }
  };

  return (
    <div className={styles.root}>
      <div className={`${styles.titlebar} titlebar-drag`} />
      <div className={styles.main}>
        <ActivityBar
          activePanel={activePanel}
          onPanelClick={handleActivityClick}
          profile={profile}
          showSettings={showSettings}
        />
        {sidebarVisible && !showSettings && (
          <Sidebar
            panel={activePanel}
            width={sidebarWidth}
            project={project}
            fileTree={fileTree}
            gitStatus={gitStatus}
            onOpenFile={handleOpenFile}
            onOpenFolder={handleOpenFolder}
            onRefresh={refreshTree}
            projectPath={project?.path}
          />
        )}
        <div className={styles.editorContainer}>
          {showSettings ? (
            <SettingsPage
              profile={profile}
              onClose={() => setShowSettings(false)}
              onProfileChange={onProfileChange}
            />
          ) : (
            <EditorArea
              tabs={openTabs}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onCloseTab={handleCloseTab}
              onContentChange={handleContentChange}
              onSaveFile={handleSaveFile}
              onOpenFolder={handleOpenFolder}
              project={project}
            />
          )}
        </div>
        {chatVisible && !showSettings && (
          <ChatPanel width={chatWidth} />
        )}
      </div>
    </div>
  );
}
