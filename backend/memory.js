// backend/memory.js
// Simple in-memory memory store for prototyping

const memoryStore = [];

function addMemory(item) {
  memoryStore.push({ item, ts: Date.now() });
}

function getAllMemory() {
  return memoryStore.slice();
}

module.exports = { addMemory, getAllMemory };
