import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { FiAlertCircle, FiLoader } from 'react-icons/fi';
import styles from './ChatPanel.module.css';

// ---- Pagination tunables ---- //
// Initial load: latest N messages on thread switch. Older pages fetch the same
// chunk size. 30 keeps initial render under ~150 DOM nodes for typical sessions.
const MESSAGE_PAGE_SIZE = 30;
// How close to the top (in px) before we trigger an older-page load.
const LOAD_OLDER_THRESHOLD_PX = 200;
// How close to the bottom (in px) we consider "at the bottom" for auto-scroll.
const AT_BOTTOM_THRESHOLD_PX = 80;
// Debounce window for partial-message DB saves during streaming (ms). The
// final save still fires synchronously on stream_end so nothing is lost.
const STREAM_SAVE_DEBOUNCE_MS = 1500;

// ---- Modular chat components ---- //
import { generateId, messageToStored, storedToMessage } from './chat/chatHelpers';
import ChatHeader from './chat/ChatHeader';
import UserMessage from './chat/UserMessage';
import AgentMessage from './chat/AgentMessage';
import ChatInput from './chat/ChatInput';
import ChatEmptyState from './chat/ChatEmptyState';
import { CLAUDE_MODELS_DEFAULT, LEGACY_ALIAS_MAP } from './settings/settingsUtils';
import chatCompleteSound from '../../assets/sounds/chat-complete.mp3';

let streamIdCounter = 0;

// Singleton audio for chat-complete sound
let _chatCompleteAudio = null;
function playChatCompleteSound() {
  try {
    if (!_chatCompleteAudio) {
      _chatCompleteAudio = new Audio(chatCompleteSound);
      _chatCompleteAudio.volume = 0.45;
    }
    _chatCompleteAudio.currentTime = 0;
    _chatCompleteAudio.play().catch(() => {});
  } catch {
    // silent fallback
  }
}

