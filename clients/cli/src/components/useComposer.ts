import { useEffect, useRef, useState } from "react";
import { composerPath, loadComposer, saveComposer } from "./composerStorage.js";

export function useComposer(engagement: string) {
  const path = composerPath(engagement);
  const [error, setError] = useState("");
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const history = useRef<readonly string[]>([]);
  const historyIndex = useRef(0);
  const savedDraft = useRef("");
  const loadedPath = useRef("");
  const currentValue = useRef(value);
  currentValue.current = value;
  function replace(text: string) { currentValue.current = text; setValue(text); setCursor(text.length); }
  useEffect(() => {
    try {
      const stored = loadComposer(path);
      history.current = stored.history;
      historyIndex.current = stored.history.length;
      replace(stored.draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      history.current = [];
      historyIndex.current = 0;
      replace("");
    }
    loadedPath.current = path;
  }, [path]);
  useEffect(() => {
    if (loadedPath.current !== path) return;
    const persist = () => {
      try { saveComposer(path, { draft: currentValue.current, history: history.current }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    const timer = setTimeout(persist, 200);
    return () => { clearTimeout(timer); };
  }, [value, path]);
  useEffect(() => () => {
    if (loadedPath.current !== path) return;
    try { saveComposer(path, { draft: currentValue.current, history: history.current }); }
    catch (cause) { process.stderr.write(`Unable to save prompt draft: ${cause instanceof Error ? cause.message : String(cause)}\n`); }
  }, [path]);
  function remember(text: string) {
    history.current = [...history.current.filter((item) => item !== text), text].slice(-200);
    historyIndex.current = history.current.length;
    savedDraft.current = "";
    replace("");
  }
  function recall(direction: number) {
    if (historyIndex.current === history.current.length) savedDraft.current = value;
    historyIndex.current = Math.max(0, Math.min(history.current.length, historyIndex.current + direction));
    replace(history.current[historyIndex.current] ?? savedDraft.current);
  }
  return { value, cursor, setCursor, replace, remember, recall, history, error, setError };
}
