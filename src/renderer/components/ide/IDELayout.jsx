import React, { useState, useCallback, useEffect, useRef } from 'react';
import { VscFiles, VscSourceControl } from 'react-icons/vsc';
import { FiSun, FiMoon, FiPlus, FiGithub, FiTerminal, FiMessageSquare, FiFilePlus, FiFolderPlus, FiRefreshCw } from 'react-icons/fi';
import { VscPlay, VscDebugStop } from 'react-icons/vsc';
import { useToast } from './ToastProvider';
import { ActivityBar, FileTreeItem, GitPanel, WorkflowsPanel, MiniTooltipBtn } from './sidebar';
import PanelHeader from './PanelHeader';
import { EditorArea } from './editor';
import ChatPanel from './ChatPanel';
import { TerminalPanel } from './terminal';
import { SettingsPage } from './settings';
import { SearchBar, ProjectControls } from './titlebar';
import styles from './IDELayout.module.css';
import sidebarStyles from './Sidebar.module.css';
import foundryIconDark from '../../assets/foundry-icon-dark.svg';
import foundryIconLight from '../../assets/foundry-icon-light.svg';

// ── Panel type config ──
const PANEL_TYPES = {
  files:     { title: 'Explorer',       icon: VscFiles,          defaultWidth: 260, minWidth: 80, singleton: true },
  git:       { title: 'Source Control',  icon: VscSourceControl,  defaultWidth: 280, minWidth: 80, singleton: true },
  workflows: { title: 'Workflows',       icon: FiGithub,          defaultWidth: 260, minWidth: 80, singleton: true },
  terminal:  { title: 'Terminal',        icon: FiTerminal,        defaultWidth: 450, minWidth: 80 },
  chat:      { title: 'Chat',           icon: FiMessageSquare,   defaultWidth: 360, minWidth: 80 },
  editor:    { title: 'Editor',         icon: VscFiles,          minWidth: 80, flex: true, singleton: true },
};

let nextPanelId = 0;
function makePanelId() { return `panel-${++nextPanelId}`; }

