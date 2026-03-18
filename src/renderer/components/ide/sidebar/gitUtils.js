/* ── Git Utility Functions & Constants ── */

export const COMMITS_PAGE_SIZE = 15;
export const GRAPH_COLORS = ['#F97316', '#3B82F6', '#A855F7', '#10B981', '#EF4444', '#F59E0B', '#EC4899', '#06B6D4'];

export function buildGraph(commits) {
  // lanes[i] = hash of the commit expected to arrive in lane i (or null if free)
  const lanes = [];
  const rows = [];

  // Helper: find the closest null lane to `target`, or append
  const closestFreeLane = (target) => {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === null) {
        const d = Math.abs(i - target);
        if (d < bestDist) { bestDist = d; best = i; }
      }
    }
    return best;
  };

  for (const commit of commits) {
    // 1. Find ALL lanes that expect this commit
    const matchingLanes = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.hash) matchingLanes.push(i);
    }

    let lane;
    let mergingFromLanes = []; // other lanes that also expected this commit (converge here)

    if (matchingLanes.length > 0) {
      lane = matchingLanes[0]; // take the leftmost
      // All other matching lanes are "merging in" — free them
      mergingFromLanes = matchingLanes.slice(1);
      for (const ml of mergingFromLanes) {
        lanes[ml] = null;
      }
    } else {
      // Not expected — allocate new lane (closest to lane 0)
      const empty = closestFreeLane(0);
      lane = empty !== -1 ? empty : lanes.length;
      if (empty !== -1) lanes[empty] = commit.hash;
      else lanes.push(commit.hash);
    }

    // 2. Assign parent lanes
    const parentLanes = [];
    const newMergeLanes = []; // lanes freshly allocated for merge parents
    // Track lanes just freed by merging so we don't reuse them for new parents
    const justFreed = new Set(mergingFromLanes);

    for (let pi = 0; pi < commit.parents.length; pi++) {
      const parentHash = commit.parents[pi];
      if (pi === 0) {
        // First parent: check if it already has a lane somewhere
        let existing = -1;
        for (let i = 0; i < lanes.length; i++) {
          if (i !== lane && lanes[i] === parentHash) { existing = i; break; }
        }
        if (existing !== -1) {
          // Parent already expected in another lane — our lane becomes free
          lanes[lane] = null;
          parentLanes.push(existing);
        } else {
          lanes[lane] = parentHash;
          parentLanes.push(lane);
        }
      } else {
        // Merge parent — check if already expected somewhere
        let pLane = -1;
        for (let i = 0; i < lanes.length; i++) {
          if (lanes[i] === parentHash) { pLane = i; break; }
        }
        if (pLane === -1) {
          // Allocate closest free lane, but skip lanes that just merged in
          // so the graph doesn't look like the merged branch continues through
          let empty = -1;
          let bestDist = Infinity;
          for (let i = 0; i < lanes.length; i++) {
            if (lanes[i] === null && !justFreed.has(i)) {
              const d = Math.abs(i - lane);
              if (d < bestDist) { bestDist = d; empty = i; }
            }
          }
          pLane = empty !== -1 ? empty : lanes.length;
          if (empty !== -1) lanes[empty] = parentHash;
          else lanes.push(parentHash);
          newMergeLanes.push(pLane);
        }
        parentLanes.push(pLane);
      }
    }

    // 3. Root commits free their lane
    if (commit.parents.length === 0) lanes[lane] = null;

    // 4. Trim trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

    rows.push({
      ...commit,
      lane,
      parentLanes,
      activeLanes: [...lanes],
      mergingFromLanes,  // lanes that converged INTO this commit (from above)
      newMergeLanes,     // lanes freshly created for merge parents (going below)
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
