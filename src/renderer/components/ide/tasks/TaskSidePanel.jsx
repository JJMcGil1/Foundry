import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { FiX, FiImage, FiBold, FiItalic, FiList, FiCode, FiCheck } from 'react-icons/fi';
import { PRIORITIES, COLORS } from './constants';
import styles from '../TasksPage.module.css';

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: '#34d399' },
  medium: { label: 'Medium', color: '#fbbf24' },
  high: { label: 'High', color: '#f87171' },
  urgent: { label: 'Urgent', color: '#f43f5e' },
};

function EditorToolbar({ editor }) {
  if (!editor) return null;

  const addImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        editor.chain().focus().setImage({ src: ev.target.result }).run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor]);

  return (
    <div className={styles.editorToolbar}>
      <button
        className={`${styles.toolbarBtn} ${editor.isActive('bold') ? styles.toolbarBtnActive : ''}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <FiBold size={14} />
      </button>
      <button
        className={`${styles.toolbarBtn} ${editor.isActive('italic') ? styles.toolbarBtnActive : ''}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <FiItalic size={14} />
      </button>
      <button
        className={`${styles.toolbarBtn} ${editor.isActive('bulletList') ? styles.toolbarBtnActive : ''}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <FiList size={14} />
      </button>
      <button
        className={`${styles.toolbarBtn} ${editor.isActive('codeBlock') ? styles.toolbarBtnActive : ''}`}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code block"
      >
        <FiCode size={14} />
      </button>
      <div className={styles.toolbarDivider} />
      <button className={styles.toolbarBtn} onClick={addImage} title="Add image">
        <FiImage size={14} />
      </button>
    </div>
  );
}

export default function TaskSidePanel({
  task,
  columns,
  onSave,
  onClose,
  isNew,
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [color, setColor] = useState(null);
  const [status, setStatus] = useState('');
  const titleRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: styles.tiptapEditor,
      },
    },
  });

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setPriority(task.priority || 'medium');
      setColor(task.color || null);
      setStatus(task.status || (columns[0]?.id || ''));
      if (editor) {
        editor.commands.setContent(task.description || '');
      }
    } else {
      setTitle('');
      setPriority('medium');
      setColor(null);
      setStatus(columns[0]?.id || '');
      if (editor) {
        editor.commands.setContent('');
      }
    }
  }, [task, columns, editor]);

  useEffect(() => {
    if (isNew && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [isNew]);

  const handleSave = () => {
    if (!title.trim()) return;
    const description = editor ? editor.getHTML() : '';
    onSave({
      title: title.trim(),
      description: description === '<p></p>' ? null : description,
      priority,
      color,
      status,
    });
  };

  return (
    <div className={styles.sidePanel}>
      <div className={styles.sidePanelHeader}>
        <span className={styles.sidePanelTitle}>
          {isNew ? 'New Task' : 'Edit Task'}
        </span>
        <button className={styles.sidePanelClose} onClick={onClose}>
          <FiX size={16} />
        </button>
      </div>

      <div className={styles.sidePanelBody}>
        {/* Title */}
        <div className={styles.panelSection}>
          <input
            ref={titleRef}
            className={styles.panelTitleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleSave(); }}
          />
        </div>

        {/* Description Editor */}
        <div className={styles.panelSection}>
          <label className={styles.panelLabel}>Description</label>
          <EditorToolbar editor={editor} />
          <div className={styles.editorWrapper}>
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Status & Priority side by side */}
        <div className={styles.panelRow}>
          <div className={styles.panelSection} style={{ flex: 1 }}>
            <label className={styles.panelLabel}>Status</label>
            <div className={styles.statusPicker}>
              {columns.map(c => (
                <button
                  key={c.id}
                  className={`${styles.statusOption} ${status === c.id ? styles.statusOptionActive : ''}`}
                  onClick={() => setStatus(c.id)}
                  style={status === c.id ? { borderColor: c.color, background: `${c.color}15` } : {}}
                >
                  <span className={styles.statusDot} style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.panelSection}>
          <label className={styles.panelLabel}>Priority</label>
          <div className={styles.priorityPicker}>
            {PRIORITIES.map(p => {
              const cfg = PRIORITY_CONFIG[p];
              const isActive = priority === p;
              return (
                <button
                  key={p}
                  className={`${styles.priorityOption} ${isActive ? styles.priorityOptionActive : ''}`}
                  onClick={() => setPriority(p)}
                  style={isActive ? { borderColor: cfg.color, background: `${cfg.color}15` } : {}}
                >
                  <span className={styles.priorityDotLg} style={{ background: cfg.color }} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Label */}
        <div className={styles.panelSection}>
          <label className={styles.panelLabel}>Color Label</label>
          <div className={styles.colorPicker}>
            <button
              className={`${styles.colorSwatch} ${styles.colorSwatchNone} ${color === null ? styles.colorSwatchActive : ''}`}
              onClick={() => setColor(null)}
              title="No color"
            >
              <FiX size={10} />
            </button>
            {COLORS.map(c => (
              <button
                key={c}
                className={`${styles.colorSwatch} ${color === c ? styles.colorSwatchActive : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              >
                {color === c && <FiCheck size={10} style={{ color: '#fff' }} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.sidePanelFooter}>
        <button className={styles.panelCancelBtn} onClick={onClose}>Cancel</button>
        <button className={styles.panelSaveBtn} onClick={handleSave}>
          <FiCheck size={14} />
          {isNew ? 'Create Task' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
