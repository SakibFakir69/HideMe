import { useSyncExternalStore } from 'react';

/**
 * A tiny global toast queue.
 *
 * Some results outlive the screen that caused them: an import that finishes
 * after the import screen has been closed, a file moved to the bin from the
 * grid. A module-level store lets any screen raise a message and the vault
 * layout render it, so the feedback survives navigation.
 */

export type ToastTone = 'neutral' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = () => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Toast[] {
  return toasts;
}

/** Shows a message. The host removes it after a few seconds. */
export function showToast(message: string, tone: ToastTone = 'neutral'): number {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }];
  emit();
  return id;
}

/** Removes a toast (the host calls this when it times out). */
export function dismissToast(id: number): void {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

/** The toasts that should be on screen right now. */
export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
