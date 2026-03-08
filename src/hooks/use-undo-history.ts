import { useState, useCallback, useEffect } from "react";

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

  const push = useCallback((value: T) => {
    setState((prev) => {
      const newEntries = prev.entries.slice(0, prev.index + 1);
      newEntries.push(value);
      if (newEntries.length > 50) newEntries.shift();
      return { entries: newEntries, index: newEntries.length - 1 };
    });
  }, []);

  const undo = useCallback(() => {
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

  const canUndo = state.index > 0;
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

  return { current, push, undo, redo, canUndo, canRedo };
}
