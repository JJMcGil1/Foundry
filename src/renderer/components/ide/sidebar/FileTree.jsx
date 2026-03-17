import React from 'react';
import { FiChevronRight } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import FileIcon from '../FileIcon';
import styles from '../Sidebar.module.css';

const INDENT_SIZE = 14;
const TREE_BASE_PAD = 10;

function IndentGuides({ depth }) {
  if (depth <= 0) return null;
  const guides = [];
  for (let i = 0; i < depth; i++) {
    guides.push(
      <span
        key={i}
        className={styles.indentGuide}
        style={{ left: TREE_BASE_PAD + i * INDENT_SIZE + 7 }}
      />
    );
  }
  return guides;
}

export default function FileTreeItem({ item, depth = 0, onOpenFile, activeFile, parentDimmed = false, expandedPaths, onToggleExpand }) {
  const expanded = expandedPaths.has(item.path);
  const dimmed = parentDimmed || item.ignored;
  const indent = TREE_BASE_PAD + depth * INDENT_SIZE;

  if (item.type === 'directory') {
    return (
      <div>
        <button
          className={`${styles.treeItem} ${dimmed ? styles.treeItemDimmed : ''}`}
          style={{ paddingLeft: indent }}
          onClick={() => onToggleExpand(item.path)}
        >
          <IndentGuides depth={depth} />
          <motion.span
            className={styles.chevron}
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <FiChevronRight size={14} />
          </motion.span>
          <span className={styles.treeName}>{item.name}</span>
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {item.children?.map(child => (
                <FileTreeItem
                  key={child.path}
                  item={child}
                  depth={depth + 1}
                  onOpenFile={onOpenFile}
                  activeFile={activeFile}
                  parentDimmed={dimmed}
                  expandedPaths={expandedPaths}
                  onToggleExpand={onToggleExpand}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const isActive = activeFile === item.path;

  return (
    <button
      className={`${styles.treeItem} ${styles.treeFile} ${isActive ? styles.treeItemActive : ''} ${dimmed ? styles.treeItemDimmed : ''}`}
      style={{ paddingLeft: indent + 10 }}
      onClick={() => onOpenFile(item.path)}
    >
      <IndentGuides depth={depth} />
      <FileIcon name={item.name} type="file" size={16} />
      <span className={styles.treeName}>{item.name}</span>
    </button>
  );
}
