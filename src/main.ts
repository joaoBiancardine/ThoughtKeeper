import './style.css';
import type { Note } from './types';
import { loadNotes, saveNotes } from './storage';
import {
  newNote,
  updateNote,
  deleteNote,
  sortByUpdated,
  dateGroupLabel,
  countWords,
} from './notes';

const SAVE_DELAY_MS = 300;
const PREVIEW_LENGTH = 60;
const UNDO_WINDOW_MS = 6000;

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

const listEl = must<HTMLUListElement>('#note-list');
const editorEl = must<HTMLElement>('#editor');
const emptyEl = must<HTMLElement>('#empty-state');
const titleEl = must<HTMLInputElement>('#note-title');
const bodyEl = must<HTMLTextAreaElement>('#note-body');
const newBtn = must<HTMLButtonElement>('#new-note');
const clearAllBtn = must<HTMLButtonElement>('#clear-all');
const wordCountEl = must<HTMLElement>('#word-count');
const exitFocusBtn = must<HTMLButtonElement>('#exit-focus');
const toastEl = must<HTMLElement>('#toast');
const toastMessageEl = must<HTMLElement>('#toast-message');
const toastUndoBtn = must<HTMLButtonElement>('#toast-undo');

let notes: Note[] = loadNotes();
let selectedId: string | null = null;

/** The note id currently loaded into the editor fields. */
let editorNoteId: string | null = null;

/**
 * Note ids in display order. Held separately from `notes` so that editing a
 * note doesn't reshuffle the list under the cursor; `reorder()` re-settles it
 * at moments where a jump is expected (load, create, delete, selection change).
 */
let order: string[] = [];

/**
 * Date-bucket label per note id, snapshotted alongside `order`. Recomputing it
 * live would move a note from "Yesterday" to "Today" on its first keystroke.
 */
let groupLabels = new Map<string, string>();

let saveTimer: number | undefined;

/**
 * Everything needed to put the app back the way it was before a delete.
 * Safe to hold by reference: `notes` and `order` are replaced, never mutated.
 */
type Snapshot = {
  notes: Note[];
  order: string[];
  selectedId: string | null;
};

let undoSnapshot: Snapshot | null = null;
let toastTimer: number | undefined;

function selected(): Note | undefined {
  return notes.find((note) => note.id === selectedId);
}

/* Saving */

function flushSave(): void {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  saveNotes(notes);
}

function scheduleSave(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSave, SAVE_DELAY_MS);
}

/** Debounced commit, for keystroke-rate changes. */
function commit(): void {
  scheduleSave();
  render();
}

/** Immediate commit, for structural changes worth persisting at once. */
function commitNow(): void {
  flushSave();
  render();
}

/* Ordering */

function reorder(): void {
  const now = Date.now();
  order = sortByUpdated(notes).map((note) => note.id);
  groupLabels = new Map(
    notes.map((note) => [note.id, dateGroupLabel(note.updatedAt, now)]),
  );
}

/** Notes in display order; anything not yet in `order` surfaces at the top. */
function orderedNotes(): Note[] {
  const remaining = new Map(notes.map((note) => [note.id, note]));
  const known: Note[] = [];

  for (const id of order) {
    const note = remaining.get(id);
    if (note) {
      known.push(note);
      remaining.delete(id);
    }
  }

  return [...remaining.values(), ...known];
}

/* Undo toast */

function hideToast(): void {
  if (toastTimer !== undefined) {
    clearTimeout(toastTimer);
    toastTimer = undefined;
  }
  toastEl.hidden = true;
  undoSnapshot = null;
}

function showToast(message: string): void {
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastMessageEl.textContent = message;
  toastEl.hidden = false;
  toastTimer = window.setTimeout(hideToast, UNDO_WINDOW_MS);
}

function undoDelete(): void {
  if (!undoSnapshot) return;
  ({ notes, order, selectedId } = undoSnapshot);
  hideToast();
  commitNow();
}

/* Rendering */

function previewOf(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  if (text === '') return 'No additional text';
  return text.length > PREVIEW_LENGTH
    ? `${text.slice(0, PREVIEW_LENGTH)}…`
    : text;
}

function noteItem(note: Note): HTMLLIElement {
  const label = note.title.trim() || 'Untitled';

  const li = document.createElement('li');
  li.className = 'note-item';
  li.dataset.id = note.id;
  li.setAttribute('aria-current', String(note.id === selectedId));

  const title = document.createElement('div');
  title.className = 'note-item-title';
  title.textContent = label;

  const preview = document.createElement('div');
  preview.className = 'note-item-preview';
  preview.textContent = previewOf(note.body);

  const main = document.createElement('div');
  main.className = 'note-item-main';
  main.append(title, preview);

  const remove = document.createElement('button');
  remove.className = 'note-delete';
  remove.type = 'button';
  remove.textContent = '×';
  remove.title = 'Delete note';
  remove.setAttribute('aria-label', `Delete ${label}`);

  li.append(main, remove);
  return li;
}

function groupHeader(label: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'note-group';
  li.setAttribute('role', 'presentation');
  li.textContent = label;
  return li;
}

