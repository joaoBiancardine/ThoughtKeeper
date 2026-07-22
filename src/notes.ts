import type { Note } from './types';

export function newNote(): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '',
    body: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function updateNote(
  notes: Note[],
  id: string,
  patch: Partial<Pick<Note, 'title' | 'body'>>,
): Note[] {
  return notes.map((note) =>
    note.id === id ? { ...note, ...patch, updatedAt: Date.now() } : note,
  );
}

export function deleteNote(notes: Note[], id: string): Note[] {
  return notes.filter((note) => note.id !== id);
}

export function sortByUpdated(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

const DAY_MS = 86_400_000;

/** Sidebar bucket for a timestamp, relative to the local start of today. */
export function dateGroupLabel(timestamp: number, now = Date.now()): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return 'Today';
  if (timestamp >= startOfToday - DAY_MS) return 'Yesterday';
  if (timestamp >= startOfToday - 7 * DAY_MS) return 'Previous 7 days';
  return 'Earlier';
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}