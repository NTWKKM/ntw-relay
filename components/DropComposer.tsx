'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  FileUp,
  Paperclip,
  Send,
} from 'lucide-react';
import { formatBytes, isImeComposing, MAX_TEXT_LENGTH } from '@/lib/drop-utils';
import type { UploadTaskState } from '@/lib/types';
import { WaterBurstSvg } from '@/components/WaterBurstSvg';
import { EASE_STREAM, RELAY_BURST } from '@/lib/relay-motion';

interface DropComposerProps {
  onSendText: (text: string) => Promise<void>;
  onUploadFiles: (files: File[]) => Promise<void>;
  uploads: UploadTaskState[];
  disabled?: boolean;
  relayBurstKey?: number;
}

// Hidden SVG filter: low-frequency turbulence displaces the composer in
// horizontal bands, like a reflection on a disturbed water surface.
function WaterSurfaceFilter({
  turbulenceRef,
  displacementRef,
}: {
  turbulenceRef: React.Ref<SVGFETurbulenceElement>;
  displacementRef: React.Ref<SVGFEDisplacementMapElement>;
}) {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id="relay-water-surface" x="-10%" y="-20%" width="120%" height="140%">
        <feTurbulence
          ref={turbulenceRef}
          type="turbulence"
          baseFrequency="0.002 0.018"
          numOctaves={1}
          seed={7}
          result="swell"
        />
        <feDisplacementMap
          ref={displacementRef}
          in="SourceGraphic"
          in2="swell"
          scale="0"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}

// Physically shaded water drawn in SVG, driven per frame by waterScene().
function RelayDropBurst({
  reducedMotion,
  composerSize,
  onDone,
}: {
  reducedMotion: boolean;
  composerSize: { width: number; height: number };
  onDone: () => void;
}) {
  if (reducedMotion) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
      <WaterBurstSvg geometry={composerSize} onDone={onDone} />
    </div>
  );
}