// ---- Main ChatPanel Component ---- //
// Memoized: every IDELayout re-render would otherwise rebuild this entire tree
// (streaming state, blocks, messages, pagination). IDELayout now passes stable
// per-panel callbacks so shallow-compare memo shorts-circuits when nothing the
// panel cares about has changed.
function ChatPanel({ onOpenSettings, projectPath, startFresh = false, panelDragProps, onPanelClose, initialThreadId, onThreadChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState(null);
  const [hasProvider, setHasProvider] = useState(null);
  const [modelLabel, setModelLabel] = useState('Sonnet 4.6');
  const [modelKey, setModelKey] = useState('claude-sonnet-4-6');
  const [modelOptions, setModelOptions] = useState(() => {
    try {
      const cached = localStorage.getItem('claude_models_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Invalidate old caches that were missing claude-opus-4-7
        if (parsed?.length && parsed.some(m => m.id === 'claude-opus-4-7')) return parsed;
        localStorage.removeItem('claude_models_cache');
      }
    } catch { /* ignore */ }
    return CLAUDE_MODELS_DEFAULT;
  });
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState('medium');
  const [error, setError] = useState(null);
  const modelSwitcherRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const cleanupRef = useRef([]);
  const lastUserMsgRef = useRef('');

  // ---- Pagination state ---- //
  // hasMoreOlder: true if the DB still has older messages we haven't loaded.
  // loadingOlder: prevents concurrent fetches when scroll fires repeatedly.
  // Tracked as refs because the scroll handler reads them on every event and
  // we don't need re-renders for changes.
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasMoreOlderRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const oldestCreatedAtRef = useRef(null);

  // Tracks whether the user has scrolled away from the bottom. While true,
  // streaming deltas must not yank them back down — a major source of "lag"
  // perception comes from auto-scroll fighting the user.
  const isAtBottomRef = useRef(true);

  // ---- Thread state ---- //
  const [threads, setThreads] = useState([]);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [showThreadList, setShowThreadList] = useState(false);
  const threadListRef = useRef(null);

  // Message queue — stores messages to send after current stream finishes
  const messageQueueRef = useRef([]);
  const [queueSize, setQueueSize] = useState(0);
  const processNextQueuedRef = useRef(null);
  const handleSendDirectRef = useRef(null);

  // Content block tracking for streaming
  const blocksRef = useRef([]);
  const activeBlockIdxRef = useRef(-1);
  const currentStreamIdRef = useRef(null);

  // Notify parent when thread changes so layout can persist it
  const onThreadChangeRef = useRef(onThreadChange);
  onThreadChangeRef.current = onThreadChange;
  useEffect(() => {
    if (onThreadChangeRef.current && currentThreadId) {
      onThreadChangeRef.current(currentThreadId);
    }
  }, [currentThreadId]);

  // Throttle streaming UI updates to prevent UI freeze
  const rafRef = useRef(null);
  const pendingBlocksRef = useRef(null);

  // Keep ref in sync so stream listeners can filter by panel
  const setStreamId = useCallback((id) => {
    currentStreamIdRef.current = id;
    setCurrentStreamId(id);
  }, []);

  // ---- Message save to SQLite ---- //
  // Two paths:
  //   saveMessageToDb(msg)             — full save: writes msg + recalculates
  //                                      thread message_count. Use for user
  //                                      messages and the FINAL assistant save.
  //   scheduleStreamingSave(msg)       — debounced incremental save during
  //                                      streaming. Skips the count/thread
  //                                      update IPC roundtrips since the count
  //                                      hasn't changed mid-message.
  const currentThreadIdRef = useRef(null);
  const saveLockRef = useRef(Promise.resolve());
  // Mirror of `messages` state — used by stream handlers so they can read the
  // current list without going through `setMessages(prev => prev)`, which
  // still runs through React's scheduler on every block boundary.
  const messagesRef = useRef([]);
  const streamSaveTimerRef = useRef(null);
  const streamSavePendingRef = useRef(null);

  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Internal: send one message to the DB. If `withCount` is true, also fetch
  // the new count and update the thread row — only needed when a message is
  // first inserted (not on every streaming delta save).
  const writeMessage = useCallback((msg, withCount) => {
    const threadId = currentThreadIdRef.current;
    if (!threadId) return;

    saveLockRef.current = saveLockRef.current.then(async () => {
      const storedMsg = messageToStored(msg, threadId);
      try {
        await window.foundry?.chatSaveMessages([storedMsg]);
        if (withCount) {
          const count = await window.foundry?.chatGetMessageCount(threadId);
          if (count != null) {
            await window.foundry?.chatUpdateThread(threadId, { message_count: count });
          }
        }
      } catch (err) {
        console.error('[Chat] Failed to save message:', err);
      }
    }).catch(err => {
      console.error('[Chat] Save chain error:', err);
    });
  }, []);

  const saveMessageToDb = useCallback((msg) => writeMessage(msg, true), [writeMessage]);

  // Flushes any pending streaming-save snapshot immediately (without count).
  const flushStreamingSave = useCallback(() => {
    if (streamSaveTimerRef.current) {
      clearTimeout(streamSaveTimerRef.current);
      streamSaveTimerRef.current = null;
    }
    const pending = streamSavePendingRef.current;
    if (pending) {
      streamSavePendingRef.current = null;
      writeMessage(pending, false);
    }
  }, [writeMessage]);

  // Schedules a debounced save of the latest streaming snapshot. Coalesces
  // many block_stop events into one DB write per debounce window. Drops the
  // count/thread-update IPC pair for incremental saves since the message id
  // hasn't changed mid-stream.
  const scheduleStreamingSave = useCallback((msg) => {
    streamSavePendingRef.current = msg;
    if (streamSaveTimerRef.current) return;
    streamSaveTimerRef.current = setTimeout(() => {
      streamSaveTimerRef.current = null;
      const pending = streamSavePendingRef.current;
      if (!pending) return;
      streamSavePendingRef.current = null;
      writeMessage(pending, false);
    }, STREAM_SAVE_DEBOUNCE_MS);
  }, [writeMessage]);

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ---- Load threads on mount / when projectPath changes ---- //
  useEffect(() => {
    async function loadThreads() {
      try {
        const threadList = await window.foundry?.chatGetThreads(projectPath || null);
        setThreads(threadList || []);

        // Split panels start fresh — don't auto-load a thread
        if (startFresh) {
          setCurrentThreadId(null);
          setMessages([]);
          hasMoreOlderRef.current = false;
          setHasMoreOlder(false);
          oldestCreatedAtRef.current = null;
          return;
        }

        // Use panel-specific thread if provided, otherwise fall back to global setting
        const targetThreadId = initialThreadId || await window.foundry?.getSetting('last_chat_thread_id');

        if (targetThreadId && threadList?.find(t => t.id === targetThreadId)) {
          await switchToThread(targetThreadId);
        } else if (threadList?.length > 0) {
          await switchToThread(threadList[0].id);
        } else {
          setCurrentThreadId(null);
          setMessages([]);
          hasMoreOlderRef.current = false;
          setHasMoreOlder(false);
          oldestCreatedAtRef.current = null;
        }
      } catch (err) {
        console.error('[Chat] Failed to load threads:', err);
      }
    }

    const raf = requestAnimationFrame(() => loadThreads());
    return () => cancelAnimationFrame(raf);
  }, [projectPath]);

  // ---- Switch to a thread ---- //
  const switchToThread = useCallback(async (threadId) => {
    if (!threadId) return;
    await saveLockRef.current;
    flushStreamingSave();

    try {
      // Only load the most recent page; older pages stream in via infinite-scroll.
      const result = await window.foundry?.chatGetMessages(threadId, MESSAGE_PAGE_SIZE, null);
      const loadedMessages = (result?.messages || [])
        .map(storedToMessage)
        .filter(Boolean);

      setMessages(loadedMessages);
      setCurrentThreadId(threadId);
      setShowThreadList(false);
      // Track pagination cursor: the createdAt of the oldest loaded message
      // is what we pass back as `beforeTimestamp` to fetch the previous page.
      const oldest = loadedMessages[0];
      oldestCreatedAtRef.current = oldest?.createdAt || null;
      const hasMore = !!result?.hasMore;
      hasMoreOlderRef.current = hasMore;
      setHasMoreOlder(hasMore);
      // Reset scroll-position tracking — fresh thread, jump to bottom on next paint.
      isAtBottomRef.current = true;
      // Clear message queue when switching threads
      messageQueueRef.current = [];
      setQueueSize(0);
      await window.foundry?.setSetting('last_chat_thread_id', threadId);
    } catch (err) {
      console.error('[Chat] Failed to load messages for thread:', threadId, err);
    }
  }, [flushStreamingSave]);

  // ---- Load older page (infinite scroll up) ---- //
  // Triggered when the user scrolls near the top of the message list. Prepends
  // the previous page and restores scroll position so the user's view doesn't
  // jump.
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current) return;
    if (!hasMoreOlderRef.current) return;
    const threadId = currentThreadIdRef.current;
    if (!threadId) return;
    const cursor = oldestCreatedAtRef.current;
    if (!cursor) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const container = messagesContainerRef.current;
    // Capture the distance from the bottom so we can restore exactly where
    // the user was after the prepend grows the scrollable area.
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    try {
      const result = await window.foundry?.chatGetMessages(threadId, MESSAGE_PAGE_SIZE, cursor);
      const olderMessages = (result?.messages || [])
        .map(storedToMessage)
        .filter(Boolean);

      if (olderMessages.length > 0) {
        setMessages(prev => [...olderMessages, ...prev]);
        oldestCreatedAtRef.current = olderMessages[0]?.createdAt || cursor;
      }
      const hasMore = !!result?.hasMore;
      hasMoreOlderRef.current = hasMore;
      setHasMoreOlder(hasMore);

      // Restore scroll position: after prepend, scrollHeight grew. Keep the
      // user's viewport on the same content by adding the height delta to
      // their previous scrollTop. Use rAF so we measure after layout.
      if (container && olderMessages.length > 0) {
        requestAnimationFrame(() => {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        });
      }
    } catch (err) {
      console.error('[Chat] Failed to load older messages:', err);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, []);

  // ---- Shared: reset pagination state when entering an empty/fresh chat ---- //
  // Without this, the "Scroll up to load older messages" banner can leak from
  // a previous thread into a new or emptied one.
  const resetPaginationState = useCallback(() => {
    hasMoreOlderRef.current = false;
    setHasMoreOlder(false);
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    oldestCreatedAtRef.current = null;
    isAtBottomRef.current = true;
  }, []);

  // ---- Create a new thread ---- //
  const createNewThread = useCallback(async (title) => {
    const id = generateId();
    try {
      const thread = await window.foundry?.chatCreateThread({
        id,
        title: title || null,
        workspacePath: projectPath || null,
      });
      if (thread) {
        setThreads(prev => [thread, ...prev]);
        setCurrentThreadId(id);
        setMessages([]);
        resetPaginationState();
        setShowThreadList(false);
        await window.foundry?.setSetting('last_chat_thread_id', id);
        return id;
      }
    } catch (err) {
      console.error('[Chat] Failed to create thread:', err);
    }
    return null;
  }, [projectPath, resetPaginationState]);

  // ---- Delete a thread ---- //
  const handleDeleteThread = useCallback(async (threadId, e) => {
    e?.stopPropagation();
    try {
      await window.foundry?.chatDeleteThread(threadId);
      setThreads(prev => prev.filter(t => t.id !== threadId));

      if (currentThreadId === threadId) {
        const remaining = threads.filter(t => t.id !== threadId);
        if (remaining.length > 0) {
          await switchToThread(remaining[0].id);
        } else {
          setCurrentThreadId(null);
          setMessages([]);
          resetPaginationState();
        }
      }
    } catch (err) {
      console.error('[Chat] Failed to delete thread:', err);
    }
  }, [currentThreadId, threads, switchToThread, resetPaginationState]);

  // ---- New chat handler ---- //
  const handleNewChat = useCallback(async (closeDropdown) => {
    await saveLockRef.current;
    setCurrentThreadId(null);
    setMessages([]);
    resetPaginationState();
    // Clear message queue on new chat
    messageQueueRef.current = [];
    setQueueSize(0);
    if (closeDropdown) setShowThreadList(false);
  }, [resetPaginationState]);

  // ---- Check provider ---- //
  const reconnectRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 20; // Stop after ~60s of retries

  const startReconnectLoop = useCallback(() => {
    if (reconnectRef.current) return; // Already running
    reconnectAttemptsRef.current = 0;
    const tryReconnect = async () => {
      reconnectAttemptsRef.current++;
      if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        reconnectRef.current = null;
        return;
      }
      try {
        const retry = await window.foundry?.claudeGetToken();
        if (retry?.token) {
          setHasProvider(true);
          reconnectRef.current = null;
          const m = await window.foundry?.claudeGetModel();
          if (m) {
            const resolvedKey = LEGACY_ALIAS_MAP[m] || m;
            setModelKey(resolvedKey);
            setModelOptions(prev => {
              const match = prev.find(opt => opt.id === resolvedKey);
              setModelLabel(match?.label || resolvedKey);
              return prev;
            });
          }
          fetchModelOptions();
          return;
        }
      } catch { /* keep retrying until max attempts */ }
      // Exponential backoff: 5s, 10s, 20s, 40s… capped at 60s
      const delay = Math.min(5000 * Math.pow(2, reconnectAttemptsRef.current - 1), 60000);
      reconnectRef.current = setTimeout(tryReconnect, delay);
    };
    reconnectRef.current = setTimeout(tryReconnect, 5000);
  }, []);

  // Fetch available models from the API and update modelOptions state.
  // On success, persists the list to settings so next startup shows real models, not the hardcoded fallback.
  const fetchModelOptions = useCallback(async () => {
    try {
      const result = await window.foundry?.claudeFetchModels();
      if (result?.models?.length) {
        setModelOptions(result.models);
        try { localStorage.setItem('claude_models_cache', JSON.stringify(result.models)); } catch { /* ignore */ }
        setModelKey(prev => {
          const resolved = LEGACY_ALIAS_MAP[prev] || prev;
          const match = result.models.find(m => m.id === resolved);
          if (match) setModelLabel(match.label);
          return resolved;
        });
      }
    } catch (err) {
      console.warn('[fetchModelOptions] failed:', err);
    }
  }, []);

  const checkProvider = useCallback(async () => {
    try {
      const [tokenResult, modelResult, thinkingResult] = await Promise.all([
        window.foundry?.claudeGetToken(),
        window.foundry?.claudeGetModel(),
        window.foundry?.getSetting('claude_thinking_level'),
      ]);
      const connected = !!tokenResult?.token;
      setHasProvider(connected);
      if (modelResult) {
        // Migrate legacy short aliases to full model IDs; use cached model list for label lookup
        const resolvedKey = LEGACY_ALIAS_MAP[modelResult] || modelResult;
        let knownModels = CLAUDE_MODELS_DEFAULT;
        try { const c = localStorage.getItem('claude_models_cache'); if (c) { const p = JSON.parse(c); if (p?.length) knownModels = p; } } catch { /* ignore */ }
        const match = knownModels.find(m => m.id === resolvedKey);
        setModelLabel(match?.label || resolvedKey);
        setModelKey(resolvedKey);
      }
      if (thinkingResult) {
        setThinkingLevel(thinkingResult);
      }
      if (connected) {
        if (reconnectRef.current) {
          clearTimeout(reconnectRef.current);
          reconnectRef.current = null;
        }
        fetchModelOptions();
      } else {
        startReconnectLoop();
      }
    } catch {
      setHasProvider(false);
      startReconnectLoop();
    }
  }, [startReconnectLoop, fetchModelOptions]);

  useEffect(() => {
    checkProvider();
    // Re-check on window focus (e.g. switching back to app)
    const handleFocus = () => checkProvider();
    window.addEventListener('focus', handleFocus);
    // Re-check when page becomes visible (e.g. waking from sleep)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkProvider();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [checkProvider]);

  // ---- Close dropdowns on outside click ---- //
  useEffect(() => {
    if (!showModelDropdown && !showThreadList) return;
    const handleClickOutside = (e) => {
      if (showModelDropdown && modelSwitcherRef.current && !modelSwitcherRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
      if (showThreadList && threadListRef.current && !threadListRef.current.contains(e.target) && !e.target.closest('[data-thread-dropdown]')) {
        setShowThreadList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown, showThreadList]);

  // ---- Model switch ---- //
  const handleModelSwitch = async (id) => {
    setModelKey(id);
    setModelOptions(prev => {
      const match = prev.find(m => m.id === id);
      setModelLabel(match?.label || id);
      return prev;
    });
    setShowModelDropdown(false);
    try {
      await window.foundry?.claudeSetModel(id);
    } catch { /* silent */ }
  };

  // ---- Thinking level switch ---- //
  const handleThinkingLevelChange = async (level) => {
    setThinkingLevel(level);
    try {
      await window.foundry?.setSetting('claude_thinking_level', level);
    } catch { /* silent */ }
  };

  // ---- Streaming helpers ---- //
  // Flush pending blocks to React state (called via RAF throttle)
  const flushBlocks = useCallback(() => {
    rafRef.current = null;
    const blocks = pendingBlocksRef.current;
    if (!blocks) return;
    pendingBlocksRef.current = null;
    setMessages(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
        updated[lastIdx] = { ...updated[lastIdx], blocks: [...blocks] };
      }
      return updated;
    });
  }, []);

  // Throttled update: batches streaming deltas to one React render per animation frame
  const updateAssistantBlocks = useCallback((blocks) => {
    pendingBlocksRef.current = blocks;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flushBlocks);
    }
  }, [flushBlocks]);

  // ---- Stream listeners ---- //
  useEffect(() => {
    // Process a single stream event — extracted so both single and batch handlers use it
    const processStreamEvent = (data) => {
      const { type } = data;

      if (type === 'content_block_start') {
        const cb = data.content_block || {};
        const block = {
          type: cb.type || 'text',
          content: cb.text || cb.thinking || '',
          name: cb.name || '',
          id: cb.id || '',
          input: (cb.input && typeof cb.input === 'object' && Object.keys(cb.input).length === 0) ? '' : (cb.input || ''),
          streaming: true,
        };
        blocksRef.current = [...blocksRef.current, block];
        activeBlockIdxRef.current = blocksRef.current.length - 1;
      }

      if (type === 'content_block_delta') {
        const idx = activeBlockIdxRef.current;
        if (idx < 0 || idx >= blocksRef.current.length) {
          const delta = data.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            const block = { type: 'text', content: delta.text, streaming: true };
            blocksRef.current = [...blocksRef.current, block];
            activeBlockIdxRef.current = blocksRef.current.length - 1;
          }
          return;
        }

        const delta = data.delta;
        const blocks = [...blocksRef.current];
        const current = { ...blocks[idx] };

        if (delta?.type === 'text_delta' && delta.text) {
          current.content = (current.content || '') + delta.text;
        } else if (delta?.type === 'thinking_delta' && delta.thinking) {
          current.content = (current.content || '') + delta.thinking;
        } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
          current.input = (current.input || '') + delta.partial_json;
        }

        blocks[idx] = current;
        blocksRef.current = blocks;
      }

      if (type === 'content_block_stop') {
        const idx = data.index != null ? data.index : activeBlockIdxRef.current;
        if (idx >= 0 && idx < blocksRef.current.length) {
          const blocks = [...blocksRef.current];
          blocks[idx] = { ...blocks[idx], streaming: false };

          if (blocks[idx].type === 'tool_use' && typeof blocks[idx].input === 'string') {
            try {
              blocks[idx].input = JSON.parse(blocks[idx].input);
            } catch { /* leave as string */ }
          }

          blocksRef.current = blocks;

          // Incremental save via the ref mirror — reading setMessages(prev=>prev)
          // on every block-stop forced React through its scheduler even though
          // we weren't changing state.
          // Use the debounced streaming save: a 30-block tool-heavy message
          // used to fire 30 IPC chains (each: saveMessages + getMessageCount +
          // updateThread = 3 round-trips). Coalesces to one write per debounce
          // window without count/thread updates.
          const msgs = messagesRef.current;
          const lastIdx = msgs.length - 1;
          if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
            scheduleStreamingSave({ ...msgs[lastIdx], blocks });
          }
        }
        activeBlockIdxRef.current = -1;
      }
    };

    const cleanupStream = window.foundry?.onClaudeStream((streamId, data) => {
      // Only process events for THIS panel's active stream
      if (!currentStreamIdRef.current || streamId !== currentStreamIdRef.current) return;
      processStreamEvent(data);
      updateAssistantBlocks(blocksRef.current);
    });

    // Batched stream events — main process sends multiple events in one IPC call
    const cleanupBatch = window.foundry?.onClaudeStreamBatch?.((batch) => {
      let processed = false;
      for (const [streamId, data] of batch) {
        if (!currentStreamIdRef.current || streamId !== currentStreamIdRef.current) continue;
        processStreamEvent(data);
        processed = true;
      }
      if (processed) {
        updateAssistantBlocks(blocksRef.current);
      }
    });

    const cleanupEnd = window.foundry?.onClaudeStreamEnd((streamId) => {
      if (!currentStreamIdRef.current || streamId !== currentStreamIdRef.current) return;
      // Flush any pending throttled update before finalizing
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        pendingBlocksRef.current = null;
      }
      // Cancel any pending debounced streaming save — the final save below
      // supersedes it (and does include the count/thread-update pair).
      if (streamSaveTimerRef.current) {
        clearTimeout(streamSaveTimerRef.current);
        streamSaveTimerRef.current = null;
      }
      streamSavePendingRef.current = null;
      // Only play sound/notify if no more queued messages
      if (messageQueueRef.current.length === 0) {
        playChatCompleteSound();
        if (!document.hasFocus() && Notification.permission === 'granted') {
          const userPrompt = lastUserMsgRef.current;
          const body = userPrompt ? (userPrompt.length > 80 ? userPrompt.slice(0, 80) + '…' : userPrompt) : 'Response complete';
          new Notification('Sage is done', { body, silent: true });
        }
      }
      setIsStreaming(false);
      setStreamId(null);
      const blocks = blocksRef.current.map(b => ({ ...b, streaming: false }));
      blocksRef.current = blocks;
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          const finalMsg = {
            ...updated[lastIdx],
            blocks,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          updated[lastIdx] = finalMsg;
          saveMessageToDb(finalMsg);
        }
        return updated;
      });
      // Process next queued message if any
      if (messageQueueRef.current.length > 0) {
        processNextQueuedRef.current?.();
      }
    });

    const cleanupError = window.foundry?.onClaudeStreamError((streamId, error) => {
      if (!currentStreamIdRef.current || streamId !== currentStreamIdRef.current) return;
      setIsStreaming(false);
      setStreamId(null);
      setError(error);
      // Drop the pending partial-save snapshot; the final save below supersedes it.
      // If we don't clear, a trailing partial write could land AFTER the final
      // write in the save-lock chain and overwrite it with stale content.
      if (streamSaveTimerRef.current) {
        clearTimeout(streamSaveTimerRef.current);
        streamSaveTimerRef.current = null;
      }
      streamSavePendingRef.current = null;
      // If the error looks auth-related, re-check provider to trigger auto-reconnect
      const errLower = (error || '').toLowerCase();
      if (errLower.includes('auth') || errLower.includes('401') || errLower.includes('unauthorized') || errLower.includes('token') || errLower.includes('credential')) {
        checkProvider();
      }
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          const hasContent = updated[lastIdx].blocks?.some(b => b.content);
          if (!hasContent) {
            updated.pop();
          } else {
            const partialMsg = { ...updated[lastIdx], blocks: updated[lastIdx].blocks.map(b => ({ ...b, streaming: false })) };
            updated[lastIdx] = partialMsg;
            saveMessageToDb(partialMsg);
          }
        }
        return updated;
      });
      // Clear queue on error — don't keep sending if something went wrong
      messageQueueRef.current = [];
      setQueueSize(0);
    });

    cleanupRef.current = [cleanupStream, cleanupBatch, cleanupEnd, cleanupError];
    return () => {
      cleanupRef.current.forEach(fn => fn?.());
      // Cancel any pending RAF update to prevent state updates after unmount
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Flush (don't lose) any pending streaming save if the panel unmounts
      // mid-stream — e.g. closing a split panel while it's still generating.
      if (streamSaveTimerRef.current) {
        clearTimeout(streamSaveTimerRef.current);
        streamSaveTimerRef.current = null;
        const pending = streamSavePendingRef.current;
        streamSavePendingRef.current = null;
        if (pending) writeMessage(pending, false);
      }
    };
  }, [updateAssistantBlocks, saveMessageToDb, scheduleStreamingSave, writeMessage, checkProvider]);

  // Throttled auto-scroll: only sticks to the bottom if the user is already
  // at (or near) the bottom. If they've scrolled up to read history, we must
  // not yank them back down on every streaming delta — that fighting was one
  // of the worst perceived-lag sources in split-panel sessions.
  const scrollRafRef = useRef(null);
  useEffect(() => {
    if (!isAtBottomRef.current) return; // respect user scroll position
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      // scrollTop assignment is cheaper than scrollIntoView (no geometry calc
      // for a target element) and doesn't trigger nested scroll-container
      // adjustments elsewhere in the IDE shell.
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [messages, isStreaming]);

  // ---- Scroll listener: infinite-scroll-up + at-bottom tracking ---- //
  const scrollHandlerRafRef = useRef(null);
  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    // Coalesce rapid scroll events through rAF — browsers can fire scroll
    // at wheel rate (100+ Hz on trackpads) and we only need one check per
    // frame.
    if (scrollHandlerRafRef.current) return;
    scrollHandlerRafRef.current = requestAnimationFrame(() => {
      scrollHandlerRafRef.current = null;
      const c = messagesContainerRef.current;
      if (!c) return;
      const distanceFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
      isAtBottomRef.current = distanceFromBottom <= AT_BOTTOM_THRESHOLD_PX;
      if (c.scrollTop <= LOAD_OLDER_THRESHOLD_PX) {
        loadOlderMessages();
      }
    });
  }, [loadOlderMessages]);

  // ---- Core send logic (takes explicit content + images) ---- //
  const handleSendDirect = async (contentText, contentImages) => {
    setError(null);

    let threadId = currentThreadIdRef.current;
    if (!threadId) {
      const title = (contentText || 'Image message').slice(0, 50);
      threadId = await createNewThread(title);
      if (!threadId) return;
    } else if (messages.length === 0) {
      const title = (contentText || 'Image message').slice(0, 50);
      try {
        await window.foundry?.chatUpdateThread(threadId, { title });
        setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title } : t));
      } catch { /* silent */ }
    }

    lastUserMsgRef.current = contentText;

    // Capture images
    const attachedImages = [...contentImages];

    const userMsg = {
      id: generateId(),
      role: 'user',
      content: contentText,
      images: attachedImages.length > 0 ? attachedImages.map(img => ({
        id: img.id,
        name: img.name,
        mediaType: img.mediaType,
        base64: img.base64,
      })) : undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
    };

    saveMessageToDb(userMsg);

    // Build API messages — for messages with images, construct multimodal content
    const apiMessages = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        if (m.role === 'assistant') {
          return {
            role: m.role,
            content: m.blocks?.filter(b => b.type === 'text').map(b => b.content).join('\n') || m.content || '',
          };
        }
        // User message — check for images
        if (m.images && m.images.length > 0) {
          const contentBlocks = [];
          for (const img of m.images) {
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: img.mediaType,
                data: img.base64,
              },
            });
          }
          if (m.content) {
            contentBlocks.push({ type: 'text', text: m.content });
          }
          return { role: 'user', content: contentBlocks };
        }
        return { role: m.role, content: m.content };
      });

    const assistantPlaceholder = {
      id: generateId(),
      role: 'assistant',
      blocks: [],
      content: '',
      timestamp: '',
      createdAt: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    // Sending a message is an explicit user action — they expect to see the
    // outgoing message and the response. Re-stick to bottom even if they had
    // scrolled up reading history.
    isAtBottomRef.current = true;
    // Revoke object URLs for images that had previews
    attachedImages.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview); });
    setIsStreaming(true);

    blocksRef.current = [];
    activeBlockIdxRef.current = -1;

    const streamId = `stream-${++streamIdCounter}-${Date.now()}`;
    setStreamId(streamId);

    const model = modelKey;

    // Resolve effort level (Anthropic's new API parameter — replaces budget_tokens for Opus 4.7).
    // Persisted value is a string: 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'.
    let effortLevel;
    try {
      const saved = await window.foundry?.getSetting('claude_thinking_level');
      const valid = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];
      effortLevel = valid.includes(saved) ? saved : null; // null = let main pick model-appropriate default
    } catch { effortLevel = null; }

    const result = await window.foundry?.claudeChat({
      messages: apiMessages,
      images: attachedImages.length > 0 ? attachedImages.map(img => ({
        base64: img.base64,
        mediaType: img.mediaType,
        name: img.name,
      })) : undefined,
      model: model || 'claude-sonnet-4-6',
      streamId,
      workspacePath: projectPath || null,
      effortLevel,
    });

    if (result?.error) {
      setIsStreaming(false);
      setStreamId(null);
      setError(result.error);
      // If auth-related error, trigger reconnect check
      const errLower = (result.error || '').toLowerCase();
      if (errLower.includes('auth') || errLower.includes('401') || errLower.includes('unauthorized') || errLower.includes('token') || errLower.includes('credential')) {
        checkProvider();
      }
      // Remove empty assistant placeholder on API error — but don't lose partial content
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          const hasContent = updated[lastIdx].blocks?.some(b => b.content);
          if (!hasContent) {
            updated.pop();
          } else {
            // Save partial content before discarding streaming state
            const partialMsg = { ...updated[lastIdx], blocks: updated[lastIdx].blocks.map(b => ({ ...b, streaming: false })) };
            updated[lastIdx] = partialMsg;
            saveMessageToDb(partialMsg);
          }
        }
        return updated;
      });
    }
  };
  handleSendDirectRef.current = handleSendDirect;

  // ---- Public send handler (queues if streaming) ---- //
  const handleSend = async () => {
    const hasContent = input.trim() || images.length > 0;
    if (!hasContent) return;

    if (isStreaming) {
      // Queue the message for sending after current stream completes
      messageQueueRef.current.push({
        content: input.trim(),
        images: images.length > 0 ? [...images] : [],
      });
      setQueueSize(messageQueueRef.current.length);
      setInput('');
      setImages([]);
      if (inputRef.current) inputRef.current.style.height = 'auto';
      return;
    }

    // Send immediately
    const contentText = input.trim();
    const contentImages = [...images];
    setInput('');
    setImages([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    await handleSendDirect(contentText, contentImages);
  };

  // ---- Process next queued message ---- //
  const processNextQueued = useCallback(() => {
    if (messageQueueRef.current.length === 0) return;
    const next = messageQueueRef.current.shift();
    setQueueSize(messageQueueRef.current.length);
    // Small delay to let stream-end state settle, then send via ref for fresh closure
    setTimeout(() => {
      handleSendDirectRef.current?.(next.content, next.images || []);
    }, 100);
  }, []);
  processNextQueuedRef.current = processNextQueued;

  // ---- Stop streaming ---- //
  const handleStop = async () => {
    if (currentStreamId) {
      await window.foundry?.claudeStopStream(currentStreamId);
      setIsStreaming(false);
      setStreamId(null);
      // Drop any pending partial save — the full save below is the truth.
      // Without this, a trailing partial write could land after the full
      // save and revert it to a pre-stop snapshot.
      if (streamSaveTimerRef.current) {
        clearTimeout(streamSaveTimerRef.current);
        streamSaveTimerRef.current = null;
      }
      streamSavePendingRef.current = null;
      const blocks = blocksRef.current.map(b => ({ ...b, streaming: false }));
      blocksRef.current = blocks;
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          const hasContent = updated[lastIdx].blocks?.some(b => b.content);
          if (!hasContent) {
            updated.pop();
          } else {
            const stoppedMsg = {
              ...updated[lastIdx],
              blocks,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            updated[lastIdx] = stoppedMsg;
            saveMessageToDb(stoppedMsg);
          }
        }
        return updated;
      });
      // Clear queue when user manually stops
      messageQueueRef.current = [];
      setQueueSize(0);
    }
  };

  // ---- Derived ---- //
  const currentThread = threads.find(t => t.id === currentThreadId);
  const currentThreadTitle = currentThread?.title || 'New Chat';

  const handleSelectPrompt = useCallback((prompt) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  return (
    <div className={styles.panel}>
      <ChatHeader
        threads={threads}
        currentThreadId={currentThreadId}
        currentThreadTitle={currentThreadTitle}
        showThreadList={showThreadList}
        setShowThreadList={setShowThreadList}
        switchToThread={switchToThread}
        handleDeleteThread={handleDeleteThread}
        onNewChat={handleNewChat}
        threadListRef={threadListRef}
        panelDragProps={panelDragProps}
        onPanelClose={onPanelClose}
      />

      <div
        className={styles.messages}
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
      >
        <ChatEmptyState
          hasProvider={hasProvider}
          hasMessages={messages.length > 0}
          onOpenSettings={onOpenSettings}
          onSelectPrompt={handleSelectPrompt}
        />
        {hasMoreOlder && (
          <div className={styles.loadOlderBanner}>
            {loadingOlder ? (
              <>
                <FiLoader size={12} className={styles.loadOlderSpin} />
                <span>Loading older messages…</span>
              </>
            ) : (
              <span>Scroll up to load older messages</span>
            )}
          </div>
        )}
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          // Each message wrapped in a CSS content-visibility container so the
          // browser can skip layout/paint for off-screen messages entirely.
          // contain-intrinsic-size gives it a placeholder box so scroll
          // height stays stable — without it, scrollbars jitter as items
          // enter/leave the viewport. `auto` lets the browser measure on
          // first paint, and the value we pass in is just an initial hint.
          if (msg.role === 'user') {
            return (
              <div key={msg.id || i} className={styles.messageSlot}>
                <UserMessage msg={msg} />
              </div>
            );
          }
          // Only forward isStreaming to the last message. Passing it to
          // every message makes every AgentMessage memo miss on each
          // streaming delta — re-rendering the full history 60x/second.
          return (
            <div key={msg.id || i} className={styles.messageSlot}>
              <AgentMessage
                msg={msg}
                isStreaming={isLast && isStreaming}
                isLastMsg={isLast}
              />
            </div>
          );
        })}
        {error && (
          <div className={styles.errorBanner}>
            <FiAlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        ref={inputRef}
        input={input}
        setInput={setInput}
        images={images}
        setImages={setImages}
        isStreaming={isStreaming}
        hasProvider={hasProvider}
        modelLabel={modelLabel}
        modelKey={modelKey}
        modelOptions={modelOptions}
        showModelDropdown={showModelDropdown}
        setShowModelDropdown={setShowModelDropdown}
        onSend={handleSend}
        onStop={handleStop}
        onModelSwitch={handleModelSwitch}
        modelSwitcherRef={modelSwitcherRef}
        thinkingLevel={thinkingLevel}
        onThinkingLevelChange={handleThinkingLevelChange}
        queueSize={queueSize}
        queuedMessages={messageQueueRef.current}
        onRemoveQueued={(index) => {
          messageQueueRef.current.splice(index, 1);
          setQueueSize(messageQueueRef.current.length);
        }}
        onClearQueue={() => {
          messageQueueRef.current = [];
          setQueueSize(0);
        }}
      />
    </div>
  );
}

export default memo(ChatPanel);
