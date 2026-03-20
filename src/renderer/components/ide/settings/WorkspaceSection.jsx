import React, { useState, useEffect } from 'react';
import { FiFolder, FiTerminal, FiCheck } from 'react-icons/fi';
import { VscPlay } from 'react-icons/vsc';
import styles from '../SettingsPage.module.css';

export default function WorkspaceSection({ projectPath }) {
  const [startCommand, setStartCommand] = useState('');
  const [originalCommand, setOriginalCommand] = useState('');
  const [saved, setSaved] = useState(false);

  const isDirty = startCommand !== originalCommand;

  // Load saved command when project changes
  useEffect(() => {
    if (!projectPath) return;
    window.foundry?.getSetting(`start_command_${projectPath}`).then((cmd) => {
      const val = cmd || '';
      setStartCommand(val);
      setOriginalCommand(val);
    }).catch(() => {});
    setSaved(false);
  }, [projectPath]);

  const handleSave = async () => {
    if (!projectPath || !isDirty) return;
    await window.foundry?.setSetting(`start_command_${projectPath}`, startCommand.trim());
    setOriginalCommand(startCommand.trim());
    setStartCommand(startCommand.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isDirty) handleSave();
  };

  const workspaceName = projectPath
    ? (projectPath.split('/').pop() || projectPath.split('\\').pop() || projectPath)
    : null;

  if (!projectPath) {
    return (
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Workspace</h3>
        <p className={styles.sectionDesc}>Open a project to configure workspace settings.</p>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Workspace</h3>
      <p className={styles.sectionDesc}>
        Settings for <strong>{workspaceName}</strong>
      </p>

      <div className={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <FiFolder size={18} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--zinc-100)', lineHeight: 1.3 }}>
              {workspaceName}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--zinc-500)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3,
            }}>
              {projectPath}
            </div>
          </div>
        </div>

        <div style={{
          height: 1, background: 'var(--border)', margin: '0 -20px 16px',
        }} />

        <label className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <VscPlay size={12} />
          Start Command
        </label>
        <p className={styles.fieldHint} style={{ marginBottom: 10 }}>
          Runs when you click the start button in the titlebar. The process runs in a terminal tab in the background.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', position: 'relative',
          }}>
            <FiTerminal size={13} style={{
              position: 'absolute', left: 12, color: 'var(--zinc-500)', pointerEvents: 'none',
            }} />
            <input
              className={styles.input}
              type="text"
              value={startCommand}
              onChange={(e) => { setStartCommand(e.target.value); setSaved(false); }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. npm run dev"
              spellCheck={false}
              style={{ paddingLeft: 34, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
          <button
            className={`${styles.saveBtn} ${isDirty ? styles.saveBtnActive : ''}`}
            onClick={handleSave}
            disabled={!isDirty && !saved}
          >
            {saved ? (
              <>
                <FiCheck size={14} />
                Saved
              </>
            ) : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
