import React, { useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';
import styles from './CodeBlock.module.css';

export default function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{language}</span>
        <button className={styles.copyBtn} onClick={handleCopy} title="Copy code">
          {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
        </button>
      </div>
      <pre className={styles.codePre}><code>{code}</code></pre>
    </div>
  );
}
