import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMessageSquare, FiUser, FiCpu, FiSquare, FiAlertCircle, FiSettings, FiChevronRight, FiChevronDown, FiCheck, FiPlus, FiTrash2 } from 'react-icons/fi';
import styles from './ChatPanel.module.css';

// ---- Modular chat components ---- //
import { generateId, messageToStored, storedToMessage } from './chat/chatHelpers';
import { renderMarkdown } from './chat/Markdown';
import ThinkingBlock from './chat/ThinkingBlock';
import ToolUseBlock from './chat/ToolUseBlock';

const SendIcon = ({ size = 28, active, className }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className={className}>
    <defs>
      <linearGradient id="sendGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FB923C" />
        <stop offset="100%" stopColor="#EA580C" />
      </linearGradient>
    </defs>
    <circle cx="14" cy="14" r="14" fill={active ? 'url(#sendGradient)' : 'currentColor'} />
    <path
      d="M14 7.5L14 19.5M14 7.5L8.5 13M14 7.5L19.5 13"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

let streamIdCounter = 0;

// ---- Extracted: generateId, messageToStored, storedToMessage → chat/chatHelpers.js ---- //
// ---- Extracted: renderMarkdown, InlineMarkdown, processInline, CodeBlock → chat/Markdown.jsx ---- //
// ---- Extracted: ThinkingBlock → chat/ThinkingBlock.jsx ---- //
// ---- Extracted: ToolUseBlock, BashToolBlock, EditToolBlock → chat/ToolUseBlock.jsx ---- //




// ---- Main ChatPanel Component ---- //
export default function ChatPanel({ visible = true, width, onWidthChange, onOpenSettings, projectPath }) {
  const [isResizing, setIsResizing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
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
  const blocksRef = useRef([]);           // array of { type, content, name, input }
  const activeBlockIdxRef = useRef(-1);   // index of currently-streaming block

  // ---- Immediate message save to SQLite (no debounce) ---- //
  const currentThreadIdRef = useRef(null); // Keep a ref in sync for async callbacks
  const saveLockRef = useRef(Promise.resolve()); // serialize saves to prevent races

  // Keep ref in sync
  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  const saveMessageToDb = useCallback((msg) => {
    const threadId = currentThreadIdRef.current;
    if (!threadId) return;

    // Chain saves to ensure ordering — each save waits for the previous one
    saveLockRef.current = saveLockRef.current.then(async () => {
      const storedMsg = messageToStored(msg, threadId);
      try {
        await window.foundry?.chatSaveMessages([storedMsg]);
        // Update thread message count + last_modified
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

        // Try to restore last thread from settings
        const lastThreadId = await window.foundry?.getSetting('last_chat_thread_id');

        if (lastThreadId && threadList?.find(t => t.id === lastThreadId)) {
          // Load this thread's messages
          await switchToThread(lastThreadId);
        } else if (threadList?.length > 0) {
          // Use most recent thread
          await switchToThread(threadList[0].id);
        } else {
          // No threads — start fresh (will create on first message)
          setCurrentThreadId(null);
          setMessages([]);
        }
      } catch (err) {
        console.error('[Chat] Failed to load threads:', err);
      }
    }

    // Defer past the first animation frame so framer-motion's enter animation
    // commits before any setState calls land — prevents the animation from
    // resetting mid-flight and causing the "thin strip" UX bug.
    const raf = requestAnimationFrame(() => loadThreads());
    return () => cancelAnimationFrame(raf);
  }, [projectPath]);

  // ---- Switch to a thread: load its messages from SQLite ---- //
  const switchToThread = useCallback(async (threadId) => {
    if (!threadId) return;

    // Wait for any in-flight saves to complete before loading new thread
    await saveLockRef.current;

    try {
      const result = await window.foundry?.chatGetMessages(threadId, 100, null);
      const loadedMessages = (result?.messages || [])
        .map(storedToMessage)
        .filter(Boolean);

      setMessages(loadedMessages);
      setCurrentThreadId(threadId);
      setShowThreadList(false);

      // Persist current thread selection
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
        // Switch to next thread or clear
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

  // Check if a provider is connected
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

  // Close dropdowns on outside click
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

  const handleModelSwitch = async (key) => {
    const labels = { 'sonnet': 'Claude 4 Sonnet', 'opus': 'Claude 4 Opus', 'haiku': 'Claude 3.5 Haiku' };
    setModelKey(key);
    setModelLabel(labels[key] || key);
    setShowModelDropdown(false);
    try {
      await window.foundry?.claudeSetModel(key);
    } catch { /* silent */ }
  };

  const MODEL_OPTIONS = [
    { key: 'opus', label: 'Claude 4 Opus', desc: 'Most capable' },
    { key: 'sonnet', label: 'Claude 4 Sonnet', desc: 'Balanced' },
    { key: 'haiku', label: 'Claude 3.5 Haiku', desc: 'Fastest' },
  ];

  // Helper: update the last assistant message's blocks
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

  // Set up stream listeners
  useEffect(() => {
    const cleanupStream = window.foundry?.onClaudeStream((streamId, data) => {
      const { type } = data;

      // --- content_block_start: a new block begins ---
      if (type === 'content_block_start') {
        const cb = data.content_block || {};
        const block = {
          type: cb.type || 'text',       // 'text', 'thinking', 'tool_use'
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

      // --- content_block_delta: append to the active block ---
      if (type === 'content_block_delta') {
        const idx = activeBlockIdxRef.current;
        if (idx < 0 || idx >= blocksRef.current.length) {
          // No active block — create a fallback text block
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

      // --- content_block_stop: mark block as done ---
      if (type === 'content_block_stop') {
        const idx = data.index != null ? data.index : activeBlockIdxRef.current;
        if (idx >= 0 && idx < blocksRef.current.length) {
          const blocks = [...blocksRef.current];
          blocks[idx] = { ...blocks[idx], streaming: false };

          // Try to parse tool input JSON
          if (blocks[idx].type === 'tool_use' && typeof blocks[idx].input === 'string') {
            try {
              blocks[idx].input = JSON.parse(blocks[idx].input);
            } catch { /* leave as string */ }
          }

          blocksRef.current = blocks;
          updateAssistantBlocks(blocks);
        }
        activeBlockIdxRef.current = -1;
      }
    });

    const cleanupEnd = window.foundry?.onClaudeStreamEnd((streamId) => {
      setIsStreaming(false);
      setCurrentStreamId(null);
      // Finalize all blocks
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
          // Save completed assistant message to SQLite immediately
          saveMessageToDb(finalMsg);
        }
        return updated;
      });
    });

    const cleanupError = window.foundry?.onClaudeStreamError((streamId, error) => {
      setIsStreaming(false);
      setCurrentStreamId(null);
      setError(error);
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          const hasContent = updated[lastIdx].blocks?.some(b => b.content);
          if (!hasContent) {
            updated.pop();
          } else {
            // Save partial assistant message
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

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    setError(null);

    // Ensure we have a thread — create one if needed
    let threadId = currentThreadId;
    if (!threadId) {
      const title = input.trim().slice(0, 50);
      threadId = await createNewThread(title);
      if (!threadId) return; // Failed to create thread
    } else if (messages.length === 0) {
      // First message in existing thread — update title
      const title = input.trim().slice(0, 50);
      try {
        await window.foundry?.chatUpdateThread(threadId, { title });
        setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title } : t));
      } catch { /* silent */ }
    }

    const userMsg = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
    };

    // Save user message to SQLite immediately
    saveMessageToDb(userMsg);

    // Build message history for API
    const apiMessages = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role,
        content: m.role === 'assistant'
          ? (m.blocks?.filter(b => b.type === 'text').map(b => b.content).join('\n') || m.content || '')
          : m.content,
      }));

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
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setIsStreaming(true);

    // Reset block tracking
    blocksRef.current = [];
    activeBlockIdxRef.current = -1;

    const streamId = `stream-${++streamIdCounter}-${Date.now()}`;
    setCurrentStreamId(streamId);

    let model;
    try { model = await window.foundry?.claudeGetModel(); } catch { /* default */ }

    const result = await window.foundry?.claudeChat({
      messages: apiMessages,
      model: model || 'sonnet',
      streamId,
      workspacePath: projectPath || null,
    });

    if (result?.error) {
      setIsStreaming(false);
      setCurrentStreamId(null);
      setError(result.error);
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant' && !updated[lastIdx].blocks?.length) {
          updated.pop();
        }
        return updated;
      });
    }
  };

  const handleStop = async () => {
    if (currentStreamId) {
      await window.foundry?.claudeStopStream(currentStreamId);
      setIsStreaming(false);
      setCurrentStreamId(null);
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
            // Save stopped assistant message
            saveMessageToDb(stoppedMsg);
          }
        }
        return updated;
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

  // Render a single message's content blocks
  const renderMessageContent = (msg, msgIndex) => {
    const blocks = msg.blocks;
    const isLastMsg = msgIndex === messages.length - 1;

    // Legacy: if no blocks, fall back to plain text
    if (!blocks || blocks.length === 0) {
      if (msg.content) {
        return <div className={styles.messageContent}>{renderMarkdown(msg.content)}</div>;
      }
      if (isStreaming && isLastMsg && msg.role === 'assistant') {
        return (
          <div className={styles.messageContent}>
            <div className={styles.typing}>
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
          </div>
        );
      }
      return null;
    }

    return (
      <div className={styles.messageContent}>
        {blocks.map((block, bi) => {
          if (block.type === 'thinking') {
            return (
              <ThinkingBlock
                key={bi}
                content={block.content}
                isStreaming={block.streaming}
              />
            );
          }
          if (block.type === 'tool_use') {
            return (
              <ToolUseBlock
                key={bi}
                name={block.name}
                input={block.input}
                isStreaming={block.streaming}
              />
            );
          }
          // text block
          return (
            <div key={bi} className={styles.textBlock}>
              {renderMarkdown(block.content)}
              {block.streaming && (
                <span className={styles.streamCursor} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const QUICK_PROMPTS = [
    { label: 'Explain this project', prompt: 'Give me a high-level overview of this project — its structure, key technologies, and how the pieces fit together.' },
    { label: 'Find bugs', prompt: 'Scan the current codebase for potential bugs, edge cases, or issues and suggest fixes.' },
    { label: 'Write tests', prompt: 'Suggest and write tests for the most critical parts of this codebase.' },
    { label: 'Refactor code', prompt: 'Identify areas of the codebase that could benefit from refactoring and suggest improvements.' },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Get current thread title
  const currentThread = threads.find(t => t.id === currentThreadId);
  const currentThreadTitle = currentThread?.title || 'New Chat';

  const renderEmptyState = () => {
    if (hasProvider === null) return null;
    if (hasProvider === false) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyCard}>
            <div className={styles.emptyCardHeader}>
              <div className={styles.emptyCardIcon}>
                <FiSettings size={18} />
              </div>
              <h4 className={styles.emptyCardTitle}>Connect a Provider</h4>
              <p className={styles.emptyCardDesc}>
                Add your API key to start chatting with Sage.
              </p>
            </div>
            {onOpenSettings && (
              <button className={styles.emptyCardBtn} onClick={() => onOpenSettings('providers')}>
                Open Settings
                <FiChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      );
    }
    if (messages.length === 0) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyCard}>
            <div className={styles.emptyCardHeader}>
              <span className={styles.emptyGreetingIcon}>✦</span>
              <h3 className={styles.emptyCardTitle}>{getGreeting()}</h3>
              <p className={styles.emptyCardDesc}>
                What can I help you build today?
              </p>
            </div>
            <div className={styles.quickPrompts}>
              {QUICK_PROMPTS.map((qp, i) => (
                <button
                  key={i}
                  className={styles.quickPromptBtn}
                  onClick={() => {
                    setInput(qp.prompt);
                    inputRef.current?.focus();
                  }}
                >
                  <span className={styles.quickPromptLabel}>{qp.label}</span>
                  <FiChevronRight size={13} className={styles.quickPromptArrow} />
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      className={styles.panel}
      style={{
        width: isResizing ? width : undefined,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      initial={false}
      animate={{ width: visible ? width : 0, opacity: visible ? 1 : 0 }}
      transition={isResizing ? { duration: 0 } : { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      <div className={styles.header}>
        <FiMessageSquare size={13} />
        <div className={styles.threadSelector} ref={threadListRef}>
          <button
            className={styles.threadSelectorBtn}
            onClick={() => setShowThreadList(v => !v)}
            title="Switch chat thread"
          >
            <span className={styles.threadTitle}>{currentThreadTitle}</span>
            <FiChevronDown
              size={10}
              className={`${styles.threadChevron} ${showThreadList ? styles.threadChevronOpen : ''}`}
            />
          </button>
          <AnimatePresence>
            {showThreadList && (
              <motion.div
                className={styles.threadDropdown}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <button
                  className={styles.threadNewBtn}
                  onClick={async () => {
                    // Wait for in-flight saves and start fresh
                    await saveLockRef.current;
                    setCurrentThreadId(null);
                    setMessages([]);
                    setShowThreadList(false);
                  }}
                >
                  <FiPlus size={12} />
                  <span>New Chat</span>
                </button>
                {threads.length > 0 && <div className={styles.threadDivider} />}
                <div className={styles.threadListScroll}>
                  {threads.map(thread => (
                    <button
                      key={thread.id}
                      className={`${styles.threadItem} ${thread.id === currentThreadId ? styles.threadItemActive : ''}`}
                      onClick={() => switchToThread(thread.id)}
                    >
                      <FiMessageSquare size={11} className={styles.threadItemIcon} />
                      <span className={styles.threadItemTitle}>
                        {thread.title || 'Untitled'}
                      </span>
                      <span className={styles.threadItemCount}>
                        {thread.message_count || 0}
                      </span>
                      <button
                        className={styles.threadDeleteBtn}
                        onClick={(e) => handleDeleteThread(thread.id, e)}
                        title="Delete thread"
                      >
                        <FiTrash2 size={10} />
                      </button>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          className={styles.newChatBtn}
          onClick={async () => {
            await saveLockRef.current;
            setCurrentThreadId(null);
            setMessages([]);
          }}
          title="New chat"
        >
          <FiPlus size={14} />
        </button>
      </div>

      <div className={styles.messages}>
        {renderEmptyState()}
        {messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
          >
            <div className={styles.messageHeader}>
              <div className={`${styles.messageAvatar} ${msg.role === 'user' ? styles.avatarUser : styles.avatarAi}`}>
                {msg.role === 'user' ? <FiUser size={12} /> : <FiCpu size={12} />}
              </div>
              <span className={styles.messageRole}>
                {msg.role === 'user' ? 'You' : 'Sage'}
              </span>
              {msg.timestamp && (
                <span className={styles.messageTime}>{msg.timestamp}</span>
              )}
            </div>
            {msg.role === 'user' ? (
              <div className={styles.messageContent}>{msg.content}</div>
            ) : (
              renderMessageContent(msg, i)
            )}
          </div>
        ))}
        {error && (
          <div className={styles.errorBanner}>
            <FiAlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.input}
            placeholder={hasProvider === false ? 'Connect a provider to start...' : 'Message Sage...'}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = '0';
              const newHeight = Math.min(el.scrollHeight, 200);
              el.style.height = newHeight + 'px';
              el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden';
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={hasProvider === false}
          />
          <div className={styles.inputToolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.modelSwitcher} ref={modelSwitcherRef}>
                <button
                  className={styles.modelBadge}
                  onClick={() => setShowModelDropdown(v => !v)}
                >
                  <FiCpu size={12} className={styles.modelBadgeIcon} />
                  <span>{modelLabel}</span>
                  <FiChevronDown
                    size={10}
                    className={`${styles.modelBadgeChevron} ${showModelDropdown ? styles.modelBadgeChevronOpen : ''}`}
                  />
                </button>
                <AnimatePresence>
                  {showModelDropdown && (
                    <motion.div
                      className={styles.modelDropdown}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                    >
                      {MODEL_OPTIONS.map(opt => (
                        <button
                          key={opt.key}
                          className={`${styles.modelOption} ${modelKey === opt.key ? styles.modelOptionActive : ''}`}
                          onClick={() => handleModelSwitch(opt.key)}
                        >
                          <span className={styles.modelOptionCheck}>
                            {modelKey === opt.key ? <FiCheck size={12} /> : null}
                          </span>
                          <span className={styles.modelOptionLabel}>{opt.label}</span>
                          <span className={styles.modelOptionDesc}>{opt.desc}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className={styles.toolbarRight}>
              {isStreaming ? (
                <button className={styles.stopBtn} onClick={handleStop} title="Stop generating">
                  <FiSquare size={12} />
                </button>
              ) : (
                <button
                  className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
                  onClick={handleSend}
                  disabled={!input.trim() || hasProvider === false}
                >
                  <SendIcon size={28} active={!!input.trim()} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
