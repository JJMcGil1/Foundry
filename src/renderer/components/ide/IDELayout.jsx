import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { VscFiles, VscSourceControl } from 'react-icons/vsc';
import { FiSun, FiMoon, FiPlus, FiMinus, FiGithub, FiTerminal, FiMessageSquare, FiFilePlus, FiFolderPlus, FiRefreshCw, FiMaximize2 } from 'react-icons/fi';
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
  files:     { title: 'Explorer',       icon: VscFiles,          defaultWidth: 280, defaultHeight: 500, minWidth: 200, minHeight: 200, singleton: true },
  git:       { title: 'Source Control',  icon: VscSourceControl,  defaultWidth: 300, defaultHeight: 500, minWidth: 200, minHeight: 200, singleton: true },
  workflows: { title: 'Workflows',       icon: FiGithub,          defaultWidth: 280, defaultHeight: 500, minWidth: 200, minHeight: 200, singleton: true },
  terminal:  { title: 'Terminal',        icon: FiTerminal,        defaultWidth: 600, defaultHeight: 350, minWidth: 300, minHeight: 150 },
  chat:      { title: 'Chat',           icon: FiMessageSquare,   defaultWidth: 420, defaultHeight: 600, minWidth: 280, minHeight: 300 },
  editor:    { title: 'Editor',         icon: VscFiles,          defaultWidth: 700, defaultHeight: 500, minWidth: 300, minHeight: 200, singleton: true },
};

const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

let nextPanelId = 0;
function makePanelId() { return `panel-${++nextPanelId}`; }

