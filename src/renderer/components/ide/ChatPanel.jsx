import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiAlertCircle } from 'react-icons/fi';
import styles from './ChatPanel.module.css';

// ---- Modular chat components ---- //
import { generateId, messageToStored, storedToMessage } from './chat/chatHelpers';
import ChatHeader from './chat/ChatHeader';
import UserMessage from './chat/UserMessage';
import AgentMessage from './chat/AgentMessage';
import ChatInput from './chat/ChatInput';
import ChatEmptyState from './chat/ChatEmptyState';

let streamIdCounter = 0;

// ---- Main ChatPanel Component ---- //
export default function ChatPanel({ visible = true, width, onWidthChange, onOpenSettings, projectPath, onSplit, onClosePanel, panelCount = 1, isMultiPanel = false, startFresh = false }) {
  const [isResizing, setIsResizing] = useState(false);
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

  // ---- Thread state ---- //
  const [threads, setThreads] = useState([]);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [showThreadList, setShowThreadList] = useState(false);
  const threadListRef = useRef(null);

  // Content block tracking for streaming
  const blocksRef = useRef([]);
  const activeBlockIdxRef = useRef(-1);
  const currentStreamIdRef = useRef(null);

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
  useEffect(() => {
    async function checkProvider() {
      try {
        const [tokenResult, modelResult] = await Promise.all([
          window.foundry?.claudeGetToken(),
          window.foundry?.claudeGetModel(),
        ]);
        setHasProvider(!!tokenResult?.token);
        if (modelResult) {
          const labels = { 'sonnet': 'Claude 4 Sonnet', 'opus': 'Claude 4 Opus', 'haiku': 'Claude 3.5 Haiku' };
          setModelLabel(labels[modelResult] || modelResult);
          setModelKey(modelResult);
        }
      } catch {
        setHasProvider(false);
      }
    }
    checkProvider();
    const handleFocus = () => checkProvider();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

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
  const updateAssistantBlocks = useCallback((blocks) => {
    setMessages(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
        updated[lastIdx] = { ...updated[lastIdx], blocks: [...blocks] };
      }
      return updated;
    });
  }, []);

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
    };
  }, [updateAssistantBlocks, saveMessageToDb]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // ---- Resize ---- //
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    const handleMouseMove = (e) => {
      const newWidth = Math.max(280, Math.min(600, startWidth - (e.clientX - startX)));
      onWidthChange(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onWidthChange]);

  // ---- Derived ---- //
  const currentThread = threads.find(t => t.id === currentThreadId);
  const currentThreadTitle = currentThread?.title || 'New Chat';

  const handleSelectPrompt = useCallback((prompt) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  return (
    <motion.div
      className={`${styles.panel} ${isMultiPanel ? styles.panelMulti : ''}`}
      style={{
        width: isMultiPanel ? undefined : (isResizing ? width : undefined),
        flex: isMultiPanel ? 1 : undefined,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      initial={false}
      animate={isMultiPanel
        ? { opacity: 1 }
        : { width: visible ? width : 0, opacity: visible ? 1 : 0 }
      }
      transition={isResizing ? { duration: 0 } : { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {!isMultiPanel && <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />}

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
    </motion.div>
  );
}
