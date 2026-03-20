import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import styles from './ChatPanel.module.css';

// ---- Modular chat components ---- //
import { generateId, messageToStored, storedToMessage } from './chat/chatHelpers';
import ChatHeader from './chat/ChatHeader';
import UserMessage from './chat/UserMessage';
import AgentMessage from './chat/AgentMessage';
import ChatInput from './chat/ChatInput';
import ChatEmptyState from './chat/ChatEmptyState';
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
export default function ChatPanel({ onOpenSettings, projectPath, onSplit, onClosePanel, panelCount = 1, startFresh = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState(null);
  const [hasProvider, setHasProvider] = useState(null);
  const [modelLabel, setModelLabel] = useState('Claude 4 Sonnet');
  const [modelKey, setModelKey] = useState('sonnet');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [error, setError] = useState(null);
  const modelSwitcherRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const cleanupRef = useRef([]);
  const lastUserMsgRef = useRef('');

  // ---- Thread state ---- //
  const [threads, setThreads] = useState([]);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [showThreadList, setShowThreadList] = useState(false);
  const threadListRef = useRef(null);

  // Content block tracking for streaming
  const blocksRef = useRef([]);
  const activeBlockIdxRef = useRef(-1);
  const currentStreamIdRef = useRef(null);

  // Throttle streaming UI updates to prevent UI freeze
  const rafRef = useRef(null);
  const pendingBlocksRef = useRef(null);

  // Keep ref in sync so stream listeners can filter by panel
  const setStreamId = useCallback((id) => {
    currentStreamIdRef.current = id;
    setCurrentStreamId(id);
  }, []);

  // ---- Immediate message save to SQLite (no debounce) ---- //
  const currentThreadIdRef = useRef(null);
  const saveLockRef = useRef(Promise.resolve());

  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  const saveMessageToDb = useCallback((msg) => {
    const threadId = currentThreadIdRef.current;
    if (!threadId) return;

    saveLockRef.current = saveLockRef.current.then(async () => {
      const storedMsg = messageToStored(msg, threadId);
      try {
        await window.foundry?.chatSaveMessages([storedMsg]);
        const count = await window.foundry?.chatGetMessageCount(threadId);
        if (count != null) {
          await window.foundry?.chatUpdateThread(threadId, { message_count: count });
        }
      } catch (err) {
        console.error('[Chat] Failed to save message:', err);
      }
    }).catch(err => {
      console.error('[Chat] Save chain error:', err);
    });
  }, []);

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
          return;
        }

        const lastThreadId = await window.foundry?.getSetting('last_chat_thread_id');

        if (lastThreadId && threadList?.find(t => t.id === lastThreadId)) {
          await switchToThread(lastThreadId);
        } else if (threadList?.length > 0) {
          await switchToThread(threadList[0].id);
        } else {
          setCurrentThreadId(null);
          setMessages([]);
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

    try {
      const result = await window.foundry?.chatGetMessages(threadId, 100, null);
      const loadedMessages = (result?.messages || [])
        .map(storedToMessage)
        .filter(Boolean);

      setMessages(loadedMessages);
      setCurrentThreadId(threadId);
      setShowThreadList(false);
      await window.foundry?.setSetting('last_chat_thread_id', threadId);
    } catch (err) {
      console.error('[Chat] Failed to load messages for thread:', threadId, err);
    }
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
        setShowThreadList(false);
        await window.foundry?.setSetting('last_chat_thread_id', id);
        return id;
      }
    } catch (err) {
      console.error('[Chat] Failed to create thread:', err);
    }
    return null;
  }, [projectPath]);

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
        }
      }
    } catch (err) {
      console.error('[Chat] Failed to delete thread:', err);
    }
  }, [currentThreadId, threads, switchToThread]);

  // ---- New chat handler ---- //
  const handleNewChat = useCallback(async (closeDropdown) => {
    await saveLockRef.current;
    setCurrentThreadId(null);
    setMessages([]);
    if (closeDropdown) setShowThreadList(false);
  }, []);

  // ---- Check provider ---- //
  const reconnectRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 20; // Stop after ~60s of retries

  const startReconnectLoop = useCallback(() => {
    if (reconnectRef.current) return; // Already running
    reconnectAttemptsRef.current = 0;
    reconnectRef.current = setInterval(async () => {
      reconnectAttemptsRef.current++;
      if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        clearInterval(reconnectRef.current);
        reconnectRef.current = null;
        return;
      }
      try {
        const retry = await window.foundry?.claudeGetToken();
        if (retry?.token) {
          setHasProvider(true);
          clearInterval(reconnectRef.current);
          reconnectRef.current = null;
          const m = await window.foundry?.claudeGetModel();
          if (m) {
            const labels = { 'sonnet': 'Claude 4 Sonnet', 'opus': 'Claude 4 Opus', 'haiku': 'Claude 3.5 Haiku' };
            setModelLabel(labels[m] || m);
            setModelKey(m);
          }
        }
      } catch { /* keep retrying until max attempts */ }
    }, 3000);
  }, []);

  const checkProvider = useCallback(async () => {
    try {
      const [tokenResult, modelResult] = await Promise.all([
        window.foundry?.claudeGetToken(),
        window.foundry?.claudeGetModel(),
      ]);
      const connected = !!tokenResult?.token;
      setHasProvider(connected);
      if (modelResult) {
        const labels = { 'sonnet': 'Claude 4 Sonnet', 'opus': 'Claude 4 Opus', 'haiku': 'Claude 3.5 Haiku' };
        setModelLabel(labels[modelResult] || modelResult);
        setModelKey(modelResult);
      }
      if (connected && reconnectRef.current) {
        clearInterval(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (!connected) {
        startReconnectLoop();
      }
    } catch {
      setHasProvider(false);
      startReconnectLoop();
    }
  }, [startReconnectLoop]);

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
      if (reconnectRef.current) clearInterval(reconnectRef.current);
    };
  }, [checkProvider]);

  // ---- Close dropdowns on outside click ---- //
  useEffect(() => {
    if (!showModelDropdown && !showThreadList) return;
    const handleClickOutside = (e) => {
      if (showModelDropdown && modelSwitcherRef.current && !modelSwitcherRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
      if (showThreadList && threadListRef.current && !threadListRef.current.contains(e.target)) {
        setShowThreadList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown, showThreadList]);

  // ---- Model switch ---- //
  const handleModelSwitch = async (key) => {
    const labels = { 'sonnet': 'Claude 4 Sonnet', 'opus': 'Claude 4 Opus', 'haiku': 'Claude 3.5 Haiku' };
    setModelKey(key);
    setModelLabel(labels[key] || key);
    setShowModelDropdown(false);
    try {
      await window.foundry?.claudeSetModel(key);
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
    const cleanupStream = window.foundry?.onClaudeStream((streamId, data) => {
      // Only process events for THIS panel's active stream
      if (!currentStreamIdRef.current || streamId !== currentStreamIdRef.current) return;
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
        updateAssistantBlocks(blocksRef.current);
      }

      if (type === 'content_block_delta') {
        const idx = activeBlockIdxRef.current;
        if (idx < 0 || idx >= blocksRef.current.length) {
          const delta = data.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            const block = { type: 'text', content: delta.text, streaming: true };
            blocksRef.current = [...blocksRef.current, block];
            activeBlockIdxRef.current = blocksRef.current.length - 1;
            updateAssistantBlocks(blocksRef.current);
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
        updateAssistantBlocks(blocks);
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
          updateAssistantBlocks(blocks);

          // Incremental save: persist assistant message after each completed block
          // so content survives crashes/disconnects
          setMessages(prev => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
              saveMessageToDb({ ...prev[lastIdx], blocks });
            }
            return prev;
          });
        }
        activeBlockIdxRef.current = -1;
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
      playChatCompleteSound();
      // Native OS notification when window is not focused
      if (!document.hasFocus() && Notification.permission === 'granted') {
        const userPrompt = lastUserMsgRef.current;
        const body = userPrompt ? (userPrompt.length > 80 ? userPrompt.slice(0, 80) + '…' : userPrompt) : 'Response complete';
        new Notification('Sage is done', { body, silent: true });
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
    });

    const cleanupError = window.foundry?.onClaudeStreamError((streamId, error) => {
      if (!currentStreamIdRef.current || streamId !== currentStreamIdRef.current) return;
      setIsStreaming(false);
      setStreamId(null);
      setError(error);
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
    });

    cleanupRef.current = [cleanupStream, cleanupEnd, cleanupError];
    return () => {
      cleanupRef.current.forEach(fn => fn?.());
      // Cancel any pending RAF update to prevent state updates after unmount
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [updateAssistantBlocks, saveMessageToDb, checkProvider]);

  // Throttled auto-scroll: avoids layout thrash during streaming
  const scrollRafRef = useRef(null);
  useEffect(() => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    });
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [messages, isStreaming]);

  // ---- Send message ---- //
  const handleSend = async () => {
    const hasContent = input.trim() || images.length > 0;
    if (!hasContent || isStreaming) return;
    setError(null);

    let threadId = currentThreadId;
    if (!threadId) {
      const title = (input.trim() || 'Image message').slice(0, 50);
      threadId = await createNewThread(title);
      if (!threadId) return;
    } else if (messages.length === 0) {
      const title = (input.trim() || 'Image message').slice(0, 50);
      try {
        await window.foundry?.chatUpdateThread(threadId, { title });
        setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title } : t));
      } catch { /* silent */ }
    }

    lastUserMsgRef.current = input.trim();

    // Capture current images and clear state
    const attachedImages = [...images];

    const userMsg = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
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
    setInput('');
    setImages([]);
    // Revoke object URLs
    attachedImages.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview); });
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setIsStreaming(true);

    blocksRef.current = [];
    activeBlockIdxRef.current = -1;

    const streamId = `stream-${++streamIdCounter}-${Date.now()}`;
    setStreamId(streamId);

    let model;
    try { model = await window.foundry?.claudeGetModel(); } catch { /* default */ }

    const result = await window.foundry?.claudeChat({
      messages: apiMessages,
      images: attachedImages.length > 0 ? attachedImages.map(img => ({
        base64: img.base64,
        mediaType: img.mediaType,
        name: img.name,
      })) : undefined,
      model: model || 'sonnet',
      streamId,
      workspacePath: projectPath || null,
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

  // ---- Stop streaming ---- //
  const handleStop = async () => {
    if (currentStreamId) {
      await window.foundry?.claudeStopStream(currentStreamId);
      setIsStreaming(false);
      setStreamId(null);
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
        onSplit={onSplit}
        onClosePanel={onClosePanel}
        panelCount={panelCount}
      />

      <div className={styles.messages}>
        <ChatEmptyState
          hasProvider={hasProvider}
          hasMessages={messages.length > 0}
          onOpenSettings={onOpenSettings}
          onSelectPrompt={handleSelectPrompt}
        />
        {messages.map((msg, i) => (
          msg.role === 'user' ? (
            <UserMessage key={msg.id || i} msg={msg} />
          ) : (
            <AgentMessage
              key={msg.id || i}
              msg={msg}
              isStreaming={isStreaming}
              isLastMsg={i === messages.length - 1}
            />
          )
        ))}
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
        showModelDropdown={showModelDropdown}
        setShowModelDropdown={setShowModelDropdown}
        onSend={handleSend}
        onStop={handleStop}
        onModelSwitch={handleModelSwitch}
        modelSwitcherRef={modelSwitcherRef}
      />
    </div>
  );
}
