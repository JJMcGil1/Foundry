import React, { forwardRef, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCpu, FiChevronDown, FiCheck, FiSquare, FiPaperclip, FiX } from 'react-icons/fi';
import styles from './ChatInput.module.css';
import MediaPreview from './MediaPreview';

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
  showModelDropdown,
  setShowModelDropdown,
  onSend,
  onStop,
  onModelSwitch,
  modelSwitcherRef,
  queueSize = 0,
  queuedMessages = [],
  onRemoveQueued,
  onClearQueue,
}, inputRef) {
  const fileInputRef = useRef(null);
  const dropTargetRef = useRef(null);
  const [previewIndex, setPreviewIndex] = useState(null);

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
