import { createHash } from 'crypto';

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function parsePositiveInt(value, fallback, { min = 1, max = 200 } = {}) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return clamp(n, min, max);
}

export function safeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function safeArray(value) {
  return Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
    : [];
}

export function wordCount(text) {
  return safeString(text)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

export function hashText(input) {
  return createHash('sha1').update(safeString(input)).digest('hex');
}
