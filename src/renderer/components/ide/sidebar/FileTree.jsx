import React, { memo } from 'react';
import { FiChevronRight } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import FileIcon from '../FileIcon';
import styles from '../Sidebar.module.css';

const INDENT_SIZE = 14;
const TREE_BASE_PAD = 10;

const IndentGuides = memo(function IndentGuides({ depth }) {
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
});

function FileTreeItem({ item, depth = 0, onOpenFile, activeFile, parentDimmed = false, expandedPaths, onToggleExpand }) {
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

// Custom comparator so a FileTreeItem only re-renders when something that
// actually affects ITS output changes. Without this, any change to
// expandedPaths (a new Set created on every toggle) invalidates the shallow
// prop check and every node in the tree re-renders.
function areEqual(prev, next) {
  if (prev.item !== next.item) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.parentDimmed !== next.parentDimmed) return false;
  if (prev.onOpenFile !== next.onOpenFile) return false;
  if (prev.onToggleExpand !== next.onToggleExpand) return false;

  // activeFile affects this node only if it matches this file now or did before
  if (prev.activeFile !== next.activeFile) {
    if (prev.item.path === prev.activeFile || prev.item.path === next.activeFile) return false;
  }

  // expandedPaths affects this node only if its own expanded state flipped.
  // For directories we rely on AnimatePresence/child recursion; child nodes
  // still receive the same expandedPaths reference and re-render if their
  // own bit flipped. For files, expansion state is irrelevant.
  if (prev.expandedPaths !== next.expandedPaths) {
    if (prev.item.type === 'directory') {
      const wasOpen = prev.expandedPaths.has(prev.item.path);
      const isOpen = next.expandedPaths.has(prev.item.path);
      if (wasOpen !== isOpen) return false;
      // Still need to forward updates to descendants when open, so if any
      // descendant path's state changed we must re-render to let children
      // receive the new set reference.
      if (isOpen) return false;
    }
  }
  return true;
}

export default memo(FileTreeItem, areEqual);
