/* ── Git Utility Functions & Constants ── */

export const COMMITS_PAGE_SIZE = 15;
export const GRAPH_COLORS = ['#F97316', '#FB923C', '#FDBA74', '#D97706', '#EA580C', '#C2410C'];

export function buildGraph(commits) {
  const lanes = [];
  const rows = [];

  for (const commit of commits) {
    let lane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.hash) { lane = i; break; }
    }
    if (lane === -1) {
      const empty = lanes.indexOf(null);
      lane = empty !== -1 ? empty : lanes.length;
      if (empty !== -1) lanes[empty] = commit.hash;
      else lanes.push(commit.hash);
    }

    const parentLanes = [];
    for (let pi = 0; pi < commit.parents.length; pi++) {
      const parentHash = commit.parents[pi];
      if (pi === 0) {
        lanes[lane] = parentHash;
        parentLanes.push(lane);
      } else {
        let pLane = lanes.indexOf(parentHash);
        if (pLane === -1) {
          const empty = lanes.indexOf(null);
          pLane = empty !== -1 ? empty : lanes.length;
          if (empty !== -1) lanes[empty] = parentHash;
          else lanes.push(parentHash);
        }
        lanes[pLane] = parentHash;
        parentLanes.push(pLane);
      }
    }

    if (commit.parents.length === 0) lanes[lane] = null;
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

    rows.push({
      ...commit,
      lane,
      parentLanes,
      activeLanes: [...lanes],
      totalLanes: Math.max(lanes.length, 1),
    });
  }

  return rows;
}

export function parseRefs(refsStr) {
  if (!refsStr) return { branches: [], tags: [], isHead: false };
  const parts = refsStr.split(',').map(s => s.trim()).filter(Boolean);
  const branches = [];
  const tags = [];
  let isHead = false;

  for (const part of parts) {
    if (part === 'HEAD') {
      isHead = true;
    } else if (part.startsWith('HEAD -> ')) {
      isHead = true;
      branches.push(part.replace('HEAD -> ', ''));
    } else if (part.startsWith('tag: ')) {
      tags.push(part.replace('tag: ', ''));
    } else if (part.startsWith('origin/')) {
      // skip remote-only refs if local already shown
      if (!branches.includes(part.replace('origin/', ''))) {
        branches.push(part);
      }
    } else {
      branches.push(part);
    }
  }
  return { branches, tags, isHead };
}

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#61AFEF', '#C678DD', '#98C379', '#E5C07B', '#E06C75', '#56B6C2', '#D19A66', '#BE5046'];
  return colors[Math.abs(hash) % colors.length];
}

export function formatFullDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return isoDate; }
}

export function statusColor(s) {
  const map = {
    'M': '#E5C07B',  // Modified — yellow
    'A': '#98C379',  // Added — green
    'D': '#E06C75',  // Deleted — red
    'U': '#73C991',  // Untracked — green (VS Code style)
    'R': '#C678DD',  // Renamed — purple
    'C': '#C678DD',  // Copied — purple
    'T': '#E5C07B',  // Type changed — yellow
    '!': 'var(--zinc-500)', // Ignored
  };
  return map[s] || 'var(--zinc-400)';
}
