// backend/memory.js
// Simple in-memory memory store for prototyping

const memoryStore = [];

export function addMemory(item) {
  memoryStore.push({ item, ts: Date.now() });
}

export function getAllMemory() {
  return memoryStore.slice();
}
