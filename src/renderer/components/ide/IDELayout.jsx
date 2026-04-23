import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { VscFiles, VscSourceControl, VscSettingsGear } from 'react-icons/vsc';
import { FiSun, FiMoon, FiPlus, FiMinus, FiGithub, FiTerminal, FiMessageSquare, FiFilePlus, FiFolderPlus, FiRefreshCw, FiMaximize2, FiLayout } from 'react-icons/fi';
import { VscPlay, VscDebugStop } from 'react-icons/vsc';
import { LuSquareCheckBig } from 'react-icons/lu';
import { useToast } from './ToastProvider';
import { ActivityBar, FileTreeItem, GitPanel, WorkflowsPanel, MiniTooltipBtn } from './sidebar';
import PanelHeader from './PanelHeader';
import { EditorArea } from './editor';
import ChatPanel from './ChatPanel';
import { TerminalPanel } from './terminal';
import { SettingsPage } from './settings';
import WhatsDonePanel from './WhatsDonePanel';
import { SearchBar, ProjectControls, AddPanelPanel, LayoutsPanel } from './titlebar';
import styles from './IDELayout.module.css';
import sidebarStyles from './Sidebar.module.css';
import foundryIconDark from '../../assets/foundry-icon-dark.svg';
import foundryIconLight from '../../assets/foundry-icon-light.svg';