function render(): void {
  const items: HTMLLIElement[] = [];
  let lastLabel: string | null = null;

  for (const note of orderedNotes()) {
    const label = groupLabels.get(note.id) ?? dateGroupLabel(note.updatedAt);
    if (label !== lastLabel) {
      items.push(groupHeader(label));
      lastLabel = label;
    }
    items.push(noteItem(note));
  }

  listEl.replaceChildren(...items);
  clearAllBtn.hidden = notes.length === 0;

  /* No-op when already visible, so this is safe to run on every render. */
  listEl
    .querySelector<HTMLLIElement>('.note-item[aria-current="true"]')
    ?.scrollIntoView({ block: 'nearest' });

  const current = selected();
  editorEl.hidden = current === undefined;
  emptyEl.hidden = current !== undefined;

  const words = current ? countWords(current.body) : 0;
  wordCountEl.textContent = words === 0 ? '' : `${words} word${words === 1 ? '' : 's'}`;

  if (current && current.id !== editorNoteId) {
    titleEl.value = current.title;
    bodyEl.value = current.body;
    editorNoteId = current.id;
  }
  if (!current) {
    editorNoteId = null;
  }
}

/* Actions */

function createNote(): void {
  const note = newNote();
  notes = [note, ...notes];
  selectedId = note.id;
  reorder();
  commitNow();
  titleEl.focus();
}

function selectNote(id: string): void {
  if (id === selectedId) return;
  selectedId = id;
  reorder();
  render();
}

function removeNote(id: string): void {
  const note = notes.find((candidate) => candidate.id === id);
  if (!note) return;
  const label = note.title.trim() || 'Untitled';

  undoSnapshot = { notes, order: [...order], selectedId };

  notes = deleteNote(notes, id);
  if (selectedId === id) selectedId = null;
  reorder();
  commitNow();
  showToast(`Deleted “${label}”`);
}

function clearAllNotes(): void {
  const count = notes.length;
  if (count === 0) return;

  undoSnapshot = { notes, order: [...order], selectedId };

  notes = [];
  selectedId = null;
  reorder();
  commitNow();
  showToast(`Deleted ${count} note${count === 1 ? '' : 's'}`);
}

function setFocusMode(on: boolean): void {
  document.body.classList.toggle('focus-mode', on);
}

function toggleFocusMode(): void {
  setFocusMode(!document.body.classList.contains('focus-mode'));
}

/** Move the selection by `step` positions through the visible list order. */
function moveSelection(step: number): void {
  const ordered = orderedNotes();
  if (ordered.length === 0) return;

  const current = ordered.findIndex((note) => note.id === selectedId);
  const next = current === -1 ? 0 : current + step;
  const clamped = Math.min(Math.max(next, 0), ordered.length - 1);

  const target = ordered[clamped];
  if (target) selectNote(target.id);
}

/* Events */

listEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const id = target.closest<HTMLLIElement>('.note-item')?.dataset.id;
  if (!id) return;

  if (target.closest('.note-delete')) removeNote(id);
  else selectNote(id);
});

newBtn.addEventListener('click', createNote);

titleEl.addEventListener('input', () => {
  if (!selectedId) return;
  notes = updateNote(notes, selectedId, { title: titleEl.value });
  commit();
});

bodyEl.addEventListener('input', () => {
  if (!selectedId) return;
  notes = updateNote(notes, selectedId, { body: bodyEl.value });
  commit();
});

toastUndoBtn.addEventListener('click', undoDelete);
exitFocusBtn.addEventListener('click', () => setFocusMode(false));
clearAllBtn.addEventListener('click', clearAllNotes);

/* Keyboard shortcuts */

/** True while the caret is in the title or body, where letters are text. */
function isTyping(): boolean {
  return document.activeElement === titleEl || document.activeElement === bodyEl;
}

document.addEventListener('keydown', (event) => {
  const mod = event.metaKey || event.ctrlKey;

  /* Only claim Cmd+Z while an undo is actually on offer, so the rest of the
     time the textarea keeps its native text undo. */
  if (mod && event.key.toLowerCase() === 'z' && undoSnapshot) {
    event.preventDefault();
    undoDelete();
    return;
  }

  if (mod && event.key === '\\') {
    event.preventDefault();
    toggleFocusMode();
    return;
  }

  if (event.key === 'Escape') {
    if (!toastEl.hidden) hideToast();
    else if (isTyping()) (document.activeElement as HTMLElement).blur();
    else setFocusMode(false);
    return;
  }

  if (isTyping() || mod || event.altKey) return;

  switch (event.key) {
    case 'f':
      event.preventDefault();
      toggleFocusMode();
      break;
    case 'n':
      event.preventDefault();
      createNote();
      break;
    case 'ArrowDown':
      event.preventDefault();
      moveSelection(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveSelection(-1);
      break;
    case 'Enter':
      if (selectedId) {
        event.preventDefault();
        bodyEl.focus();
      }
      break;
    case 'Backspace':
    case 'Delete':
      if (selectedId) {
        event.preventDefault();
        removeNote(selectedId);
      }
      break;
  }
});

/* Don't lose the last few keystrokes if the tab goes away mid-debounce. */
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

reorder();
render();
