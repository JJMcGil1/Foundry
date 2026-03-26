import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { TbLayoutBottombar, TbLayoutBottombarFilled, TbLayoutSidebar, TbLayoutSidebarFilled, TbLayoutSidebarRight, TbLayoutSidebarRightFilled, TbLayoutSidebarRightExpand, TbLayoutSidebarRightExpandFilled, TbLayoutSidebarLeftExpand, TbLayoutSidebarLeftExpandFilled } from 'react-icons/tb';
import { FiSun, FiMoon } from 'react-icons/fi';
import { VscPlay, VscDebugStop } from 'react-icons/vsc';
import { useToast } from './ToastProvider';
import { ActivityBar, Sidebar } from './sidebar';
import { EditorArea } from './editor';
import ChatPanelContainer from './ChatPanelContainer';
import { TerminalPanel } from './terminal';
import { SettingsPage } from './settings';
import { TasksPage } from './tasks';
import { SearchBar, ProjectControls } from './titlebar';
import styles from './IDELayout.module.css';
import foundryIconDark from '../../assets/foundry-icon-dark.svg';
import foundryIconLight from '../../assets/foundry-icon-light.svg';

export default function IDELayout({ profile, onProfileChange, initialProjectPath }) {
  const [activePanel, setActivePanel] = useState('files');
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [chatWidth, setChatWidth] = useState(340);
  const [leftChatVisible, setLeftChatVisible] = useState(false);
  const [leftChatWidth, setLeftChatWidth] = useState(340);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(false);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(260);
  const [rightActivePanel, setRightActivePanel] = useState('files');
  const [activeSide, setActiveSide] = useState('left');
  const [terminalHeight, setTerminalHeight] = useState(240);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [chatVisible, setChatVisible] = useState(true);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [preMaxTerminalHeight, setPreMaxTerminalHeight] = useState(240);
  const [maxTerminalHeight, setMaxTerminalHeight] = useState(600);
  const [showSettings, setShowSettings] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState(null);
  const editorContainerRef = useRef(null);
  const prePanelSidebarRef = useRef(null);
  const prePanelTerminalRef = useRef(null);

  // Start command state
  const [startCommand, setStartCommand] = useState('');
  const [startRunning, setStartRunning] = useState(false);
  const startPtyIdRef = useRef(null);
  const terminalPanelRef = useRef(null);
  const addToast = useToast();

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

  // Set window title to workspace name
  useEffect(() => {
    window.foundry?.setWindowTitle?.(project?.name || '');
  }, [project]);

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
      // Kill all active agent streams before switching — prevents stale subprocesses
      // from pumping IPC to the wrong workspace and consuming CPU/memory
      await window.foundry?.claudeStopAllStreams?.();

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

  // Poll git status for real-time updates (guards against overlapping calls)
  useEffect(() => {
    if (!project) return;
    let running = false;
    let cancelled = false;
    const interval = setInterval(async () => {
      if (running) return; // Skip if previous poll is still in-flight
      running = true;
      try {
        const status = await window.foundry?.gitStatus(project.path);
        if (!cancelled && status) setGitStatus(status);
      } finally {
        running = false;
      }
    }, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [project]);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (activeTab) handleSaveFile(activeTab); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); setRightSidebarVisible(v => !v); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setSidebarVisible(v => !v); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'j' || e.key === 'J')) { e.preventDefault(); setLeftChatVisible(v => !v); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') { e.preventDefault(); setChatVisible(v => !v); }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') { e.preventDefault(); setTerminalVisible(v => !v); }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(v => {
          if (!v) { enterFullPage(); setShowTasks(false); }
          else { exitFullPage(); }
          return !v;
        });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSaveFile]);

  const isFullPage = showSettings || showTasks;

  const enterFullPage = () => {
    // Save current state before collapsing
    prePanelSidebarRef.current = sidebarVisible;
    prePanelTerminalRef.current = terminalVisible;
    setSidebarVisible(false);
    setTerminalVisible(false);
  };

  const exitFullPage = () => {
    // Restore previous state
    if (prePanelSidebarRef.current) setSidebarVisible(true);
    if (prePanelTerminalRef.current) setTerminalVisible(true);
    prePanelSidebarRef.current = null;
    prePanelTerminalRef.current = null;
  };

  const handleActivityClick = (panel) => {
    if (panel === 'settings') {
      const wasOpen = showSettings;
      setShowSettings(v => !v);
      setShowTasks(false);
      if (!wasOpen) enterFullPage();
      else exitFullPage();
      return;
    }
    if (panel === 'tasks') {
      const wasOpen = showTasks;
      setShowTasks(v => !v);
      setShowSettings(false);
      if (!wasOpen) enterFullPage();
      else exitFullPage();
      return;
    }

    // Route to active side (left or right sidebar)
    const isRight = activeSide === 'right' && rightSidebarVisible;

    if (isRight) {
      // Control right sidebar
      if (rightActivePanel === panel && rightSidebarVisible) {
        setRightSidebarVisible(false);
      } else {
        setRightActivePanel(panel);
        setRightSidebarVisible(true);
      }
    } else {
      // Control left sidebar (default)
      if (isFullPage) {
        if (activePanel === panel && sidebarVisible) { setSidebarVisible(false); }
        else { setActivePanel(panel); setSidebarVisible(true); }
        return;
      }
      if (activePanel === panel && sidebarVisible) { setSidebarVisible(false); }
      else { setActivePanel(panel); setSidebarVisible(true); }
    }
  };

  // Load saved start command when project changes
  useEffect(() => {
    if (!project?.path) return;
    const key = `start_command_${project.path}`;
    window.foundry?.getSetting(key).then((cmd) => {
      if (cmd) setStartCommand(cmd);
      else setStartCommand('');
    }).catch(() => {});
    // Cleanup running process if project switches
    return () => {
      if (startPtyIdRef.current) {
        terminalPanelRef.current?.killByPtyId(startPtyIdRef.current);
        startPtyIdRef.current = null;
        setStartRunning(false);
      }
    };
  }, [project?.path]);

  const handleStartCommand = useCallback(async (cmdOverride) => {
    const cmd = (cmdOverride || startCommand).trim();
    if (!cmd || !project?.path) return;

    setStartRunning(true);

    const ptyId = await terminalPanelRef.current?.runCommand(cmd);
    if (!ptyId) {
      setStartRunning(false);
      addToast({ message: 'Failed to start process', type: 'error', sound: false });
      return;
    }
    startPtyIdRef.current = ptyId;

    // Listen for exit to update running state
    const cleanupExit = window.foundry?.onTerminalExit((id) => {
      if (id === ptyId) {
        setStartRunning(false);
        startPtyIdRef.current = null;
        cleanupExit?.();
      }
    });

    addToast({ message: `Started: ${cmd}`, type: 'success', sound: false });
  }, [startCommand, project?.path, addToast]);

  const handleStopCommand = useCallback(() => {
    if (startPtyIdRef.current) {
      terminalPanelRef.current?.killByPtyId(startPtyIdRef.current);
      startPtyIdRef.current = null;
      setStartRunning(false);
      addToast({ message: 'Process stopped', type: 'info', sound: false });
    }
  }, [addToast]);

  const handleStartButtonClick = useCallback(async () => {
    if (startRunning) {
      handleStopCommand();
      return;
    }
    // Always re-read the command fresh from settings to avoid stale state
    let cmd = startCommand;
    if (project?.path) {
      try {
        const saved = await window.foundry?.getSetting(`start_command_${project.path}`);
        if (saved !== undefined) {
          cmd = saved || '';
          setStartCommand(cmd);
        }
      } catch {}
    }
    if (!cmd.trim()) {
      addToast({ message: 'No start command configured. Set one in Workspace settings.', type: 'error' });
      setSettingsInitialSection('workspace');
      if (!showSettings) enterFullPage();
      setShowSettings(true);
      setShowTasks(false);
      return;
    }
    // Pass fresh command directly to avoid stale closure
    handleStartCommand(cmd);
  }, [startRunning, startCommand, project?.path, handleStopCommand, handleStartCommand, addToast, showSettings]);

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
          showTasks={showTasks}
          gitChangeCount={gitStatus?.files?.length || 0}
          rightActivePanel={rightActivePanel}
          rightSidebarVisible={rightSidebarVisible}
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
            <button
              className={`${styles.startBtn} ${startRunning ? styles.startBtnRunning : ''}`}
              onClick={handleStartButtonClick}
              title={startRunning ? 'Stop process' : (startCommand ? `Run: ${startCommand}` : 'Set start command')}
            >
              {startRunning ? (
                <>
                  <VscDebugStop size={13} />
                  <span className={styles.startBtnLabel}>Stop</span>
                  <span className={styles.startBtnDot} />
                </>
              ) : (
                <>
                  <VscPlay size={13} />
                  <span className={styles.startBtnLabel}>Start</span>
                </>
              )}
            </button>
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
              title="Toggle Sidebar (⌘B)"
            >
              <span className={styles.iconCrossfade}>
                <TbLayoutSidebar size={20} className={`${styles.iconBase} ${sidebarVisible ? styles.iconHidden : ''}`} />
                <TbLayoutSidebarFilled size={20} className={`${styles.iconFill} ${sidebarVisible ? '' : styles.iconHidden}`} />
              </span>
            </button>
            <button
              className={`${styles.titlebarBtn} ${leftChatVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setLeftChatVisible(v => !v)}
              title="Toggle Left Chat (⌘⇧J)"
            >
              <span className={styles.iconCrossfade}>
                <TbLayoutSidebarLeftExpand size={20} className={`${styles.iconBase} ${leftChatVisible ? styles.iconHidden : ''}`} />
                <TbLayoutSidebarLeftExpandFilled size={20} className={`${styles.iconFill} ${leftChatVisible ? '' : styles.iconHidden}`} />
              </span>
            </button>
            <button
              className={`${styles.titlebarBtn} ${terminalVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setTerminalVisible(v => !v)}
              title="Toggle Terminal (⌘`)"
            >
              <span className={styles.iconCrossfade}>
                <TbLayoutBottombar size={20} className={`${styles.iconBase} ${terminalVisible ? styles.iconHidden : ''}`} />
                <TbLayoutBottombarFilled size={20} className={`${styles.iconFill} ${terminalVisible ? '' : styles.iconHidden}`} />
              </span>
            </button>
            <button
              className={`${styles.titlebarBtn} ${chatVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setChatVisible(v => !v)}
              title="Toggle Right Chat (⌘J)"
            >
              <span className={styles.iconCrossfade}>
                <TbLayoutSidebarRightExpand size={20} className={`${styles.iconBase} ${chatVisible ? styles.iconHidden : ''}`} />
                <TbLayoutSidebarRightExpandFilled size={20} className={`${styles.iconFill} ${chatVisible ? '' : styles.iconHidden}`} />
              </span>
            </button>
            <button
              className={`${styles.titlebarBtn} ${rightSidebarVisible ? styles.titlebarBtnActive : ''}`}
              onClick={() => setRightSidebarVisible(v => !v)}
              title="Toggle Right Sidebar (⌘⇧B)"
            >
              <span className={styles.iconCrossfade}>
                <TbLayoutSidebarRight size={20} className={`${styles.iconBase} ${rightSidebarVisible ? styles.iconHidden : ''}`} />
                <TbLayoutSidebarRightFilled size={20} className={`${styles.iconFill} ${rightSidebarVisible ? '' : styles.iconHidden}`} />
              </span>
            </button>
          </div>
        </div>
        <div className={styles.main}>
          <AnimatePresence initial={false}>
            {sidebarVisible && (
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
                onFocus={() => setActiveSide('left')}
                isActive={activeSide === 'left'}
              />
            )}
          </AnimatePresence>
          <ChatPanelContainer
            visible={leftChatVisible}
            width={leftChatWidth}
            onWidthChange={setLeftChatWidth}
            projectPath={project?.path}
            side="left"
            onOpenSettings={(section) => {
              setSettingsInitialSection(section || null);
              if (!showSettings) enterFullPage();
              setShowSettings(true);
              setShowTasks(false);
            }}
          />
          <div className={styles.editorContainer} ref={editorContainerRef}>
            <div className={`${styles.editorArea} ${terminalMaximized ? styles.editorAreaHidden : ''}`}>
              {/* Keep all mounted; toggle visibility so pages retain state across open/close */}
              <div style={{ display: showSettings ? 'contents' : 'none' }}>
                <SettingsPage
                  profile={profile}
                  initialSection={settingsInitialSection}
                  projectPath={project?.path}
                  onClose={() => {
                    setShowSettings(false);
                    setSettingsInitialSection(null);
                    exitFullPage();
                    // Re-read start command in case it was changed in workspace settings
                    if (project?.path) {
                      window.foundry?.getSetting(`start_command_${project.path}`).then((cmd) => {
                        if (cmd !== undefined) setStartCommand(cmd || '');
                      }).catch(() => {});
                    }
                  }}
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
              <div style={{ display: showTasks ? 'contents' : 'none' }}>
                <TasksPage workspacePath={project?.path} onClose={() => { setShowTasks(false); exitFullPage(); }} />
              </div>
              <div style={{ display: (showSettings || showTasks) ? 'none' : 'contents' }}>
                <EditorArea
                  tabs={openTabs} activeTab={activeTab} onSelectTab={setActiveTab}
                  onCloseTab={handleCloseTab} onContentChange={handleContentChange}
                  onSaveFile={handleSaveFile} onOpenFolder={handleOpenFolder} project={project}
                  onReorderTabs={setOpenTabs}
                />
              </div>
            </div>
            <TerminalPanel
              ref={terminalPanelRef}
              height={terminalMaximized ? maxTerminalHeight : terminalHeight}
              onHeightChange={setTerminalHeight}
              projectPath={project?.path}
              visible={terminalVisible}
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
            visible={chatVisible}
            width={chatWidth}
            onWidthChange={setChatWidth}
            projectPath={project?.path}
            onOpenSettings={(section) => {
              setSettingsInitialSection(section || null);
              if (!showSettings) enterFullPage();
              setShowSettings(true);
              setShowTasks(false);
            }}
          />
          <AnimatePresence initial={false}>
            {rightSidebarVisible && (
              <Sidebar
                key="right-sidebar"
                panel={rightActivePanel}
                width={rightSidebarWidth}
                project={project}
                fileTree={fileTree}
                gitStatus={gitStatus}
                onOpenFile={handleOpenFile}
                onOpenFolder={handleOpenFolder}
                onRefresh={refreshTree}
                projectPath={project?.path}
                onWidthChange={setRightSidebarWidth}
                activeFile={activeTab}
                side="right"
                onFocus={() => setActiveSide('right')}
                isActive={activeSide === 'right'}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