// ── Panel type config ──
const PANEL_TYPES = {
  files:     { title: 'Explorer',       icon: VscFiles,          defaultWidth: 280, defaultHeight: 500, minWidth: 200, minHeight: 200, singleton: true },
  git:       { title: 'Source Control',  icon: VscSourceControl,  defaultWidth: 300, defaultHeight: 500, minWidth: 200, minHeight: 200, singleton: true },
  workflows: { title: 'GitHub Actions',       icon: FiGithub,          defaultWidth: 280, defaultHeight: 500, minWidth: 200, minHeight: 200, singleton: true },
  terminal:  { title: 'Terminal',        icon: FiTerminal,        defaultWidth: 600, defaultHeight: 350, minWidth: 300, minHeight: 150 },
  whatsDone: { title: "What's Done",    icon: LuSquareCheckBig,  defaultWidth: 340, defaultHeight: 500, minWidth: 260, minHeight: 250, singleton: true },
  chat:      { title: 'Chat',           icon: FiMessageSquare,   defaultWidth: 420, defaultHeight: 600, minWidth: 280, minHeight: 300 },
  editor:    { title: 'Editor',         icon: VscFiles,          defaultWidth: 700, defaultHeight: 500, minWidth: 300, minHeight: 200, singleton: true },
  settings:  { title: 'Settings',       icon: VscSettingsGear,   defaultWidth: 720, defaultHeight: 560, minWidth: 500, minHeight: 350, singleton: true },
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
  const canvasTransformRef = useRef(null);
  const panelsRef = useRef([]);
  const initialLayoutDone = useRef(false);
  // Tracks the panel currently being dragged/resized imperatively, plus the
  // live DOM position. Used to re-apply the imperative style after any React
  // render mid-drag (which would otherwise reset style.left/top to stale
  // state values and cause a visible snap-back).
  const activeDragRef = useRef(null);

  useEffect(() => { canvasOffsetRef.current = canvasOffset; }, [canvasOffset]);
  useEffect(() => { canvasZoomRef.current = canvasZoom; }, [canvasZoom]);

  // Safety net: after any render, if a drag/resize is in-flight, re-apply
  // the imperative DOM style so React's reconciliation doesn't snap the
  // panel back to its stale state position mid-drag.
  useLayoutEffect(() => {
    const d = activeDragRef.current;
    if (!d) return;
    const el = document.querySelector(`[data-panel-id="${d.panelId}"]`);
    if (!el) return;
    el.style.left = `${d.x}px`;
    el.style.top = `${d.y}px`;
    el.style.width = `${d.width}px`;
    el.style.height = `${d.height}px`;
  });

  // Toggle a class on the canvas root during any drag/pan/resize/wheel-pan.
  // CSS uses this to strip backdrop-filter, transitions and heavy shadows
  // while the user is moving things, then restores them on release.
  const interactingTimerRef = useRef(null);
  const wheelCommitTimerRef = useRef(null);
  const beginCanvasInteraction = useCallback(() => {
    if (interactingTimerRef.current) {
      clearTimeout(interactingTimerRef.current);
      interactingTimerRef.current = null;
    }
    if (canvasRef.current) canvasRef.current.classList.add(styles.canvasInteracting);
  }, []);
  const endCanvasInteraction = useCallback((debounceMs = 0) => {
    const stop = () => {
      interactingTimerRef.current = null;
      if (canvasRef.current) canvasRef.current.classList.remove(styles.canvasInteracting);
    };
    if (debounceMs > 0) {
      if (interactingTimerRef.current) clearTimeout(interactingTimerRef.current);
      interactingTimerRef.current = setTimeout(stop, debounceMs);
    } else {
      stop();
    }
  }, []);

  // ── Panel state ──
  const [panels, setPanels] = useState(() => [
    { id: makePanelId(), type: 'chat', x: 0, y: 0, width: 420, height: 600, zIndex: 1 },
  ]);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addPanelPos, setAddPanelPos] = useState({ top: 0, left: 0 });
  const addPanelBtnRef = useRef(null);
  const [showLayouts, setShowLayouts] = useState(false);
  const [layoutsPos, setLayoutsPos] = useState({ top: 0, left: 0 });
  const layoutsBtnRef = useRef(null);
  const [savedLayouts, setSavedLayouts] = useState([]);
  const isResizingRef = useRef(false);
  const dragAbortRef = useRef(null);
  const [closingPanelIds, setClosingPanelIds] = useState(new Set());
  const layoutRestoredRef = useRef(false);
  const layoutSaveTimer = useRef(null);

  useEffect(() => { panelsRef.current = panels; }, [panels]);

  // ── Restore saved panel layout on mount ──
  useEffect(() => {
    if (layoutRestoredRef.current) return;
    layoutRestoredRef.current = true;
    (async () => {
      try {
        const raw = await window.foundry?.getSetting('panel_layout');
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (!saved || !Array.isArray(saved.panels)) return;
        if (saved.panels.length === 0) {
          setPanels([]);
          initialLayoutDone.current = true;
          return;
        }
        // Re-assign IDs so they don't collide
        const restored = saved.panels.map(p => ({
          ...p,
          id: makePanelId(),
        }));
        const maxZ = Math.max(...restored.map(p => p.zIndex || 1), 1);
        nextZIndexRef.current = maxZ + 1;
        setPanels(restored);
        if (saved.canvasOffset) {
          setCanvasOffset(saved.canvasOffset);
          canvasOffsetRef.current = saved.canvasOffset;
        }
        if (saved.canvasZoom) {
          setCanvasZoom(saved.canvasZoom);
          canvasZoomRef.current = saved.canvasZoom;
        }
        // Skip the auto-center since we restored positions
        initialLayoutDone.current = true;
      } catch (err) {
        console.error('[Layout] Failed to restore panel layout:', err);
      } finally {
        layoutSaveReady.current = true;
      }
    })();
  }, []);

  // ── Save panel layout on changes (debounced) ──
  // Skip saving until restore attempt has completed to avoid overwriting saved layout
  const layoutSaveReady = useRef(false);
  useEffect(() => {
    if (!layoutSaveReady.current) return;
    clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(() => {
      const toSave = panels
        .filter(p => !closingPanelIds.has(p.id))
        .map(({ id, startFresh, ...rest }) => rest);
      const payload = JSON.stringify({
        panels: toSave,
        canvasOffset,
        canvasZoom,
      });
      window.foundry?.setSetting('panel_layout', payload);
    }, 2000);
    return () => clearTimeout(layoutSaveTimer.current);
  }, [panels, closingPanelIds, canvasOffset, canvasZoom]);

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

  // Event-driven workspace refresh. The main process watches the workspace
  // (and .git) with fs.watch and emits `workspace:changed` whenever something
  // on disk changes. A slow poll remains as a safety net for filesystems where
  // fs.watch is unreliable (network mounts, some Linux setups).
  useEffect(() => {
    if (!project) return;
    let running = false, cancelled = false;
    let lastRefreshAt = 0;
    const isIdle = () =>
      document.documentElement.classList.contains('app-idle') ||
      document.visibilityState === 'hidden';
    // opts: { structural, gitMeta, full } — default is the cheap path
    // (gitStatus only), which is what most file-save events produce.
    // Skipping refresh while idle avoids spawning git-status subprocesses
    // every debounce cycle while the user is in another app.
    const refresh = async (opts = {}) => {
      if (running || cancelled || isIdle()) return;
      running = true;
      try {
        const { structural = false, gitMeta = false, full = false } = opts;
        const wantTree = structural || full;
        const wantMeta = gitMeta || full;
        const [tree, status] = await Promise.all([
          wantTree ? window.foundry?.readDir(project.path) : Promise.resolve(null),
          window.foundry?.gitStatus(project.path),
        ]);
        if (cancelled) return;
        if (tree) setFileTree(tree);
        if (status) setGitStatus(status);
        if (wantMeta) setGitRefreshKey(k => k + 1);
        lastRefreshAt = Date.now();
      } finally { running = false; }
    };

    window.foundry?.watchWorkspace?.(project.path);
    const unsubscribe = window.foundry?.onWorkspaceChanged?.((info) => {
      if (!info || info.path !== project.path) return;
      refresh({ structural: !!info.structural, gitMeta: !!info.gitMeta });
    });

    // Fallback poll — spawns `git status` + `git log`, which is the single
    // biggest steady-state battery cost for an idle project. Skip when a
    // watcher-driven refresh already ran recently. Bumped to 60s now that
    // events are reliable; watcher failures still converge within a minute.
    const POLL_INTERVAL_MS = 60_000;
    const POLL_SKIP_IF_REFRESHED_WITHIN_MS = 30_000;
    let interval = null;
    const pollRefresh = () => {
      if (Date.now() - lastRefreshAt < POLL_SKIP_IF_REFRESHED_WITHIN_MS) return;
      refresh({ full: true });
    };
    const start = () => { if (!interval) interval = setInterval(pollRefresh, POLL_INTERVAL_MS); };
    const stop = () => { clearInterval(interval); interval = null; };
    const sync = () => {
      if (isIdle()) stop();
      else { start(); pollRefresh(); }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    const classObserver = new MutationObserver(sync);
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', sync);
      classObserver.disconnect();
      if (typeof unsubscribe === 'function') unsubscribe();
      window.foundry?.watchWorkspace?.(null);
    };
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
    }, 260);
  }, [panels, closingPanelIds]);

  // ── Canvas: bring panel to front ──
  const bringToFront = useCallback((panelId) => {
    const z = nextZIndexRef.current++;
    setPanels(prev => prev.map(p => p.id === panelId ? { ...p, zIndex: z } : p));
  }, []);

  const handleChatThreadChange = useCallback((panelId, threadId) => {
    setPanels(prev => prev.map(p =>
      p.id === panelId ? { ...p, threadId } : p
    ));
  }, []);

  const togglePanel = useCallback((type) => {
    const existing = panels.find(p => p.type === type && !closingPanelIds.has(p.id));
    if (existing) {
      bringToFront(existing.id);
    } else {
      addPanel(type);
    }
  }, [panels, addPanel, bringToFront, closingPanelIds]);

  // ── Canvas: abort any active drag/resize/pan operation ──
  const abortActiveDrag = useCallback(() => {
    if (dragAbortRef.current) {
      dragAbortRef.current.abort();
      dragAbortRef.current = null;
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    isResizingRef.current = false;
    document.querySelectorAll(`.${styles.canvasPanelDragging}`).forEach(el =>
      el.classList.remove(styles.canvasPanelDragging)
    );
  }, []);

  // ── Canvas: panel drag (move) with snapping ──
  const SNAP_THRESHOLD = 8; // screen pixels
  const handlePanelDrag = useCallback((e, panelId) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    abortActiveDrag();
    bringToFront(panelId);
    const startX = e.clientX;
    const startY = e.clientY;
    const panel = panelsRef.current.find(p => p.id === panelId);
    if (!panel) return;
    const startPanelX = panel.x;
    const startPanelY = panel.y;
    const panelWidth = panel.width;
    const panelHeight = panel.height;
    const panelEl = document.querySelector(`[data-panel-id="${panelId}"]`);
    if (panelEl) panelEl.classList.add(styles.canvasPanelDragging);
    beginCanvasInteraction();
    const controller = new AbortController();
    dragAbortRef.current = controller;
    const opts = { signal: controller.signal };
    // Live drag position; committed to React state once on mouseup.
    let lastX = startPanelX;
    let lastY = startPanelY;
    activeDragRef.current = { panelId, x: lastX, y: lastY, width: panelWidth, height: panelHeight };
    const handleMove = (ev) => {
      const zoom = canvasZoomRef.current;
      const offset = canvasOffsetRef.current;
      const threshold = SNAP_THRESHOLD / zoom;
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      const rawX = startPanelX + dx;
      const rawY = startPanelY + dy;

      // Visible canvas edges in canvas-space
      const visLeft = -offset.x / zoom;
      const visTop = -offset.y / zoom;

      let snappedX = rawX;
      let snappedY = rawY;
      let bestDX = threshold;
      let bestDY = threshold;
      let snapX = null;
      let snapY = null;

      // Snap to canvas left edge (activity bar boundary)
      {
        const d = Math.abs(rawX - visLeft);
        if (d < bestDX) { bestDX = d; snappedX = visLeft; snapX = visLeft; }
      }
      // Snap to canvas top edge (titlebar boundary)
      {
        const d = Math.abs(rawY - visTop);
        if (d < bestDY) { bestDY = d; snappedY = visTop; snapY = visTop; }
      }

      // Panel-to-panel snapping
      for (const other of panelsRef.current) {
        if (other.id === panelId) continue;
        const oL = other.x, oR = other.x + other.width;
        const oCX = other.x + other.width / 2;
        const oT = other.y, oB = other.y + other.height;
        const oCY = other.y + other.height / 2;

        // X-axis snap candidates: [drag-edge, target, resulting-x]
        const xTests = [
          [rawX,                    oL,   oL],
          [rawX,                    oR,   oR],
          [rawX + panelWidth,       oR,   oR - panelWidth],
          [rawX + panelWidth,       oL,   oL - panelWidth],
          [rawX + panelWidth / 2,   oCX,  oCX - panelWidth / 2],
        ];
        for (const [edge, target, newX] of xTests) {
          const d = Math.abs(edge - target);
          if (d < bestDX) { bestDX = d; snappedX = newX; snapX = target; }
        }

        // Y-axis snap candidates
        const yTests = [
          [rawY,                     oT,   oT],
          [rawY,                     oB,   oB],
          [rawY + panelHeight,       oB,   oB - panelHeight],
          [rawY + panelHeight,       oT,   oT - panelHeight],
          [rawY + panelHeight / 2,   oCY,  oCY - panelHeight / 2],
        ];
        for (const [edge, target, newY] of yTests) {
          const d = Math.abs(edge - target);
          if (d < bestDY) { bestDY = d; snappedY = newY; snapY = target; }
        }
      }

      // Imperative DOM update — avoids a 60fps React re-render of the
      // entire canvas (every panel's content) during a drag.
      lastX = snappedX;
      lastY = snappedY;
      if (panelEl) {
        panelEl.style.left = `${snappedX}px`;
        panelEl.style.top = `${snappedY}px`;
      }
      activeDragRef.current = { panelId, x: lastX, y: lastY, width: panelWidth, height: panelHeight };
    };
    const finish = () => {
      activeDragRef.current = null;
      endCanvasInteraction();
      // Commit the final position to React state once, on release.
      if (lastX !== startPanelX || lastY !== startPanelY) {
        setPanels(prev => prev.map(p =>
          p.id === panelId ? { ...p, x: lastX, y: lastY } : p
        ));
      }
      abortActiveDrag();
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove, opts);
    document.addEventListener('mouseup', finish, opts);
    window.addEventListener('blur', finish, opts);
  }, [bringToFront, abortActiveDrag, beginCanvasInteraction, endCanvasInteraction]);

  // ── Canvas: panel resize ──
  const handlePanelResize = useCallback((e, panelId, direction) => {
    e.stopPropagation();
    e.preventDefault();
    abortActiveDrag();
    bringToFront(panelId);
    isResizingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const panel = panelsRef.current.find(p => p.id === panelId);
    if (!panel) return;
    const panelEl = document.querySelector(`[data-panel-id="${panelId}"]`);
    if (panelEl) panelEl.classList.add(styles.canvasPanelDragging);
    beginCanvasInteraction();
    const startPanel = { x: panel.x, y: panel.y, width: panel.width, height: panel.height };
    const config = PANEL_TYPES[panel.type] || {};
    const minW = config.minWidth || 200;
    const minH = config.minHeight || 150;
    const controller = new AbortController();
    dragAbortRef.current = controller;
    const opts = { signal: controller.signal };
    // Live values updated by the move handler; committed on mouseup.
    let liveX = startPanel.x;
    let liveY = startPanel.y;
    let liveW = startPanel.width;
    let liveH = startPanel.height;
    activeDragRef.current = { panelId, x: liveX, y: liveY, width: liveW, height: liveH };
    const handleMove = (ev) => {
      const zoom = canvasZoomRef.current;
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let { x, y, width, height } = startPanel;
      if (direction.includes('e')) width = Math.max(minW, width + dx);
      if (direction.includes('s')) height = Math.max(minH, height + dy);
      if (direction.includes('w')) { const nw = Math.max(minW, width - dx); x += width - nw; width = nw; }
      if (direction.includes('n')) { const nh = Math.max(minH, height - dy); y += height - nh; height = nh; }
      liveX = x; liveY = y; liveW = width; liveH = height;
      if (panelEl) {
        panelEl.style.left = `${x}px`;
        panelEl.style.top = `${y}px`;
        panelEl.style.width = `${width}px`;
        panelEl.style.height = `${height}px`;
      }
      activeDragRef.current = { panelId, x: liveX, y: liveY, width: liveW, height: liveH };
    };
    const finish = () => {
      activeDragRef.current = null;
      endCanvasInteraction();
      if (liveX !== startPanel.x || liveY !== startPanel.y || liveW !== startPanel.width || liveH !== startPanel.height) {
        setPanels(prev => prev.map(p =>
          p.id === panelId ? { ...p, x: liveX, y: liveY, width: liveW, height: liveH } : p
        ));
      }
      abortActiveDrag();
    };
    document.body.style.cursor = `${direction}-resize`;
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove, opts);
    document.addEventListener('mouseup', finish, opts);
    window.addEventListener('blur', finish, opts);
  }, [bringToFront, abortActiveDrag, beginCanvasInteraction, endCanvasInteraction]);

  // ── Canvas: pan (drag background) ──
  const handleCanvasMouseDown = useCallback((e) => {
    if (e.target !== canvasRef.current) return;
    if (e.button !== 0) return;
    e.preventDefault();
    abortActiveDrag();
    beginCanvasInteraction();
    const startX = e.clientX;
    const startY = e.clientY;
    const startOffset = { ...canvasOffsetRef.current };
    const controller = new AbortController();
    dragAbortRef.current = controller;
    const opts = { signal: controller.signal };
    let liveOffset = startOffset;
    const handleMove = (ev) => {
      liveOffset = {
        x: startOffset.x + (ev.clientX - startX),
        y: startOffset.y + (ev.clientY - startY),
      };
      // Imperative transform update — React state is only committed on release,
      // avoiding a full canvas re-render on every mousemove.
      const el = canvasTransformRef.current;
      if (el) {
        el.style.transform = `translate(${liveOffset.x}px, ${liveOffset.y}px) scale(${canvasZoomRef.current})`;
      }
      canvasOffsetRef.current = liveOffset;
    };
    const finish = () => {
      endCanvasInteraction();
      if (liveOffset.x !== startOffset.x || liveOffset.y !== startOffset.y) {
        setCanvasOffset(liveOffset);
      }
      abortActiveDrag();
    };
    document.body.style.cursor = 'grabbing';
    document.addEventListener('mousemove', handleMove, opts);
    document.addEventListener('mouseup', finish, opts);
    window.addEventListener('blur', finish, opts);
  }, [abortActiveDrag, beginCanvasInteraction, endCanvasInteraction]);

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
      // If we're inside a panel, swallow the scroll — don't pan the canvas
      if (el && el.dataset && el.dataset.panelId != null) {
        e.preventDefault();
        return;
      }
    }
    e.preventDefault();
    // Imperative transform updates during wheel bursts, debounced state
    // commit. Trackpad wheel fires ~60–120 events/sec; calling setState
    // each time used to trigger a full canvas re-render per tick.
    beginCanvasInteraction();
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
      const newOffset = {
        x: mouseX - (mouseX - currentOffset.x) * scale,
        y: mouseY - (mouseY - currentOffset.y) * scale,
      };
      canvasZoomRef.current = newZoom;
      canvasOffsetRef.current = newOffset;
    } else {
      canvasOffsetRef.current = {
        x: canvasOffsetRef.current.x - e.deltaX,
        y: canvasOffsetRef.current.y - e.deltaY,
      };
    }
    const el = canvasTransformRef.current;
    if (el) {
      el.style.transform = `translate(${canvasOffsetRef.current.x}px, ${canvasOffsetRef.current.y}px) scale(${canvasZoomRef.current})`;
    }
    // Debounce the React commit: burst ends ~150ms after last wheel event.
    if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
    wheelCommitTimerRef.current = setTimeout(() => {
      wheelCommitTimerRef.current = null;
      setCanvasZoom(canvasZoomRef.current);
      setCanvasOffset(canvasOffsetRef.current);
      endCanvasInteraction();
    }, 160);
  }, [beginCanvasInteraction, endCanvasInteraction]);

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
    togglePanel(panel);
  }, [togglePanel]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (activeTab) handleSaveFile(activeTab); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); togglePanel('files'); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') { e.preventDefault(); togglePanel('chat'); }
      if ((e.metaKey || e.ctrlKey) && e.key === '`') { e.preventDefault(); togglePanel('terminal'); }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); togglePanel('settings'); }
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
      togglePanel('settings');
      return;
    }
    handleStartCommand(cmd);
  }, [startRunning, startCommand, project?.path, handleStopCommand, handleStartCommand, addToast]);

  // ── Add-panel dropdown positioning ──
  const openAddPanelDropdown = useCallback(() => {
    if (!showAddPanel && addPanelBtnRef.current) {
      const rect = addPanelBtnRef.current.getBoundingClientRect();
      // Center the 320px dropdown beneath the button
      const left = rect.left + rect.width / 2 - 160;
      setAddPanelPos({ top: rect.bottom + 8, left });
    }
    setShowAddPanel(v => !v);
  }, [showAddPanel]);

  // Close add-panel on Escape
  useEffect(() => {
    if (!showAddPanel) return;
    const handler = (e) => { if (e.key === 'Escape') setShowAddPanel(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showAddPanel]);

  // ── Saved layouts: load from local db on mount ──
  useEffect(() => {
    (async () => {
      try {
        const raw = await window.foundry?.getSetting('saved_panel_layouts');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedLayouts(parsed);
      } catch (err) {
        console.error('[Layouts] Failed to load saved layouts:', err);
      }
    })();
  }, []);

  const persistLayouts = useCallback(async (next) => {
    try {
      await window.foundry?.setSetting('saved_panel_layouts', JSON.stringify(next));
    } catch (err) {
      console.error('[Layouts] Failed to persist layouts:', err);
    }
  }, []);

  const snapshotCurrentLayout = useCallback(() => {
    const snapPanels = panelsRef.current
      .filter(p => !closingPanelIds.has(p.id))
      .map(({ id, startFresh, ...rest }) => rest);
    return {
      panels: snapPanels,
      canvasOffset: { ...canvasOffsetRef.current },
      canvasZoom: canvasZoomRef.current,
    };
  }, [closingPanelIds]);

  const handleSaveNewLayout = useCallback((name) => {
    const snap = snapshotCurrentLayout();
    const now = Date.now();
    const layout = {
      id: `layout-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      ...snap,
      createdAt: now,
      updatedAt: now,
    };
    setSavedLayouts(prev => {
      const next = [layout, ...prev];
      persistLayouts(next);
      return next;
    });
    addToast({ message: `Saved layout "${name}"`, type: 'success', sound: false });
  }, [snapshotCurrentLayout, persistLayouts, addToast]);

  const handleOverwriteLayout = useCallback((id) => {
    const snap = snapshotCurrentLayout();
    setSavedLayouts(prev => {
      const next = prev.map(l =>
        l.id === id ? { ...l, ...snap, updatedAt: Date.now() } : l
      );
      persistLayouts(next);
      const target = next.find(l => l.id === id);
      if (target) addToast({ message: `Updated layout "${target.name}"`, type: 'success', sound: false });
      return next;
    });
  }, [snapshotCurrentLayout, persistLayouts, addToast]);

  const handleRenameLayout = useCallback((id, name) => {
    setSavedLayouts(prev => {
      const next = prev.map(l =>
        l.id === id ? { ...l, name, updatedAt: Date.now() } : l
      );
      persistLayouts(next);
      return next;
    });
  }, [persistLayouts]);

  const handleDeleteLayout = useCallback((id) => {
    setSavedLayouts(prev => {
      const target = prev.find(l => l.id === id);
      const next = prev.filter(l => l.id !== id);
      persistLayouts(next);
      if (target) addToast({ message: `Deleted layout "${target.name}"`, type: 'info', sound: false });
      return next;
    });
  }, [persistLayouts, addToast]);

  const handleApplyLayout = useCallback((layout) => {
    if (!layout || !Array.isArray(layout.panels)) return;
    // Abort any in-flight drag/resize
    abortActiveDrag();
    // Close any open tabs tied to editor panel if layout removes it
    const hasEditor = layout.panels.some(p => p.type === 'editor');
    if (!hasEditor) {
      setOpenTabs([]);
      setActiveTab(null);
    }
    const restored = layout.panels.map(p => ({ ...p, id: makePanelId() }));
    const maxZ = restored.length ? Math.max(...restored.map(p => p.zIndex || 1), 1) : 1;
    nextZIndexRef.current = maxZ + 1;
    setClosingPanelIds(new Set());
    setPanels(restored);
    if (layout.canvasOffset) {
      setCanvasOffset(layout.canvasOffset);
      canvasOffsetRef.current = layout.canvasOffset;
    }
    if (typeof layout.canvasZoom === 'number') {
      setCanvasZoom(layout.canvasZoom);
      canvasZoomRef.current = layout.canvasZoom;
    }
    initialLayoutDone.current = true;
    addToast({ message: `Applied layout "${layout.name}"`, type: 'success', sound: false });
  }, [abortActiveDrag, addToast]);

  // ── Layouts dropdown positioning ──
  const openLayoutsDropdown = useCallback(() => {
    if (!showLayouts && layoutsBtnRef.current) {
      const rect = layoutsBtnRef.current.getBoundingClientRect();
      const left = rect.left + rect.width / 2 - 160;
      setLayoutsPos({ top: rect.bottom + 8, left });
    }
    setShowLayouts(v => !v);
  }, [showLayouts]);

  // Close layouts on Escape
  useEffect(() => {
    if (!showLayouts) return;
    const handler = (e) => { if (e.key === 'Escape') setShowLayouts(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showLayouts]);

  // ── Open settings helper ──
  const handleOpenSettings = useCallback((section) => {
    setSettingsInitialSection(section || null);
    togglePanel('settings');
  }, [togglePanel]);

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

      case 'whatsDone':
        return {
          header: 'own',
          content: (
            <WhatsDonePanel
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
              initialThreadId={panel.threadId}
              onThreadChange={(threadId) => handleChatThreadChange(panel.id, threadId)}
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

      case 'settings':
        return {
          header: 'own',
          content: (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <PanelHeader
                title="Settings"
                icon={VscSettingsGear}
                onClose={() => {
                  removePanel(panel.id);
                  setSettingsInitialSection(null);
                  if (project?.path) {
                    window.foundry?.getSetting(`start_command_${project.path}`).then((cmd) => {
                      if (cmd !== undefined) setStartCommand(cmd || '');
                    }).catch(() => {});
                  }
                }}
                onMouseDown={dragProps.onMouseDown}
              />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <SettingsPage
                  profile={profile}
                  initialSection={settingsInitialSection}
                  projectPath={project?.path}
                  onProfileChange={onProfileChange}
                  onCloneRepo={(result) => {
                    setProject({ path: result.path, name: result.name });
                    setFileTree(result.tree);
                    setOpenTabs([]);
                    setActiveTab(null);
                    removePanel(panel.id);
                    window.foundry?.setSetting('last_project_path', result.path);
                    window.foundry?.gitStatus(result.path).then(status => {
                      if (status) setGitStatus(status);
                    });
                  }}
                />
              </div>
            </div>
          ),
        };

      default:
        return { header: 'own', content: null };
    }
  };

  // ── Build add-panel menu items ──
  const addPanelItems = Object.entries(PANEL_TYPES)
    .filter(([type, config]) => {
      if (type === 'editor' || type === 'settings') return false;
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
            <div className={styles.logoVersionFullscreen}>
              <img
                src={currentTheme === 'dark' ? foundryIconDark : foundryIconLight}
                alt="Foundry"
                className={styles.titlebarLogo}
                draggable={false}
              />
              <span className={styles.titlebarVersion}>v{window.foundry?.version || ''}</span>
            </div>
          )}
        </div>
        <ActivityBar
          activePanel={null}
          onPanelClick={handleActivityClick}
          profile={profile}
          showSettings={openPanelTypes.has('settings')}
          gitChangeCount={gitStatus?.files?.length || 0}
          openPanelTypes={openPanelTypes}
        />
      </div>

      {/* ── Right Column: titlebar + canvas ── */}
      <div className={styles.rightColumn}>
        {/* ── Titlebar ── */}
        <div className={`${styles.titlebar} titlebar-drag`}>
          <div className={`${styles.titlebarLeft} ${isFullScreen ? styles.titlebarLeftFullscreen : ''} titlebar-no-drag`}>
            {!isFullScreen && (
              <>
                <img
                  src={currentTheme === 'dark' ? foundryIconDark : foundryIconLight}
                  alt="Foundry"
                  className={styles.titlebarLogo}
                  draggable={false}
                />
                <span className={styles.titlebarVersion}>v{window.foundry?.version || ''}</span>
              </>
            )}
            <span className={styles.projectControlsSpacer} aria-hidden="true" />
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
          <div className={`${styles.titlebarCenter} titlebar-no-drag`}>
            <div className={styles.centerGroup}>
              <button
                ref={addPanelBtnRef}
                className={`${styles.centerGroupBtn} ${showAddPanel ? styles.centerGroupBtnOpen : ''}`}
                onClick={openAddPanelDropdown}
                title="Add panel"
              >
                <FiPlus size={14} />
                <span>Add Panel</span>
              </button>
              <div className={styles.centerGroupDivider} />
              <button
                ref={layoutsBtnRef}
                className={`${styles.centerGroupBtn} ${showLayouts ? styles.centerGroupBtnOpen : ''}`}
                onClick={openLayoutsDropdown}
                title="Layouts"
              >
                <FiLayout size={13} />
                <span>Layouts</span>
              </button>
            </div>
          </div>
          <div className={`${styles.titlebarActions} titlebar-no-drag`}>
            <SearchBar projectPath={project?.path} onOpenFile={handleOpenFile} />
            <div className={styles.titlebarDivider} />
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
          </div>
        </div>

        <AddPanelPanel
          isOpen={showAddPanel}
          onClose={() => setShowAddPanel(false)}
          dropdownPos={addPanelPos}
          items={addPanelItems}
          onAddPanel={addPanel}
        />

        <LayoutsPanel
          isOpen={showLayouts}
          onClose={() => setShowLayouts(false)}
          dropdownPos={layoutsPos}
          layouts={savedLayouts}
          onApply={handleApplyLayout}
          onSaveNew={handleSaveNewLayout}
          onOverwrite={handleOverwriteLayout}
          onRename={handleRenameLayout}
          onDelete={handleDeleteLayout}
          canSave={panels.filter(p => !closingPanelIds.has(p.id)).length > 0}
        />

        {/* ── Main panel area ── */}
        <div className={styles.main}>
          {/* Canvas workspace */}
          <div
            ref={canvasRef}
            className={styles.canvas}
            onMouseDown={handleCanvasMouseDown}
          >
            <div className={styles.canvasBg} aria-hidden="true" />
            <div
              ref={canvasTransformRef}
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
