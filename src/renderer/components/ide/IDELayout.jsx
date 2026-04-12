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
  files:     { title: 'Explorer',       icon: VscFiles,          defaultWidth: 260, minWidth: 200, maxWidth: 480, singleton: true },
  git:       { title: 'Source Control',  icon: VscSourceControl,  defaultWidth: 280, minWidth: 200, maxWidth: 480, singleton: true },
  workflows: { title: 'Workflows',       icon: FiGithub,          defaultWidth: 260, minWidth: 200, maxWidth: 480, singleton: true },
  terminal:  { title: 'Terminal',        icon: FiTerminal,        defaultWidth: 450, minWidth: 280, maxWidth: 900 },
  chat:      { title: 'Chat',           icon: FiMessageSquare,   defaultWidth: 360, minWidth: 280, maxWidth: 650 },
  editor:    { title: 'Editor',         icon: VscFiles,          minWidth: 200, flex: true, singleton: true },
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

  // ── Panel animation state ──
  const [openingPanelIds, setOpeningPanelIds] = useState(new Set());
  const [closingPanelIds, setClosingPanelIds] = useState(new Set());
  const isResizingRef = useRef(false);

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
      // If it's closing, cancel the close instead of adding a new one
      const closingPanel = panels.find(p => p.type === type && closingPanelIds.has(p.id));
      if (closingPanel) {
        setClosingPanelIds(prev => { const n = new Set(prev); n.delete(closingPanel.id); return n; });
        return closingPanel.id;
      }
      const existing = panels.find(p => p.type === type);
      if (existing) return;
    }
    // Max 4 chat panels (exclude closing ones from count)
    if (type === 'chat' && panels.filter(p => p.type === 'chat' && !closingPanelIds.has(p.id)).length >= 4) return;
    const isFirstOfType = !panels.some(p => p.type === type && !closingPanelIds.has(p.id));
    const id = makePanelId();
    const newPanel = { id, type, width: config.defaultWidth || 300, startFresh: !isFirstOfType };
    setPanels(prev => [...prev, newPanel]);
    setOpeningPanelIds(prev => new Set([...prev, id]));
    // Double rAF: render at width 0 first, then animate to target
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOpeningPanelIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      });
    });
    return id;
  }, [panels, closingPanelIds]);

  const removePanel = useCallback((panelId) => {
    // If already closing, ignore
    if (closingPanelIds.has(panelId)) return;
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    if (panel.type === 'editor') {
      setOpenTabs([]);
      setActiveTab(null);
    }
    setClosingPanelIds(prev => new Set([...prev, panelId]));
  }, [panels, closingPanelIds]);

  const togglePanel = useCallback((type) => {
    // Check if a panel of this type is currently closing - if so, cancel the close
    const closingPanel = panels.find(p => p.type === type && closingPanelIds.has(p.id));
    if (closingPanel) {
      setClosingPanelIds(prev => { const n = new Set(prev); n.delete(closingPanel.id); return n; });
      return;
    }
    const existing = panels.find(p => p.type === type && !closingPanelIds.has(p.id));
    if (existing) {
      removePanel(existing.id);
    } else {
      addPanel(type);
    }
  }, [panels, closingPanelIds, addPanel, removePanel]);

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
  const handlePanelResize = useCallback((e, handleIndex) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const leftPanel = panels[handleIndex];
    const rightPanel = panels[handleIndex + 1];

    const isLeftFlex = PANEL_TYPES[leftPanel.type]?.flex;
    const isRightFlex = PANEL_TYPES[rightPanel?.type]?.flex;

    const targetPanel = isLeftFlex ? rightPanel : leftPanel;
    if (!targetPanel) return;
    const startWidth = targetPanel.width;
    const direction = isLeftFlex ? -1 : 1;
    const config = PANEL_TYPES[targetPanel.type] || {};

    const handleMouseMove = (ev) => {
      const delta = (ev.clientX - startX) * direction;
      const newWidth = Math.max(config.minWidth || 200, Math.min(config.maxWidth || 800, startWidth + delta));
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
  }, [panels]);

  // ── Panel close animation completion ──
  const handlePanelTransitionEnd = useCallback((e, panelId) => {
    // Only act on the width transition to avoid firing multiple times
    if (e.propertyName !== 'width' && e.propertyName !== 'flex-grow') return;
    if (!closingPanelIds.has(panelId)) return;
    setClosingPanelIds(prev => { const n = new Set(prev); n.delete(panelId); return n; });
    setPanels(prev => prev.filter(p => p.id !== panelId));
  }, [closingPanelIds]);

  // Fallback: if transitionend doesn't fire (e.g., display:none), clean up after timeout
  useEffect(() => {
    if (closingPanelIds.size === 0) return;
    const timeout = setTimeout(() => {
      setClosingPanelIds(prev => {
        if (prev.size === 0) return prev;
        const remaining = new Set(prev);
        remaining.forEach(id => {
          setPanels(p => p.filter(panel => panel.id !== id));
        });
        return new Set();
      });
    }, 400); // slightly longer than animation duration
    return () => clearTimeout(timeout);
  }, [closingPanelIds]);

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
    if (!panels.some(p => p.type === 'terminal' && !closingPanelIds.has(p.id))) addPanel('terminal');
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
  }, [startCommand, project?.path, addToast, panels, addPanel, closingPanelIds]);

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
      const activePanels = panels.filter(p => p.type === type && !closingPanelIds.has(p.id));
      if (config.singleton && activePanels.length > 0) return false;
      if (type === 'chat' && activePanels.length >= 4) return false;
      return true;
    })
    .map(([type, config]) => ({ type, ...config }));

  // ── Determine which activity bar panels are open (exclude closing ones) ──
  const openPanelTypes = new Set(panels.filter(p => !closingPanelIds.has(p.id)).map(p => p.type));

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
          <div className={styles.panelStrip} style={{ display: showSettings ? 'none' : 'flex' }}>
            {panels.map((panel, index) => {
              const config = PANEL_TYPES[panel.type] || {};
              const isFlex = !!config.flex;
              const Icon = config.icon;
              const hasFlexPanel = panels.some(p => PANEL_TYPES[p.type]?.flex);
              const isLastPanel = index === panels.length - 1;
              const shouldStretch = !isFlex && !hasFlexPanel && isLastPanel;
              const isDragOver = dragOverPanelIndex === index && dragPanelIndex !== index;
              const isFlexLike = isFlex || shouldStretch;

              // Animation states
              const isOpening = openingPanelIds.has(panel.id);
              const isClosing = closingPanelIds.has(panel.id);
              const isAnimating = (isOpening || isClosing) && !isResizingRef.current;

              const dragProps = {
                onDragStart: (e) => handlePanelDragStart(e, index),
                onDragEnd: handlePanelDragEnd,
                onDragOver: () => handlePanelDragOver(index),
                onDrop: () => handlePanelDrop(index),
                isDragOver,
              };

              const rendered = renderPanelContent(panel, dragProps);

              // Compute animated styles
              const collapsed = isOpening || isClosing;
              const panelStyle = collapsed
                ? { width: 0, flex: '0 0 0px', minWidth: 0, opacity: 0, borderRightColor: 'transparent' }
                : {
                    width: isFlexLike ? undefined : panel.width,
                    flex: isFlexLike ? '1 1 0' : '0 0 auto',
                    minWidth: config.minWidth || 200,
                  };

              return (
                <React.Fragment key={panel.id}>
                  <div
                    className={[
                      styles.panelSlot,
                      isAnimating ? styles.panelSlotAnimating : '',
                      isClosing ? styles.panelSlotClosing : '',
                      dragPanelIndex === index ? styles.panelSlotDragging : '',
                    ].filter(Boolean).join(' ')}
                    style={panelStyle}
                    onTransitionEnd={(e) => handlePanelTransitionEnd(e, panel.id)}
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
                </React.Fragment>
              );
            })}
            {/* Empty state when no panels (exclude closing panels) */}
            {panels.filter(p => !closingPanelIds.has(p.id)).length === 0 && (
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
