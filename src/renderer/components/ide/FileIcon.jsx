import { getIconForFile, getIconForFolder, getIconForOpenFolder } from 'vscode-icons-js';

/* ── Eagerly import all icon SVGs via Vite glob ── */
const iconModules = import.meta.glob('../../assets/file-icons/*.svg', { eager: true, query: '?url', import: 'default' });

// Build a lookup: "file_type_reactts.svg" → resolved URL
const iconMap = {};
for (const [path, url] of Object.entries(iconModules)) {
  const filename = path.split('/').pop();
  iconMap[filename] = url;
}

/**
 * Returns the resolved icon URL for a given file or folder name.
 * @param {string} name - File or folder name (e.g. "index.tsx", "src")
 * @param {'file'|'folder'} type - Whether it's a file or folder
 * @param {boolean} isOpen - For folders, whether it's expanded
 * @returns {string|null} URL to the icon SVG
 */
export function getFileIconUrl(name, type = 'file', isOpen = false) {
  let iconName;
  if (type === 'folder') {
    iconName = isOpen ? getIconForOpenFolder(name) : getIconForFolder(name);
  } else {
    iconName = getIconForFile(name);
  }
  const fallback = type === 'folder' ? 'default_folder.svg' : 'default_file.svg';
  return iconMap[iconName] || iconMap[fallback] || null;
}

/**
 * FileIcon component — renders a VS Code-style file/folder icon.
 */
export default function FileIcon({ name, type = 'file', isOpen = false, size = 16, style, className }) {
  const url = getFileIconUrl(name, type, isOpen);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ flexShrink: 0, ...style }}
      className={className}
      draggable={false}
    />
  );
}