export default function IDELayout({ profile, onProfileChange, initialProjectPath }) {
  // ── Canvas state ──
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [canvasZoom, setCanvasZoom] = useState(1);
  const canvasOffsetRef = useRef({ x: 0, y: 0 });
  const canvasZoomRef = useRef(1);
  const nextZIndexRef = useRef(2);
  const canvasRef = useRef(null);
  const panelsRef = useRef([]);
  const initialLayoutDone = useRef(false);

  useEffect(() => { canvasOffsetRef.current = canvasOffset; }, [canvasOffset]);
  useEffect(() => { canvasZoomRef.current = canvasZoom; }, [canvasZoom]);

  // ── Panel state ──
  const [panels, setPanels] = useState(() => [
    { id: makePanelId(), type: 'chat', x: 0, y: 0, width: 420, height: 600, zIndex: 1 },
  ]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const addPanelRef = useRef(null);
  const isResizingRef = useRef(false);
  const [closingPanelIds, setClosingPanelIds] = useState(new Set());

  useEffect(() => { panelsRef.current = panels; }, [panels]);

  // Center initial panels in viewport once canvas is visible
  const centerPanelsOnce = useCallback(() => {
    if (initialLayoutDone.current) return;
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    initialLayoutDone.current = true;
    const p = panelsRef.current;
    if (p.length > 0) {
      const offset = {
        x: (rect.width - p[0].width) / 2 - p[0].x,
        y: (rect.height - p[0].height) / 2 - p[0].y,
      };
      setCanvasOffset(offset);
      canvasOffsetRef.current = offset;
    }
  }, []);

  // ── Existing IDE state ──
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState(null);

  // Try on mount — double rAF ensures layout is fully settled before measuring
  useEffect(() => {
    let cancelled = false;
    requestAnimationFrame(() => {
      if (!cancelled) requestAnimationFrame(() => {
        if (!cancelled) centerPanelsOnce();
      });
    });
    return () => { cancelled = true; };
  }, [centerPanelsOnce]);

  // Retry when settings closes (canvas goes from display:none to visible)
  useEffect(() => {
    if (!showSettings) {
      let cancelled = false;
      requestAnimationFrame(() => {
        if (!cancelled) requestAnimationFrame(() => {
          if (!cancelled) centerPanelsOnce();
        });
      });
      return () => { cancelled = true; };
    }
  }, [showSettings, centerPanelsOnce]);

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

  // File tree expanded paths
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

  // ── Get position for a new panel ──
  const getNewPanelPosition = useCallback((type, existingPanels) => {
    const config = PANEL_TYPES[type];
    const w = config.defaultWidth || 400;
    const h = config.defaultHeight || 500;
    const el = canvasRef.current;
    const offset = canvasOffsetRef.current;
    const zoom = canvasZoomRef.current;
    if (!el) return { x: 100, y: 80, width: w, height: h };
    const rect = el.getBoundingClientRect();
    let x = (rect.width / 2 - offset.x) / zoom - w / 2;
    let y = (rect.height / 2 - offset.y) / zoom - h / 2;
    let attempts = 0;
    while (attempts < 10 && existingPanels.some(p => Math.abs(p.x - x) < 30 && Math.abs(p.y - y) < 30)) {
      x += 40; y += 40; attempts++;
    }
    return { x, y, width: w, height: h };
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
        const pos = getNewPanelPosition('editor', prev);
        return [...prev, { id: makePanelId(), type: 'editor', ...pos, zIndex: nextZIndexRef.current++ }];
      });
    }
  }, [openTabs, getNewPanelPosition]);

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
    const id = makePanelId();
    const isFirstOfType = !panels.some(p => p.type === type);
    const pos = getNewPanelPosition(type, panels);
    const zIndex = nextZIndexRef.current++;
    const newPanel = { id, type, ...pos, zIndex, startFresh: !isFirstOfType };
    setPanels(prev => [...prev, newPanel]);
    return id;
  }, [panels, getNewPanelPosition]);

  const removePanel = useCallback((panelId) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel || closingPanelIds.has(panelId)) return;
    if (panel.type === 'editor') {
      setOpenTabs([]);
      setActiveTab(null);
    }
    setClosingPanelIds(prev => new Set(prev).add(panelId));
    setTimeout(() => {
      setPanels(prev => prev.filter(p => p.id !== panelId));
      setClosingPanelIds(prev => {
        const next = new Set(prev);
        next.delete(panelId);
        return next;
      });
    }, 200);
  }, [panels, closingPanelIds]);

  const togglePanel = useCallback((type) => {
    const existing = panels.find(p => p.type === type && !closingPanelIds.has(p.id));
    if (existing) {
      removePanel(existing.id);
    } else {
      addPanel(type);
    }
  }, [panels, addPanel, removePanel, closingPanelIds]);

  // ── Canvas: bring panel to front ──
  const bringToFront = useCallback((panelId) => {
    const z = nextZIndexRef.current++;
    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, zIndex: z } : p));
  }, []);

  // ── Canvas: panel drag (move) ──
  const handlePanelDrag = useCallback((e, panelId) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    bringToFront(panelId);
    const startX = e.clientX;
    const startY = e.clientY;
    const panel = panelsRef.current.find(p => p.id === panelId);
    if (!panel) return;
    const startPanelX = panel.x;
    const startPanelY = panel.y;
    const panelEl = document.querySelector(`[data-panel-id="${panelId}"]`);
    if (panelEl) panelEl.classList.add(styles.canvasPanelDragging);
    const handleMove = (ev) => {
      const dx = (ev.clientX - startX) / canvasZoomRef.current;
      const dy = (ev.clientY - startY) / canvasZoomRef.current;
      setPanels(prev => prev.map(p =>
        p.id === panelId ? { ...p, x: startPanelX + dx, y: startPanelY + dy } : p
      ));
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (panelEl) panelEl.classList.remove(styles.canvasPanelDragging);
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [bringToFront]);

  // ── Canvas: panel resize ──
  const handlePanelResize = useCallback((e, panelId, direction) => {
    e.stopPropagation();
    e.preventDefault();
    bringToFront(panelId);
    isResizingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const panel = panelsRef.current.find(p => p.id === panelId);
    if (!panel) return;
    const panelEl = document.querySelector(`[data-panel-id="${panelId}"]`);
    if (panelEl) panelEl.classList.add(styles.canvasPanelDragging);
    const startPanel = { x: panel.x, y: panel.y, width: panel.width, height: panel.height };
    const config = PANEL_TYPES[panel.type] || {};
    const minW = config.minWidth || 200;
    const minH = config.minHeight || 150;
    const handleMove = (ev) => {
      const zoom = canvasZoomRef.current;
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      setPanels(prev => prev.map(p => {
        if (p.id !== panelId) return p;
        let { x, y, width, height } = startPanel;
        if (direction.includes('e')) width = Math.max(minW, width + dx);
        if (direction.includes('s')) height = Math.max(minH, height + dy);
        if (direction.includes('w')) { const nw = Math.max(minW, width - dx); x += width - nw; width = nw; }
        if (direction.includes('n')) { const nh = Math.max(minH, height - dy); y += height - nh; height = nh; }
        return { ...p, x, y, width, height };
      }));
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      isResizingRef.current = false;
      if (panelEl) panelEl.classList.remove(styles.canvasPanelDragging);
    };
    document.body.style.cursor = `${direction}-resize`;
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [bringToFront]);

  // ── Canvas: pan (drag background) ──
  const handleCanvasMouseDown = useCallback((e) => {
    if (e.target !== canvasRef.current) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startOffset = { ...canvasOffsetRef.current };
    const handleMove = (ev) => {
      setCanvasOffset({
        x: startOffset.x + (ev.clientX - startX),
        y: startOffset.y + (ev.clientY - startY),
      });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'grabbing';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, []);

  // ── Canvas: zoom (wheel/pinch) ──
  const handleCanvasWheel = useCallback((e) => {
    // Let scroll events pass through to scrollable panel content
    const isZoom = e.ctrlKey || e.metaKey;
    if (!isZoom) {
      // Check if the event target is inside a scrollable element within a panel
      let el = e.target;
      while (el && el !== canvasRef.current) {
        if (el.dataset && el.dataset.panelId != null) break; // reached panel root
        const { overflowY, overflowX } = window.getComputedStyle(el);
        const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
        const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
        if (canScrollY || canScrollX) {
          // Check if there's actually room to scroll in the direction the user is scrolling
          const atTop = el.scrollTop <= 0 && e.deltaY < 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0;
          const atLeft = el.scrollLeft <= 0 && e.deltaX < 0;
          const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaX > 0;
          const vertBlocked = !canScrollY || atTop || atBottom;
          const horizBlocked = !canScrollX || atLeft || atRight;
          // If there's room to scroll, let the browser handle it
          if (!vertBlocked || !horizBlocked) return;
        }
        el = el.parentElement;
      }
    }
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    if (isZoom) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? 1.08 : 1 / 1.08;
      const currentZoom = canvasZoomRef.current;
      const newZoom = Math.min(3, Math.max(0.1, currentZoom * zoomFactor));
      const scale = newZoom / currentZoom;
      const currentOffset = canvasOffsetRef.current;
      setCanvasZoom(newZoom);
      setCanvasOffset({
        x: mouseX - (mouseX - currentOffset.x) * scale,
        y: mouseY - (mouseY - currentOffset.y) * scale,
      });
    } else {
      setCanvasOffset(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleCanvasWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleCanvasWheel);
  }, [handleCanvasWheel]);

  // ── Canvas: zoom helper (zoom toward viewport center) ──
  const zoomTo = useCallback((factor) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const currentZoom = canvasZoomRef.current;
    const currentOffset = canvasOffsetRef.current;
    const newZoom = Math.min(3, Math.max(0.1, currentZoom * factor));
    const scale = newZoom / currentZoom;
    setCanvasZoom(newZoom);
    setCanvasOffset({
      x: cx - (cx - currentOffset.x) * scale,
      y: cy - (cy - currentOffset.y) * scale,
    });
  }, []);

  // ── Canvas: fit all panels to view ──
  const fitToView = useCallback(() => {
    const current = panelsRef.current;
    if (current.length === 0) return;
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    current.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.width);
      maxY = Math.max(maxY, p.y + p.height);
    });
    const padding = 60;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const zoomX = (rect.width - padding * 2) / contentW;
    const zoomY = (rect.height - padding * 2) / contentH;
    const newZoom = Math.min(1.5, Math.min(zoomX, zoomY));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setCanvasZoom(newZoom);
    setCanvasOffset({
      x: rect.width / 2 - centerX * newZoom,
      y: rect.height / 2 - centerY * newZoom,
    });
  }, []);

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
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); setShowSettings(v => !v); }
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomTo(1.2); }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); zoomTo(1 / 1.2); }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); fitToView(); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handleSaveFile, togglePanel, zoomTo, fitToView]);

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

  // ── Determine which activity bar panels are open ──
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

      {/* ── Right Column: titlebar + canvas ── */}
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
                <span>Add Panel</span>
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

          {/* Canvas workspace */}
          <div
            ref={canvasRef}
            className={`${styles.canvas} ${showSettings ? styles.canvasHidden : ''}`}
            onMouseDown={handleCanvasMouseDown}
          >
            <div
              className={styles.canvasTransform}
              style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})` }}
            >
              {panels.map((panel) => {
                const config = PANEL_TYPES[panel.type] || {};
                const Icon = config.icon;
                const dragProps = {
                  onMouseDown: (e) => handlePanelDrag(e, panel.id),
                };
                const rendered = renderPanelContent(panel, dragProps);

                return (
                  <div
                    key={panel.id}
                    data-panel-id={panel.id}
                    className={`${styles.canvasPanel}${closingPanelIds.has(panel.id) ? ` ${styles.canvasPanelClosing}` : ''}`}
                    style={{
                      left: panel.x,
                      top: panel.y,
                      width: panel.width,
                      height: panel.height,
                      zIndex: panel.zIndex,
                    }}
                    onMouseDown={() => bringToFront(panel.id)}
                  >
                    {rendered.header === 'panelHeader' && (
                      <PanelHeader
                        title={config.title || panel.type}
                        icon={Icon}
                        onClose={() => removePanel(panel.id)}
                        onMouseDown={dragProps.onMouseDown}
                      >
                        {rendered.headerActions}
                      </PanelHeader>
                    )}
                    {rendered.header === 'own' ? (
                      rendered.content
                    ) : (
                      <div className={styles.panelContent}>
                        {rendered.content}
                      </div>
                    )}
                    {RESIZE_DIRS.map(dir => (
                      <div
                        key={dir}
                        className={`${styles.resizeHandle} ${styles['resize' + dir.charAt(0).toUpperCase() + dir.slice(1)]}`}
                        onMouseDown={(e) => handlePanelResize(e, panel.id, dir)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Empty canvas state */}
            {panels.length === 0 && (
              <div className={styles.emptyCanvas}>
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

            {/* Zoom controls */}
            <div className={styles.zoomControls}>
              <button className={styles.zoomBtn} onClick={() => zoomTo(1 / 1.2)} title="Zoom out (⌘-)">
                <FiMinus size={14} />
              </button>
              <span className={styles.zoomLabel} onClick={() => { setCanvasZoom(1); canvasZoomRef.current = 1; }} title="Reset zoom to 100%">{Math.round(canvasZoom * 100)}%</span>
              <button className={styles.zoomBtn} onClick={() => zoomTo(1.2)} title="Zoom in (⌘+)">
                <FiPlus size={14} />
              </button>
              <div className={styles.zoomDivider} />
              <button className={styles.zoomBtn} onClick={fitToView} title="Fit to view (⌘0)">
                <FiMaximize2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
