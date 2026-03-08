import { useState, useCallback, useEffect, useRef } from "react";

export function useUndoHistory<T>(initialState: T) {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [index, setIndex] = useState(0);
  const skipNextPush = useRef(false);

  const current = history[index];

  const push = useCallback((state: T) => {
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    setHistory((prev) => {
      const newHistory = prev.slice(0, index + 1);
      newHistory.push(state);
      // Keep max 50 entries
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setIndex((prev) => Math.min(prev + 1, 50));
  }, [index]);

  const undo = useCallback(() => {
    setIndex((prev) => {
      if (prev <= 0) return prev;
      skipNextPush.current = true;
      return prev - 1;
    });
  }, []);

  const redo = useCallback(() => {
    setIndex((prev) => {
      if (prev >= history.length - 1) return prev;
      skipNextPush.current = true;
      return prev + 1;
    });
  }, [history.length]);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  // Keyboard shortcut
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
