import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { FiX, FiImage, FiBold, FiItalic, FiList, FiCode } from 'react-icons/fi';
import { PRIORITIES, COLORS } from './constants';
import { priorityClass } from './utils';
import styles from '../TasksPage.module.css';

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
      titleRef.current.focus();
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
        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Title</label>
          <input
            ref={titleRef}
            className={styles.modalInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleSave(); }}
          />
        </div>

        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Description</label>
          <EditorToolbar editor={editor} />
          <div className={styles.editorWrapper}>
            <EditorContent editor={editor} />
          </div>
        </div>

        <div className={styles.modalRow}>
          <div className={styles.modalField} style={{ flex: 1 }}>
            <label className={styles.modalLabel}>Status</label>
            <select
              className={styles.modalSelect}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {columns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.modalField} style={{ flex: 1 }}>
            <label className={styles.modalLabel}>Priority</label>
            <select
              className={styles.modalSelect}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITIES.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.modalField}>
          <label className={styles.modalLabel}>Color Label</label>
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
              />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.sidePanelFooter}>
        <button className={styles.modalCancelBtn} onClick={onClose}>Cancel</button>
        <button className={styles.modalSaveBtn} onClick={handleSave}>
          {isNew ? 'Create Task' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
