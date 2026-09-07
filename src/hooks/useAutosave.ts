"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

type RunOptions = {
  /** Se true, non esegue (valore invariato rispetto allo snapshot). */
  skip?: boolean;
};

/**
 * Controllore autosave: stato UI, coda in-flight e retry.
 * Non debuncia: chiama `run` solo da onBlur / Invio / change discreti.
 */
export function useAutosaveController() {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const lastActionRef = useRef<(() => Promise<void>) | null>(null);
  const savingCountRef = useRef(0);

  const clearSavedTimer = useCallback(() => {
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
  }, []);

  const run = useCallback(
    async (action: () => Promise<void>, options?: RunOptions) => {
      if (options?.skip) return;

      lastActionRef.current = action;
      clearSavedTimer();
      savingCountRef.current += 1;
      setStatus("saving");

      const task = (async () => {
        try {
          await action();
          savingCountRef.current = Math.max(0, savingCountRef.current - 1);
          if (savingCountRef.current === 0) {
            setStatus("saved");
            savedTimerRef.current = setTimeout(() => {
              setStatus((prev) => (prev === "saved" ? "idle" : prev));
              savedTimerRef.current = null;
            }, 2000);
          }
        } catch (err) {
          savingCountRef.current = Math.max(0, savingCountRef.current - 1);
          setStatus("error");
          throw err;
        }
      })();

      const tracked = task.catch(() => {
        /* errore già gestito nello stato */
      });
      inFlightRef.current = tracked.finally(() => {
        if (inFlightRef.current === tracked) {
          inFlightRef.current = null;
        }
      });

      await task;
    },
    [clearSavedTimer],
  );

  const flush = useCallback(async () => {
    if (inFlightRef.current) {
      await inFlightRef.current;
    }
  }, []);

  const retry = useCallback(() => {
    const action = lastActionRef.current;
    if (!action) return;
    void run(action);
  }, [run]);

  useEffect(() => () => clearSavedTimer(), [clearSavedTimer]);

  return {
    status,
    run,
    flush,
    retry,
    isSaving: status === "saving",
  };
}

/**
 * Intercetta i click sui link interni: completa il flush prima di navigare.
 * - `isDirty`: avviso beforeunload / pagehide
 * - `alwaysFlushOnNavigate`: se true, salva sempre prima di ogni link interno
 *   (utile in componi per evitare race sull'ultimo keystroke)
 */
export function useFlushBeforeNavigate(options: {
  isDirty: boolean;
  isSaving: boolean;
  alwaysFlushOnNavigate?: boolean;
  /** Salva se dirty, poi attende in-flight. */
  flush: () => Promise<void>;
}) {
  const isDirtyRef = useRef(options.isDirty);
  const isSavingRef = useRef(options.isSaving);
  const alwaysFlushRef = useRef(options.alwaysFlushOnNavigate === true);
  const flushRef = useRef(options.flush);

  useEffect(() => {
    isDirtyRef.current = options.isDirty;
    isSavingRef.current = options.isSaving;
    alwaysFlushRef.current = options.alwaysFlushOnNavigate === true;
    flushRef.current = options.flush;
  }, [
    options.isDirty,
    options.isSaving,
    options.alwaysFlushOnNavigate,
    options.flush,
  ]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current && !isSavingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const preparaEFlush = async () => {
      const attivo = document.activeElement;
      if (attivo instanceof HTMLElement) {
        attivo.blur();
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 30);
      });
      await flushRef.current();
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const needsFlush =
        alwaysFlushRef.current ||
        isDirtyRef.current ||
        isSavingRef.current;
      if (!needsFlush) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      void (async () => {
        try {
          await preparaEFlush();
        } catch {
          return;
        }
        window.location.assign(anchor.href);
      })();
    };

    const onPageHide = () => {
      if (!isDirtyRef.current && !isSavingRef.current) return;
      void flushRef.current().catch(() => undefined);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
}

/** Props comuni per input: salva su blur e Invio (che forza blur). */
export function autosaveInputHandlers(save: () => void) {
  return {
    onBlur: () => {
      void save();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter") return;
      if (event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      (event.target as HTMLElement).blur();
    },
  };
}
