import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiEdit2, FiDownload, FiTerminal, FiSearch, FiTool, FiGlobe } from 'react-icons/fi';
import { FaEye } from 'react-icons/fa';
import BashToolBlock from './BashToolBlock';
import EditToolBlock from './EditToolBlock';
import WriteToolBlock from './WriteToolBlock';
import styles from './ToolUseBlock.module.css';
import sharedStyles from './shared.module.css';

const TOOL_META = {
  Edit:     { icon: FiEdit2,    label: 'Edit' },
  Write:    { icon: FiDownload, label: 'Write' },
  Read:     { icon: FaEye,      label: 'Read' },
  Bash:     { icon: FiTerminal, label: 'Bash' },
  Grep:     { icon: FiSearch,   label: 'Search' },
  Glob:     { icon: FiSearch,   label: 'Glob' },
  WebFetch: { icon: FiGlobe,    label: 'Fetch' },
};

function extractToolContext(name, input) {
  if (!input) return null;
  const data = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return null; } })() : input;
  if (!data) return null;

  if (data.file_path) {
    const parts = data.file_path.split('/');
    return parts[parts.length - 1];
  }
  if (data.command) {
    const cmd = data.command.length > 50 ? data.command.slice(0, 47) + '...' : data.command;
    return cmd;
  }
  if (data.pattern) {
    return data.pattern;
  }
  if (data.description) {
    const desc = data.description.length > 50 ? data.description.slice(0, 47) + '...' : data.description;
    return desc;
  }
  return null;
}

export default function ToolUseBlock({ name, input, isStreaming }) {
  // Bash gets its own terminal UI
  if (name === 'Bash') {
    return <BashToolBlock input={input} isStreaming={isStreaming} />;
  }
  // Edit gets a diff view
  if (name === 'Edit') {
    return <EditToolBlock input={input} isStreaming={isStreaming} />;
  }
  // Write gets a code file view
  if (name === 'Write') {
    return <WriteToolBlock input={input} isStreaming={isStreaming} />;
  }

  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[name] || { icon: FiTool, label: name || 'Tool call' };
  const IconComponent = meta.icon;
  const context = useMemo(() => extractToolContext(name, input), [name, input]);

  return (
    <div className={styles.toolBlock}>
      <button
        className={styles.toolToggle}
        onClick={() => setExpanded(!expanded)}
      >
        <IconComponent size={14} className={styles.toolIcon} />
        <span className={styles.toolName}>{meta.label}</span>
        {context && (
          <span className={styles.toolContext}>{context}</span>
        )}
        {isStreaming && (
          <span className={sharedStyles.pulseDots}>
            <span className={sharedStyles.pulseDot} />
            <span className={sharedStyles.pulseDot} />
            <span className={sharedStyles.pulseDot} />
          </span>
        )}
      </button>
      <AnimatePresence>
        {expanded && input && (
          <motion.div
            className={styles.toolContent}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <pre className={styles.toolInput}>
              {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
