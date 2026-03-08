import { useState, useCallback, useEffect, useRef } from "react";

interface HistoryState<T> {
  entries: T[];
  index: number;
}

export function useUndoHistory<T>(initialState: T) {
  const [state, setState] = useState<HistoryState<T>>({
    entries: [initialState],
    index: 0,
  });

  const current = state.entries[state.index] ?? initialState;

  // Debounced push: groups rapid changes into one history entry
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValue = useRef<T | null>(null);
  const hasPendingSnapshot = useRef(false);

  const flushPending = useCallback(() => {
    if (pendingValue.current !== null) {
      const val = pendingValue.current;
      pendingValue.current = null;
      hasPendingSnapshot.current = false;
      setState((prev) => {
        const newEntries = prev.entries.slice(0, prev.index + 1);
        newEntries.push(val);
        if (newEntries.length > 50) newEntries.shift();
        return { entries: newEntries, index: newEntries.length - 1 };
      });
    }
  }, []);

  const push = useCallback((value: T) => {
    pendingValue.current = value;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(flushPending, 300);
  }, [flushPending]);

  // Immediate push (for discrete actions like add/delete)
  const pushImmediate = useCallback((value: T) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    pendingValue.current = null;
    setState((prev) => {
      const newEntries = prev.entries.slice(0, prev.index + 1);
      newEntries.push(value);
      if (newEntries.length > 50) newEntries.shift();
      return { entries: newEntries, index: newEntries.length - 1 };
    });
  }, []);

  const undo = useCallback(() => {
    // Flush any pending change first so it's saved
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
      if (pendingValue.current !== null) {
        const val = pendingValue.current;
        pendingValue.current = null;
        setState((prev) => {
          const newEntries = prev.entries.slice(0, prev.index + 1);
          newEntries.push(val);
          if (newEntries.length > 50) newEntries.shift();
          // Then undo one step
          return { entries: newEntries, index: newEntries.length - 2 };
        });
        return;
      }
    }
    setState((prev) => {
      if (prev.index <= 0) return prev;
      return { ...prev, index: prev.index - 1 };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.index >= prev.entries.length - 1) return prev;
      return { ...prev, index: prev.index + 1 };
    });
  }, []);

  const canUndo = state.index > 0 || pendingValue.current !== null;
  const canRedo = state.index < state.entries.length - 1;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return { current, push, pushImmediate, undo, redo, canUndo, canRedo };
}
