// ---- UUID Generator ---- //
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---- Message serialization helpers ---- //
export function messageToStored(msg, threadId) {
  const now = Date.now();
  return {
    id: msg.id,
    threadId: threadId,
    role: msg.role,
    createdAt: msg.createdAt || now,
    updatedAt: now,
    data: JSON.stringify(msg),
  };
}

export function storedToMessage(stored) {
  try {
    return JSON.parse(stored.data);
  } catch {
    return null;
  }
}
