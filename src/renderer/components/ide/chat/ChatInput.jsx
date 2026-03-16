import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCpu, FiChevronDown, FiCheck, FiSquare } from 'react-icons/fi';
import styles from './ChatInput.module.css';

const SendIcon = ({ size = 28, active }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
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

const MODEL_OPTIONS = [
  { key: 'opus', label: 'Claude 4 Opus', desc: 'Most capable' },
  { key: 'sonnet', label: 'Claude 4 Sonnet', desc: 'Balanced' },
  { key: 'haiku', label: 'Claude 3.5 Haiku', desc: 'Fastest' },
];

const ChatInput = forwardRef(function ChatInput({
  input,
  setInput,
  isStreaming,
  hasProvider,
  modelLabel,
  modelKey,
  showModelDropdown,
  setShowModelDropdown,
  onSend,
  onStop,
  onModelSwitch,
  modelSwitcherRef,
}, inputRef) {

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = '0';
    const newHeight = Math.min(el.scrollHeight, 200);
    el.style.height = newHeight + 'px';
    el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden';
  };

  return (
    <div className={styles.inputArea}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={inputRef}
          className={styles.input}
          placeholder={hasProvider === false ? 'Connect a provider to start...' : 'Message Sage...'}
          value={input}
          onChange={handleChange}
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
                        onClick={() => onModelSwitch(opt.key)}
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
              <button className={styles.stopBtn} onClick={onStop} title="Stop generating">
                <FiSquare size={12} />
              </button>
            ) : (
              <button
                className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
                onClick={onSend}
                disabled={!input.trim() || hasProvider === false}
              >
                <SendIcon size={28} active={!!input.trim()} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default ChatInput;
