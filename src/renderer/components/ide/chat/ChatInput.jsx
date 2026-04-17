import React, { forwardRef, useRef, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronDown, FiSquare, FiPaperclip, FiX } from 'react-icons/fi';
import { LuBrainCircuit } from 'react-icons/lu';
import styles from './ChatInput.module.css';
import MediaPreview from './MediaPreview';
import { THINKING_LEVELS } from '../settings/settingsUtils';

const ClaudeLogo = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fillRule="nonzero"/>
  </svg>
);

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

const MODEL_OPTIONS_FALLBACK = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7', supportsThinking: true },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', supportsThinking: true },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', supportsThinking: true },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', supportsThinking: false },
];

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve({ base64, mediaType: file.type, name: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ChatInput = forwardRef(function ChatInput({
  input,
  setInput,
  images,
  setImages,
  isStreaming,
  hasProvider,
  modelLabel,
  modelKey,
  modelOptions,
  showModelDropdown,
  setShowModelDropdown,
  onSend,
  onStop,
  onModelSwitch,
  modelSwitcherRef,
  thinkingLevel,
  onThinkingLevelChange,
  queueSize = 0,
  queuedMessages = [],
  onRemoveQueued,
  onClearQueue,
}, inputRef) {
  const MODEL_OPTIONS = modelOptions || MODEL_OPTIONS_FALLBACK;
  const fileInputRef = useRef(null);
  const dropTargetRef = useRef(null);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [showThinkingDropdown, setShowThinkingDropdown] = useState(false);
  const thinkingSwitcherRef = useRef(null);

  const hasContent = input.trim() || (images && images.length > 0);

  const processFiles = useCallback(async (files) => {
    const validFiles = Array.from(files).filter(f => {
      if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) return false;
      if (f.size > MAX_IMAGE_SIZE) return false;
      return true;
    });
    if (validFiles.length === 0) return;

    const newImages = await Promise.all(validFiles.map(async (file) => {
      const { base64, mediaType, name } = await readFileAsBase64(file);
      const preview = URL.createObjectURL(file);
      return {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        base64,
        mediaType,
        preview,
      };
    }));

    setImages(prev => [...prev, ...newImages]);
  }, [setImages]);

  const handleRemoveImage = useCallback((id) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img?.preview) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
  }, [setImages]);

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

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.kind === 'file' && ACCEPTED_IMAGE_TYPES.includes(item.type)) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      processFiles(imageFiles);
    }
  }, [processFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropTargetRef.current) dropTargetRef.current.classList.add(styles.dragOver);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropTargetRef.current) dropTargetRef.current.classList.remove(styles.dragOver);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropTargetRef.current) dropTargetRef.current.classList.remove(styles.dragOver);
    if (e.dataTransfer?.files) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  // Close thinking dropdown on outside click
  useEffect(() => {
    if (!showThinkingDropdown) return;
    const handler = (e) => {
      if (thinkingSwitcherRef.current && !thinkingSwitcherRef.current.contains(e.target)) {
        setShowThinkingDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showThinkingDropdown]);

  const currentModel = MODEL_OPTIONS.find(o => o.id === modelKey) || MODEL_OPTIONS[1] || MODEL_OPTIONS[0];

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = ''; // reset so same file can be picked again
    }
  };

  return (
    <div className={styles.inputArea}>
      {queueSize > 0 && (
        <div className={styles.queueStrip}>
          <div className={styles.queueStripHeader}>
            <span className={styles.queueStripLabel}>{queueSize} queued</span>
            <button className={styles.queueClearBtn} onClick={onClearQueue} title="Clear queue">
              <FiX size={12} />
              <span>Clear</span>
            </button>
          </div>
          <div className={styles.queueStripItems}>
            {queuedMessages.map((qMsg, i) => (
              <div key={i} className={styles.queueStripItem}>
                <span className={styles.queueStripItemText}>{qMsg.content}</span>
                <button
                  className={styles.queueStripItemRemove}
                  onClick={() => onRemoveQueued(i)}
                  title="Remove from queue"
                >
                  <FiX size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        className={styles.inputWrapper}
        ref={dropTargetRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Image preview strip */}
        {images && images.length > 0 && (
          <div className={styles.imagePreviewStrip}>
            {images.map(img => (
              <div key={img.id} className={styles.imagePreview} onClick={() => setPreviewIndex(images.indexOf(img))}>
                <img src={img.preview} alt={img.name} className={styles.imagePreviewImg} />
                <button
                  className={styles.imageRemoveBtn}
                  onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }}
                  title="Remove image"
                >
                  <FiX size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          className={styles.input}
          placeholder={hasProvider === false ? 'Connect a provider to start...' : isStreaming ? 'Queue a message...' : 'Message Sage...'}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
          disabled={hasProvider === false}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div className={styles.inputToolbar}>
          <div className={styles.toolbarLeft}>
            <div className={styles.combinedSwitcher} ref={modelSwitcherRef}>
              <div className={styles.combinedPill}>
                <button
                  className={styles.combinedPillSection}
                  onClick={() => { setShowModelDropdown(v => !v); setShowThinkingDropdown(false); }}
                >
                  <ClaudeLogo size={16} />
                  <span>{(MODEL_OPTIONS.find(o => o.id === modelKey) || MODEL_OPTIONS[1] || MODEL_OPTIONS[0]).label}</span>
                  <FiChevronDown
                    size={10}
                    className={`${styles.modelBadgeChevron} ${showModelDropdown ? styles.modelBadgeChevronOpen : ''}`}
                  />
                </button>
                {currentModel.supportsThinking && (
                  <>
                    <span className={styles.combinedPillDivider} />
                    <button
                      className={styles.combinedPillSection}
                      onClick={() => { setShowThinkingDropdown(v => !v); setShowModelDropdown(false); }}
                      ref={thinkingSwitcherRef}
                    >
                      <LuBrainCircuit size={14} />
                      <span>{THINKING_LEVELS.find(t => t.key === thinkingLevel)?.label || 'Medium'}</span>
                      <FiChevronDown
                        size={10}
                        className={`${styles.modelBadgeChevron} ${showThinkingDropdown ? styles.modelBadgeChevronOpen : ''}`}
                      />
                    </button>
                  </>
                )}
              </div>
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
                        key={opt.id}
                        className={`${styles.modelOption} ${modelKey === opt.id ? styles.modelOptionActive : ''}`}
                        onClick={() => onModelSwitch(opt.id)}
                      >
                        <ClaudeLogo size={14} />
                        <span className={styles.modelOptionLabel}>{opt.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {showThinkingDropdown && (
                  <motion.div
                    className={styles.modelDropdown}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                  >
                    {THINKING_LEVELS.map(opt => (
                      <button
                        key={opt.key}
                        className={`${styles.modelOption} ${thinkingLevel === opt.key ? styles.modelOptionActive : ''}`}
                        onClick={() => { onThinkingLevelChange(opt.key); setShowThinkingDropdown(false); }}
                      >
                        <span className={styles.modelOptionLabel}>{opt.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className={styles.toolbarRight}>
            <button
              className={styles.attachBtn}
              onClick={handleAttachClick}
              title="Attach images"
              disabled={hasProvider === false}
            >
              <FiPaperclip size={14} />
            </button>
            {isStreaming && (
              <button className={styles.stopBtn} onClick={onStop} title="Stop generating">
                <FiSquare size={12} />
              </button>
            )}
            <div className={styles.sendBtnWrapper}>
              <button
                className={`${styles.sendBtn} ${hasContent ? styles.sendBtnActive : ''}`}
                onClick={onSend}
                disabled={!hasContent || hasProvider === false}
                title={isStreaming ? 'Queue message' : 'Send message'}
              >
                <SendIcon size={30} active={!!hasContent} />
              </button>
              {queueSize > 0 && (
                <span className={styles.queueBadge}>{queueSize}</span>
              )}
            </div>
          </div>
        </div>
      </div>
      {previewIndex !== null && images && images.length > 0 && (
        <MediaPreview
          images={images}
          currentIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}
    </div>
  );
});

export default ChatInput;