export function DropComposer({
  onSendText,
  onUploadFiles,
  uploads,
  disabled = false,
  relayBurstKey = 0,
}: DropComposerProps) {
  const prefersReducedMotion = useReducedMotion();
  const [clearedBurstKey, setClearedBurstKey] = useState<number>(0);
  const showBurst = relayBurstKey > 0 && clearedBurstKey !== relayBurstKey;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const composerBoxRef = useRef<HTMLDivElement | null>(null);
  const turbulenceRef = useRef<SVGFETurbulenceElement | null>(null);
  const displacementRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const [composerSize, setComposerSize] = useState({ width: 640, height: 180 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const sendingRef = useRef(false);
  const disabledRef = useRef(disabled);
  const submitGenerationRef = useRef(0);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  // Drive the water-surface filter from the composer's own animation frames,
  // so the ripple stays in lockstep with the swell and collapse.
  function handleComposerFrame(latest: { scaleY?: number | string }) {
    const turbulence = turbulenceRef.current;
    const displacement = displacementRef.current;
    if (!turbulence || !displacement) return;
    const scaleY = Number(latest.scaleY ?? 1);
    // Swell phase: scaleY 1 -> 1.07 builds the waves; collapse keeps them churning.
    const strength = scaleY >= 1 ? Math.min((scaleY - 1) / 0.07, 1) : 1;
    displacement.setAttribute('scale', (strength * 18).toFixed(1));
    // Swell bands drift slowly, like light on a gently moving surface.
    const churn = performance.now() / 220;
    turbulence.setAttribute(
      'baseFrequency',
      `${(0.002 + strength * 0.001).toFixed(4)} ${(0.018 + Math.sin(churn) * 0.004).toFixed(4)}`
    );
  }

  useEffect(() => {
    const el = composerBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setComposerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (relayBurstKey <= 0) return;
    // The burst normally ends itself via onDone; this is only a safety net in
    // case the tab is hidden and frames never arrive.
    const timeoutMs = prefersReducedMotion ? 0 : RELAY_BURST.total * 1000 + 3000;
    const timer = window.setTimeout(() => {
      setClearedBurstKey(relayBurstKey);
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [relayBurstKey, prefersReducedMotion]);

  // Fallback JS auto-grow strictly for browsers without native CSS `field-sizing: content`
  useEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) {
      return;
    }
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 84), 256);
    el.style.height = `${nextHeight}px`;
  }, [text]);

  async function submitText() {
    if (disabled || sendingRef.current) return;
    setError(null);
    const submittedText = text;
    const trimmed = submittedText.trim();
    if (!trimmed) {
      setError('Enter text or a link first.');
      textareaRef.current?.focus();
      return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      setError(`Max ${MAX_TEXT_LENGTH.toLocaleString()} characters.`);
      return;
    }

    sendingRef.current = true;
    submitGenerationRef.current += 1;
    setSending(true);
    try {
      await onSendText(trimmed);
      let cleared = false;
      setText((current) => {
        if (current === submittedText) {
          cleared = true;
          return '';
        }
        return current;
      });
      if (
        cleared &&
        textareaRef.current &&
        !(typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content'))
      ) {
        textareaRef.current.style.height = '84px';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submitText();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isImeComposing({ isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode })) {
        return;
      }
      formRef.current?.requestSubmit();
    }
  }

  async function handlePasteButton() {
    if (disabled || sendingRef.current) return;
    const pasteGeneration = submitGenerationRef.current;
    setError(null);
    try {
      if (navigator.clipboard?.read) {
        try {
          const items = await navigator.clipboard.read();
          if (disabledRef.current || sendingRef.current || submitGenerationRef.current !== pasteGeneration) {
            return;
          }
          const imageFiles: File[] = [];
          for (const clipItem of items) {
            const imgType = clipItem.types.find((t) => t.startsWith('image/'));
            if (imgType) {
              const blob = await clipItem.getType(imgType);
              const ext = imgType.split('/')[1] || 'png';
              imageFiles.push(
                new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imgType })
              );
            }
          }
          if (disabledRef.current || sendingRef.current || submitGenerationRef.current !== pasteGeneration) {
            return;
          }
          if (imageFiles.length > 0) {
            await onUploadFiles(imageFiles);
            return;
          }
        } catch {
          // Fall through to readText
        }
      }

      if (navigator.clipboard?.readText) {
        const clipText = await navigator.clipboard.readText();
        if (disabledRef.current || sendingRef.current || submitGenerationRef.current !== pasteGeneration) {
          return;
        }
        if (!clipText) {
          setError('Clipboard is empty.');
          return;
        }
        setText((prev) => (prev ? `${prev}\n${clipText}` : clipText));
        textareaRef.current?.focus();
      } else {
        setError('Press Cmd/Ctrl+V directly.');
      }
    } catch {
      setError('Press Cmd/Ctrl+V directly.');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (disabled || sendingRef.current) return;
    if (selected.length > 0) {
      void onUploadFiles(selected);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || sending) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (disabled || sendingRef.current) return;
    setError(null);

    const droppedFiles = Array.from(e.dataTransfer.files ?? []);
    if (droppedFiles.length > 0) {
      void onUploadFiles(droppedFiles);
      return;
    }

    const droppedText = e.dataTransfer.getData('text/plain');
    if (droppedText) {
      setText((prev) => (prev ? `${prev}\n${droppedText}` : droppedText));
      textareaRef.current?.focus();
    }
  }

  return (
    <section aria-label="Compose drop" className="space-y-3">
      {/* Unified Writing & File Drop Surface — entire surface accepts drag-and-drop */}
      <div ref={composerBoxRef} className="relative">
      <WaterSurfaceFilter turbulenceRef={turbulenceRef} displacementRef={displacementRef} />
      <MotionConfig reducedMotion="user">
      <motion.div
        animate={
          showBurst && !prefersReducedMotion
            ? {
                scaleX: [1, 1.04, 0.82],
                scaleY: [1, 1.07, 0.62],
                filter: ['blur(0px)', 'blur(1.5px)', 'blur(7px)'],
                opacity: [1, 0.85, 0],
              }
            : { scaleX: 1, scaleY: 1, filter: 'blur(0px)', opacity: 1 }
        }
        transition={
          showBurst && !prefersReducedMotion
            ? {
                duration: RELAY_BURST.collapseEnd,
                times: [0, RELAY_BURST.swellEnd / RELAY_BURST.collapseEnd, 1],
                ease: [EASE_STREAM, [0.7, 0, 0.84, 0]],
              }
            : {
                scaleX: { type: 'spring', stiffness: 220, damping: 22 },
                scaleY: { type: 'spring', stiffness: 220, damping: 22 },
                default: { duration: 0.4, ease: EASE_STREAM },
              }
        }
        onUpdate={showBurst && !prefersReducedMotion ? handleComposerFrame : undefined}
        className={`origin-center ${showBurst ? 'pointer-events-none' : ''}`}
      >
      <div style={showBurst && !prefersReducedMotion ? { filter: 'url(#relay-water-surface)' } : undefined}>
      <form
        ref={formRef}
        onSubmit={handleFormSubmit}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        noValidate
        className={`relative rounded-card coral-stock border transition-colors duration-150 ${
          isDragging
            ? 'border-accent-2'
            : 'border-transparent focus-within:border-rule-2'
        }`}
      >
        <input
          ref={fileInputRef}
          id="file-upload-input"
          type="file"
          multiple
          disabled={disabled || sending}
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Attach files or images"
        />

        <div className="p-3 sm:p-4">
          <label htmlFor="drop-text-input" className="sr-only">
            Drop text, links, or code
          </label>
          <textarea
            id="drop-text-input"
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending}
            placeholder="Paste text, link, code, or drop files..."
            rows={3}
            className="mwg-autogrow w-full resize-none rounded-input bg-paper border border-muted px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted focus:outline-none focus:border-focus transition-colors leading-[1.6]"
          />
        </div>

        <div className="px-3.5 sm:px-4 py-2.5 border-t border-rule flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || sending}
              aria-label="Attach files up to 10 MB"
              title="Attach files (max 10 MB)"
              className="h-9 px-2.5 rounded-input text-xs font-medium text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Attach</span>
            </button>

            <button
              type="button"
              onClick={handlePasteButton}
              disabled={disabled || sending}
              aria-label="Paste from clipboard"
              className="h-9 px-2.5 rounded-input text-xs font-medium text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Paste</span>
            </button>

            {text.length > 0 && (
              <span className="text-xs text-muted tabular-nums pl-1.5 hidden sm:inline">
                {text.length.toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <kbd className="hidden sm:inline font-outlier text-xs text-muted">
              ⌘↵
            </kbd>
            <button
              type="submit"
              disabled={disabled || sending}
              className="coral-btn-ink h-9 px-4 rounded-stock disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </div>
        </div>

        {/* Active Drag Overlay */}
        <MotionConfig reducedMotion="user">
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE_STREAM }}
                className="pointer-events-none absolute inset-1 overflow-hidden rounded-input border-2 border-dashed border-accent-2 bg-cotton/95 flex items-center justify-center gap-2 text-sm font-medium text-accent-2"
              >
                <span className="relay-ripple" />
                <FileUp className="relative w-4 h-4" aria-hidden="true" />
                <span className="relative">Drop to upload</span>
              </motion.div>
            )}
          </AnimatePresence>
        </MotionConfig>
      </form>
      </div>
      </motion.div>

        <AnimatePresence>
          {showBurst && (
            <RelayDropBurst
              key={relayBurstKey}
              reducedMotion={Boolean(prefersReducedMotion)}
              composerSize={composerSize}
              onDone={() => setClearedBurstKey(relayBurstKey)}
            />
          )}
        </AnimatePresence>
      </MotionConfig>
      </div>

      {/* Inline Validation Error */}
      {error && (
        <div
          role="alert"
          className="rounded-input bg-paper-2 border border-error/30 px-3.5 py-2 text-xs text-error flex items-center gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Progress Queue */}
      {uploads.length > 0 && (
        <div
          aria-live="polite"
          className="rounded-card coral-stock divide-y divide-rule"
        >
          {uploads.map((task) => (
            <div key={task.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {task.status === 'done' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
                  ) : task.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="font-medium text-ink truncate">
                    {task.fileName}
                  </span>
                </div>
                <div className="text-xs text-muted tabular-nums shrink-0 flex items-center gap-2">
                  {task.status === 'error' ? (
                    <span className="text-error">
                      {task.errorMessage || 'Failed'}
                    </span>
                  ) : (
                    <>
                      <span>{formatBytes(task.fileSize)}</span>
                      <span className="text-ink font-medium">
                        {task.progress}%
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="h-1 w-full rounded-pill bg-paper-2 overflow-hidden">
                <div
                  className={`h-full w-full origin-left transition-transform duration-150 motion-reduce:transition-none ${
                    task.status === 'error'
                      ? 'bg-error'
                      : task.status === 'done'
                        ? 'bg-success'
                        : 'bg-accent-2'
                  }`}
                  style={{ transform: `scaleX(${Math.max(0, Math.min(100, task.progress)) / 100})` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