export default function IDELayout({ profile, onProfileChange, initialProjectPath }) {
  // ── Panel state ──
  const [panels, setPanels] = useState(() => [
    { id: makePanelId(), type: 'chat', width: 260 },
  ]);
  const [dragPanelIndex, setDragPanelIndex] = useState(null);
  const [dragOverPanelIndex, setDragOverPanelIndex] = useState(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const addPanelRef = useRef(null);

  const isResizingRef = useRef(false);
  const panelStripRef = useRef(null);

  // ── Existing IDE state ──
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState(null);

  const [startCommand, setStartCommand] = useState('');
  const [startRunning, setStartRunning] = useState(false);
  const startPtyIdRef = useRef(null);
  const terminalPanelRef = useRef(null);
  const addToast = useToast();

  const [windowState, setWindowState] = useState({ isFullScreen: false, isMaximized: false });
  const isFullScreen = windowState.isFullScreen;

  useEffect(() => {
    const cleanup = window.foundry?.onWindowStateChange?.((state) => setWindowState(state));
    window.foundry?.getWindowState?.().then(state => {
      if (state && typeof state === 'object') setWindowState(state);
    }).catch(() => {});
    return () => cleanup?.();
  }, []);

  const [project, setProject] = useState(null);
  const [fileTree, setFileTree] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [gitStatus, setGitStatus] = useState({ branch: '', files: [], isRepo: false });
  const [gitRefreshKey, setGitRefreshKey] = useState(0);

  // File tree expanded paths (moved from Sidebar)
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const expandPersistTimer = useRef(null);

  const [currentTheme, setCurrentTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  );

  // ── Restore project ──
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
          if (!initialProjectPath) return;
          await window.foundry?.setSetting('last_project_path', targetPath);
        }
      } catch {
        if (!initialProjectPath) {
          await window.foundry?.setSetting('last_project_path', '');
        }
      }
    }
    restoreProject();
  }, []);

  useEffect(() => { window.foundry?.setWindowTitle?.(project?.name || ''); }, [project]);

  // ── Theme ──
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setCurrentTheme(document.documentElement.getAttribute('data-theme') || 'dark');
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

  // ── File tree persistence ──
  useEffect(() => {
    if (!project?.path) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await window.foundry?.getSetting('file_tree_expanded_paths:' + project.path);
        if (!cancelled && raw) {
          const paths = JSON.parse(raw);
          if (Array.isArray(paths)) { setExpandedPaths(new Set(paths)); return; }
        }
      } catch {}
      if (!cancelled) setExpandedPaths(new Set());
    })();
    return () => { cancelled = true; };
  }, [project?.path]);

  const persistExpandedPaths = useCallback((paths) => {
    if (!project?.path) return;
    clearTimeout(expandPersistTimer.current);
    expandPersistTimer.current = setTimeout(() => {
      window.foundry?.setSetting('file_tree_expanded_paths:' + project.path, JSON.stringify([...paths]));
    }, 300);
  }, [project?.path]);

  const handleToggleExpand = useCallback((path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      persistExpandedPaths(next);
      return next;
    });
  }, [persistExpandedPaths]);

  // ── Project / folder ──
  const handleOpenFolder = useCallback(async () => {
    const result = await window.foundry?.openFolder();
    if (result) {
      setProject({ path: result.path, name: result.name });
      setFileTree(result.tree);
      setOpenTabs([]);
      setActiveTab(null);
      const status = await window.foundry?.gitStatus(result.path);
      if (status) setGitStatus(status);
      await window.foundry?.setSetting('last_project_path', result.path);
    }
  }, []);

  // ── File operations ──
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
      // Ensure editor panel exists
      setPanels(prev => {
        if (prev.some(p => p.type === 'editor')) return prev;
        // Insert editor after the last sidebar-type panel
        const lastSidebarIdx = [...prev].reverse().findIndex(p => ['files', 'git', 'workflows'].includes(p.type));
        const insertIdx = lastSidebarIdx >= 0 ? prev.length - lastSidebarIdx : prev.length;
        const next = [...prev];
        next.splice(insertIdx, 0, { id: makePanelId(), type: 'editor', width: 0 });
        return next;
      });
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

  // Remove editor panel when all tabs close
  useEffect(() => {
    if (openTabs.length === 0 && activeTab === null) {
      setPanels(prev => {
        if (!prev.some(p => p.type === 'editor')) return prev;
        return prev.filter(p => p.type !== 'editor');
      });
    }
  }, [openTabs.length, activeTab]);

  const handleSwitchWorkspace = useCallback(async (workspace) => {
    try {
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
    } catch {}
  }, []);

  const refreshTree = useCallback(async () => {
    if (!project) return;
    const tree = await window.foundry?.readDir(project.path);
    if (tree) setFileTree(tree);
    const status = await window.foundry?.gitStatus(project.path);
    if (status) setGitStatus(status);
    setGitRefreshKey(k => k + 1);
  }, [project]);

  // Poll git status
  useEffect(() => {
    if (!project) return;
    let running = false, cancelled = false;
    const interval = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const status = await window.foundry?.gitStatus(project.path);
        if (!cancelled && status) setGitStatus(status);
      } finally { running = false; }
    }, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [project]);

  // ── Panel management ──
  const addPanel = useCallback((type) => {
    const config = PANEL_TYPES[type];
    if (!config) return;
    if (config.singleton) {
      const existing = panels.find(p => p.type === type);
      if (existing) return existing.id;
    }
    if (type === 'chat' && panels.filter(p => p.type === 'chat').length >= 4) return;
    const isFirstOfType = !panels.some(p => p.type === type);
    const id = makePanelId();
    const newPanel = { id, type, width: config.defaultWidth || 300, startFresh: !isFirstOfType };
    setPanels(prev => [...prev, newPanel]);
    return id;
  }, [panels]);

  const removePanel = useCallback((panelId) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    if (panel.type === 'editor') {
      setOpenTabs([]);
      setActiveTab(null);
    }
    setPanels(prev => prev.filter(p => p.id !== panelId));
  }, [panels]);

  const togglePanel = useCallback((type) => {
    const existing = panels.find(p => p.type === type);
    if (existing) {
      removePanel(existing.id);
    } else {
      addPanel(type);
    }
  }, [panels, addPanel, removePanel]);

  // ── Panel drag-and-drop reordering ──
  const handlePanelDragStart = useCallback((e, index) => {
    setDragPanelIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handlePanelDragOver = useCallback((index) => {
    setDragOverPanelIndex(index);
  }, []);

  const handlePanelDrop = useCallback((targetIndex) => {
    if (dragPanelIndex === null || dragPanelIndex === targetIndex) {
      setDragPanelIndex(null);
      setDragOverPanelIndex(null);
      return;
    }
    setPanels(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragPanelIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragPanelIndex(null);
    setDragOverPanelIndex(null);
  }, [dragPanelIndex]);

  const handlePanelDragEnd = useCallback(() => {
    setDragPanelIndex(null);
    setDragOverPanelIndex(null);
  }, []);

  // ── Panel resize ──
  const SNAP_THRESHOLD = 20; // px from edge to snap
  const handlePanelResize = useCallback((e, handleIndex, isRightEdge = false) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const leftPanel = panels[handleIndex];
    const rightPanel = panels[handleIndex + 1];

    // Right-edge resize: always resize the last panel directly
    if (isRightEdge) {
      const targetPanel = leftPanel;
      const startWidth = targetPanel.width;
      const config = PANEL_TYPES[targetPanel.type] || {};

      const handleMouseMove = (ev) => {
        const delta = ev.clientX - startX;
        let newWidth = Math.max(config.minWidth || 80, startWidth + delta);

        // Snap to container edge
        if (panelStripRef.current) {
          const stripRect = panelStripRef.current.getBoundingClientRect();
          const panelEl = panelStripRef.current.querySelector(`[data-panel-id="${targetPanel.id}"]`);
          if (panelEl) {
            const panelLeft = panelEl.getBoundingClientRect().left;
            const rightEdge = panelLeft + newWidth;
            const containerRight = stripRect.right;
            const distFromEdge = containerRight - rightEdge;
            // Snap: if within threshold, snap to fill exactly
            if (distFromEdge > 0 && distFromEdge < SNAP_THRESHOLD) {
              newWidth = containerRight - panelLeft;
            }
          }
        }

        setPanels(prev => prev.map(p => p.id === targetPanel.id ? { ...p, width: newWidth } : p));
      };
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        isResizingRef.current = false;
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return;
    }

    if (!rightPanel) return;
    const startLeftWidth = leftPanel.width;
    const startRightWidth = rightPanel.width;
    const leftConfig = PANEL_TYPES[leftPanel.type] || {};
    const rightConfig = PANEL_TYPES[rightPanel.type] || {};
    const leftMin = leftConfig.minWidth || 80;
    const rightMin = rightConfig.minWidth || 80;
    const isLeftFlex = !!leftConfig.flex;
    const isRightFlex = !!rightConfig.flex;

    const handleMouseMove = (ev) => {
      const delta = ev.clientX - startX;

      // If one side is flex, only resize the non-flex panel
      if (isLeftFlex) {
        const newWidth = Math.max(rightMin, startRightWidth - delta);
        setPanels(prev => prev.map(p => p.id === rightPanel.id ? { ...p, width: newWidth } : p));
      } else if (isRightFlex) {
        const newWidth = Math.max(leftMin, startLeftWidth + delta);
        setPanels(prev => prev.map(p => p.id === leftPanel.id ? { ...p, width: newWidth } : p));
      } else {
        // Both fixed-width: grow one, shrink the other
        let newLeft = startLeftWidth + delta;
        let newRight = startRightWidth - delta;
        // Clamp both to their minimums
        if (newLeft < leftMin) { newRight += (newLeft - leftMin); newLeft = leftMin; }
        if (newRight < rightMin) { newLeft += (newRight - rightMin); newRight = rightMin; }
        newLeft = Math.max(leftMin, newLeft);
        newRight = Math.max(rightMin, newRight);
        setPanels(prev => prev.map(p =>
          p.id === leftPanel.id ? { ...p, width: newLeft } :
          p.id === rightPanel.id ? { ...p, width: newRight } : p
        ));
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      isResizingRef.current = false;
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panels]);

  // ── Activity bar handler ──
  const handleActivityClick = useCallback((panel) => {
    if (panel === 'settings') {
      setShowSettings(v => !v);
      return;
    }
    togglePanel(panel);
  }, [togglePanel]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (activeTab) handleSaveFile(activeTab); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); togglePanel('files'); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') { e.preventDefault(); togglePanel('chat'); }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') { e.preventDefault(); togglePanel('terminal'); }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(v => !v);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSaveFile, togglePanel]);

  // ── Start command ──
  useEffect(() => {
    if (!project?.path) return;
    window.foundry?.getSetting(`start_command_${project.path}`).then((cmd) => {
      if (cmd) setStartCommand(cmd);
      else setStartCommand('');
    }).catch(() => {});
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
    // Ensure terminal panel exists
    if (!panels.some(p => p.type === 'terminal')) addPanel('terminal');
    setStartRunning(true);
    // Small delay to let terminal mount
    await new Promise(r => setTimeout(r, 100));
    const ptyId = await terminalPanelRef.current?.runCommand(cmd);
    if (!ptyId) {
      setStartRunning(false);
      addToast({ message: 'Failed to start process', type: 'error', sound: false });
      return;
    }
    startPtyIdRef.current = ptyId;
    const cleanupExit = window.foundry?.onTerminalExit((id) => {
      if (id === ptyId) { setStartRunning(false); startPtyIdRef.current = null; cleanupExit?.(); }
    });
    addToast({ message: `Started: ${cmd}`, type: 'success', sound: false });
  }, [startCommand, project?.path, addToast, panels, addPanel]);

  const handleStopCommand = useCallback(() => {
    if (startPtyIdRef.current) {
      terminalPanelRef.current?.killByPtyId(startPtyIdRef.current);
      startPtyIdRef.current = null;
      setStartRunning(false);
      addToast({ message: 'Process stopped', type: 'info', sound: false });
    }
  }, [addToast]);

  const handleStartButtonClick = useCallback(async () => {
    if (startRunning) { handleStopCommand(); return; }
    let cmd = startCommand;
    if (project?.path) {
      try {
        const saved = await window.foundry?.getSetting(`start_command_${project.path}`);
        if (saved !== undefined) { cmd = saved || ''; setStartCommand(cmd); }
      } catch {}
    }
    if (!cmd.trim()) {
      addToast({ message: 'No start command configured. Set one in Workspace settings.', type: 'error' });
      setSettingsInitialSection('workspace');
      setShowSettings(true);
      return;
    }
    handleStartCommand(cmd);
  }, [startRunning, startCommand, project?.path, handleStopCommand, handleStartCommand, addToast]);

  // ── Close add-panel dropdown on click outside ──
  useEffect(() => {
    if (!showAddPanel) return;
    const handler = (e) => {
      if (addPanelRef.current && !addPanelRef.current.contains(e.target)) setShowAddPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddPanel]);

  // ── Open settings helper ──
  const handleOpenSettings = useCallback((section) => {
    setSettingsInitialSection(section || null);
    setShowSettings(true);
  }, []);

  // ── Panel content renderer ──
  // Returns { header: 'panelHeader' | 'own', content: JSX, headerActions?: JSX }
  // Panels with complex headers (terminal, chat, editor) manage their own header and receive drag props
  const renderPanelContent = (panel, dragProps) => {
    switch (panel.type) {
      case 'files':
        return {
          header: 'panelHeader',
          headerActions: project ? (
            <>
              <MiniTooltipBtn icon={FiFilePlus} label="New File" onClick={() => window.foundry?.createFile?.(project.path)} />
              <MiniTooltipBtn icon={FiFolderPlus} label="New Folder" onClick={() => window.foundry?.createFolder?.(project.path)} />
            </>
          ) : null,
          content: (
            <div className={sidebarStyles.panelScroll}>
              {project ? (
                <>
                  <div className={sidebarStyles.projectLabel}>{project.name}</div>
                  <div className={sidebarStyles.treeContainer}>
                    {fileTree.map(item => (
                      <FileTreeItem
                        key={item.path}
                        item={item}
                        onOpenFile={handleOpenFile}
                        activeFile={activeTab}
                        expandedPaths={expandedPaths}
                        onToggleExpand={handleToggleExpand}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className={sidebarStyles.emptyState}>
                  <span className={sidebarStyles.emptyText}>No folder open</span>
                  <button className={sidebarStyles.openFolderBtn} onClick={handleOpenFolder}>
                    <FiFolderPlus size={14} />
                    <span>Open Folder</span>
                  </button>
                </div>
              )}
            </div>
          ),
        };

      case 'git':
        return {
          header: 'panelHeader',
          content: (
            <div className={sidebarStyles.panelScroll}>
              <GitPanel
                gitStatus={gitStatus}
                projectPath={project?.path}
                onOpenFile={handleOpenFile}
                onRefreshGit={refreshTree}
                activeFile={activeTab}
                isActive={true}
                gitRefreshKey={gitRefreshKey}
              />
            </div>
          ),
        };


      case 'workflows':
        return {
          header: 'panelHeader',
          headerActions: (
            <MiniTooltipBtn icon={FiRefreshCw} label="Refresh" onClick={refreshTree} />
          ),
          content: (
            <div className={sidebarStyles.panelScroll}>
              <WorkflowsPanel projectPath={project?.path} isActive={true} />
            </div>
          ),
        };

      case 'terminal':
        return {
          header: 'own',
          content: (
            <TerminalPanel
              ref={terminalPanelRef}
              projectPath={project?.path}
              onClose={() => removePanel(panel.id)}
              panelDragProps={dragProps}
            />
          ),
        };

      case 'chat':
        return {
          header: 'own',
          content: (
            <ChatPanel
              projectPath={project?.path}
              onOpenSettings={handleOpenSettings}
              onPanelClose={() => removePanel(panel.id)}
              panelDragProps={dragProps}
              startFresh={!!panel.startFresh}
            />
          ),
        };

      case 'editor':
        return {
          header: 'own',
          content: (
            <EditorArea
              tabs={openTabs}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onCloseTab={handleCloseTab}
              onContentChange={handleContentChange}
              onSaveFile={handleSaveFile}
              onOpenFolder={handleOpenFolder}
              project={project}
              onReorderTabs={setOpenTabs}
              onPanelClose={() => removePanel(panel.id)}
              panelDragProps={dragProps}
            />
          ),
        };

      default:
        return { header: 'own', content: null };
    }
  };

  // ── Build add-panel menu items ──
  const addPanelItems = Object.entries(PANEL_TYPES)
    .filter(([type, config]) => {
      if (type === 'editor') return false;
      const activePanels = panels.filter(p => p.type === type);
      if (config.singleton && activePanels.length > 0) return false;
      if (type === 'chat' && activePanels.length >= 4) return false;
      return true;
    })
    .map(([type, config]) => ({ type, ...config }));

  // ── Determine which activity bar panels are open (exclude closing ones) ──
  const openPanelTypes = new Set(panels.map(p => p.type));

  return (
    <div className={styles.root}>
      {/* ── Activity Bar Column ── */}
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
          activePanel={null}
          onPanelClick={handleActivityClick}
          profile={profile}
          showSettings={showSettings}
          gitChangeCount={gitStatus?.files?.length || 0}
          openPanelTypes={openPanelTypes}
        />
      </div>

      {/* ── Right Column: titlebar + panels ── */}
      <div className={styles.rightColumn}>
        {/* ── Titlebar ── */}
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
            {/* Add Panel button */}
            <div className={styles.addPanelWrap} ref={addPanelRef}>
              <button
                className={`${styles.titlebarBtn} ${styles.addPanelBtn}`}
                onClick={() => setShowAddPanel(v => !v)}
                title="Add panel"
              >
                <FiPlus size={16} />
              </button>
              {showAddPanel && (
                <div className={styles.addPanelDropdown}>
                  {addPanelItems.length > 0 ? addPanelItems.map(item => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.type}
                        className={styles.addPanelItem}
                        onClick={() => { addPanel(item.type); setShowAddPanel(false); }}
                      >
                        <ItemIcon size={14} />
                        <span>{item.title}</span>
                      </button>
                    );
                  }) : (
                    <div className={styles.addPanelEmpty}>All panels open</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Main panel area ── */}
        <div className={styles.main}>
          {/* Settings overlay */}
          {showSettings && (
            <div className={styles.settingsOverlay}>
              <SettingsPage
                profile={profile}
                initialSection={settingsInitialSection}
                projectPath={project?.path}
                onClose={() => {
                  setShowSettings(false);
                  setSettingsInitialSection(null);
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
          )}

          {/* Panels */}
          <div ref={panelStripRef} className={styles.panelStrip} style={{ display: showSettings ? 'none' : 'flex' }}>
            {panels.map((panel, index) => {
              const config = PANEL_TYPES[panel.type] || {};
              const isFlex = !!config.flex;
              const Icon = config.icon;
              const isDragOver = dragOverPanelIndex === index && dragPanelIndex !== index;
              const isFlexLike = isFlex;

              const dragProps = {
                onDragStart: (e) => handlePanelDragStart(e, index),
                onDragEnd: handlePanelDragEnd,
                onDragOver: () => handlePanelDragOver(index),
                onDrop: () => handlePanelDrop(index),
                isDragOver,
              };

              const rendered = renderPanelContent(panel, dragProps);

              const panelStyle = {
                width: isFlexLike ? undefined : panel.width,
                flex: isFlexLike ? '1 1 0' : '0 0 auto',
                minWidth: config.minWidth || 80,
              };

              return (
                <React.Fragment key={panel.id}>
                  <div
                    data-panel-id={panel.id}
                    className={[
                      styles.panelSlot,
                      dragPanelIndex === index ? styles.panelSlotDragging : '',
                    ].filter(Boolean).join(' ')}
                    style={panelStyle}
                  >
                    {rendered.header === 'panelHeader' && (
                      <PanelHeader
                        title={config.title || panel.type}
                        icon={Icon}
                        onClose={() => removePanel(panel.id)}
                        onDragStart={dragProps.onDragStart}
                        onDragEnd={dragProps.onDragEnd}
                        onDragOver={dragProps.onDragOver}
                        onDrop={dragProps.onDrop}
                        isDragOver={isDragOver}
                      >
                        {rendered.headerActions}
                      </PanelHeader>
                    )}
                    <div className={styles.panelContent}>
                      {rendered.content}
                    </div>
                  </div>
                  {index < panels.length - 1 && (
                    <div
                      className={styles.panelResizeHandle}
                      onMouseDown={(e) => handlePanelResize(e, index)}
                    />
                  )}
                  {index === panels.length - 1 && !isFlex && (
                    <div
                      className={styles.panelResizeHandle}
                      onMouseDown={(e) => handlePanelResize(e, index, true)}
                    />
                  )}
                </React.Fragment>
              );
            })}
            {panels.length === 0 && (
              <div className={styles.emptyMain}>
                <img
                  src={currentTheme === 'dark' ? foundryIconDark : foundryIconLight}
                  alt="Foundry"
                  className={styles.emptyMainLogo}
                  draggable={false}
                />
                <span className={styles.emptyMainText}>Open a panel to get started</span>
                <div className={styles.emptyMainHints}>
                  <span><kbd className={styles.kbd}>⌘B</kbd> Explorer</span>
                  <span><kbd className={styles.kbd}>⌘J</kbd> Chat</span>
                  <span><kbd className={styles.kbd}>⌘`</kbd> Terminal</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
