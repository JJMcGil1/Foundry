import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiSend, FiMessageSquare, FiUser, FiCpu, FiSquare, FiAlertCircle, FiSettings } from 'react-icons/fi';
import styles from './ChatPanel.module.css';

let streamIdCounter = 0;

export default function ChatPanel({ width, onWidthChange, onOpenSettings }) {
  const [isResizing, setIsResizing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState(null);
  const [hasProvider, setHasProvider] = useState(null); // null = loading, true/false
  const [modelLabel, setModelLabel] = useState('Claude');
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const streamingContentRef = useRef('');
  const cleanupRef = useRef([]);

  // Check if a provider is connected
  useEffect(() => {
    async function checkProvider() {
      try {
        const [tokenResult, modelResult] = await Promise.all([
          window.foundry?.claudeGetToken(),
          window.foundry?.claudeGetModel(),
        ]);
        setHasProvider(!!tokenResult?.token);

        // Resolve model label from alias
        if (modelResult) {
          const labels = {
            'sonnet': 'Sonnet',
            'opus': 'Opus',
            'haiku': 'Haiku',
          };
          setModelLabel(labels[modelResult] || modelResult);
        }
      } catch {
        setHasProvider(false);
      }
    }
    checkProvider();

    // Re-check when window regains focus (user may have added key in settings)
    const handleFocus = () => checkProvider();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Set up stream listeners
  useEffect(() => {
    const cleanupStream = window.foundry?.onClaudeStream((streamId, data) => {
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        const text = data.delta.text;
        streamingContentRef.current += text;
        const accumulated = streamingContentRef.current;
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = { ...updated[lastIdx], content: accumulated };
          }
          return updated;
        });
      }
    });

    const cleanupEnd = window.foundry?.onClaudeStreamEnd((streamId) => {
      setIsStreaming(false);
      setCurrentStreamId(null);
      // Update final message with timestamp
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        }
        return updated;
      });
    });

    const cleanupError = window.foundry?.onClaudeStreamError((streamId, error) => {
      setIsStreaming(false);
      setCurrentStreamId(null);
      setError(error);
      // Remove the empty assistant message
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant' && !updated[lastIdx].content) {
          updated.pop();
        }
        return updated;
      });
    });

    cleanupRef.current = [cleanupStream, cleanupEnd, cleanupError];
    return () => {
      cleanupRef.current.forEach(fn => fn?.());
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    setError(null);

    const userMsg = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Build message history for API (exclude timestamps)
    const apiMessages = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    // Add placeholder assistant message
    const assistantPlaceholder = {
      role: 'assistant',
      content: '',
      timestamp: '',
    };

    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    setInput('');
    setIsStreaming(true);
    streamingContentRef.current = '';

    const streamId = `stream-${++streamIdCounter}-${Date.now()}`;
    setCurrentStreamId(streamId);

    // Get model
    let model;
    try {
      model = await window.foundry?.claudeGetModel();
    } catch { /* use default */ }

    // Send to Claude
    const result = await window.foundry?.claudeChat({
      messages: apiMessages,
      model: model || 'sonnet',
      streamId,
    });

    if (result?.error) {
      setIsStreaming(false);
      setCurrentStreamId(null);
      setError(result.error);
      // Remove the empty placeholder
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant' && !updated[lastIdx].content) {
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
      // Finalize the current message
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          if (!updated[lastIdx].content) {
            updated.pop(); // Remove empty placeholder
          } else {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + '\n\n*[stopped]*',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
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

  // Empty state when no provider is connected
  const renderEmptyState = () => {
    if (hasProvider === null) return null; // loading
    if (hasProvider === false) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <FiCpu size={24} />
          </div>
          <h4 className={styles.emptyTitle}>Connect a Provider</h4>
          <p className={styles.emptyDesc}>
            Add your Claude API key or connect your Claude Code subscription to start chatting.
          </p>
          {onOpenSettings && (
            <button className={styles.emptyBtn} onClick={() => onOpenSettings('providers')}>
              <FiSettings size={13} />
              Open Providers Settings
            </button>
          )}
        </div>
      );
    }
    if (messages.length === 0) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <FiMessageSquare size={24} />
          </div>
          <h4 className={styles.emptyTitle}>Start a Conversation</h4>
          <p className={styles.emptyDesc}>
            Ask anything about your code. Claude will help you build, debug, and understand your project.
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      className={styles.panel}
      style={{ width: isResizing ? width : undefined }}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={isResizing ? { duration: 0 } : { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      <div className={styles.header}>
        <FiMessageSquare size={14} />
        <span className={styles.headerTitle}>Chat</span>
        <div className={styles.modelBadge}>
          <FiCpu size={11} />
          <span>{modelLabel}</span>
        </div>
      </div>

      <div className={styles.messages}>
        {renderEmptyState()}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
          >
            <div className={styles.messageHeader}>
              <div className={`${styles.messageAvatar} ${msg.role === 'user' ? styles.avatarUser : styles.avatarAi}`}>
                {msg.role === 'user' ? <FiUser size={12} /> : <FiCpu size={12} />}
              </div>
              <span className={styles.messageRole}>
                {msg.role === 'user' ? 'You' : 'Claude'}
              </span>
              {msg.timestamp && (
                <span className={styles.messageTime}>{msg.timestamp}</span>
              )}
            </div>
            <div className={styles.messageContent}>
              {msg.content || (isStreaming && i === messages.length - 1 ? (
                <div className={styles.typing}>
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              ) : null)}
            </div>
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
            placeholder={hasProvider === false ? 'Connect a provider to start...' : 'Ask Claude...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={hasProvider === false}
          />
          {isStreaming ? (
            <button
              className={styles.stopBtn}
              onClick={handleStop}
              title="Stop generating"
            >
              <FiSquare size={12} />
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!input.trim() || hasProvider === false}
            >
              <FiSend size={14} />
            </button>
          )}
        </div>
        <div className={styles.inputHint}>
          <kbd className={styles.kbd}>Enter</kbd>
          <span>to send</span>
          <kbd className={styles.kbd}>Shift+Enter</kbd>
          <span>new line</span>
        </div>
      </div>
    </motion.div>
  );
}
