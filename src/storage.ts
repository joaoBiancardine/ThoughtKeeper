import type { Note, StoredData } from './types';

const STORAGE_KEY = 'thoughtkeeper.notes';

function isNote(value: unknown): value is Note {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    typeof n.title === 'string' &&
    typeof n.body === 'string' &&
    typeof n.createdAt === 'number' &&
    typeof n.updatedAt === 'number'
  );
}

export function loadNotes(): Note[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('Stored data was not valid JSON. Starting empty.');
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null) return [];
  const data = parsed as Record<string, unknown>;

  if (data.version !== 1) return [];
  if (!Array.isArray(data.notes)) return [];

  return data.notes.filter(isNote);
}

export function saveNotes(notes: Note[]): void {
  const data: StoredData = { version: 1, notes };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save notes.', err);
  }
}