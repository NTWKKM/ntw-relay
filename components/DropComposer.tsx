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

interface DropComposerProps {
  onSendText: (text: string) => Promise<void>;
  onUploadFiles: (files: File[]) => Promise<void>;
  uploads: UploadTaskState[];
  disabled?: boolean;
  relayBurstKey?: number;
}

function RelayDropBurst({ reducedMotion }: { reducedMotion: boolean }) {
  if (reducedMotion) {
    return (
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0] }}
        transition={{ duration: 0.36, ease: 'easeOut' }}
        className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      >
        <span className="h-3.5 w-3.5 rounded-full bg-accent-2 ring-4 ring-accent/35" />
      </motion.div>
    );
  }

  const speedLines = [
    { x: -58, h: 'h-12', delay: 0.16, tone: 'bg-accent-2/70' },
    { x: -24, h: 'h-16', delay: 0.2, tone: 'bg-ink/45' },
    { x: 0, h: 'h-24', delay: 0.14, tone: 'bg-accent-2' },
    { x: 24, h: 'h-16', delay: 0.22, tone: 'bg-ink/45' },
    { x: 58, h: 'h-12', delay: 0.18, tone: 'bg-accent-2/70' },
  ];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-visible"
    >
      {/* 1. Soft concentric seal ring as composer folds */}
      <motion.div
        initial={{ scale: 0.88, opacity: 0.7 }}
        animate={{ scale: 1.12, opacity: 0 }}
        transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 rounded-card border border-accent-2/50"
      />

      {/* 2. Vertical speed-lines streaking down to guide the eye into the card below */}
      {speedLines.map((line) => (
        <motion.span
          key={line.x}
          initial={{ y: -24, scaleY: 0.2, opacity: 0 }}
          animate={{
            y: [-24, 18, 122, 168],
            scaleY: [0.2, 1.4, 1.65, 0.3],
            opacity: [0, 0.95, 0.85, 0],
          }}
          transition={{
            duration: 1.38,
            delay: line.delay,
            times: [0, 0.28, 0.76, 1],
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ x: line.x }}
          className={`absolute w-0.5 origin-top rounded-pill ${line.h} ${line.tone}`}
        />
      ))}

      {/* 3. Wordless geometric coral capsule: folds from diamond into a streamlined drop */}
      <motion.div
        initial={{ scale: 0.4, rotate: 45, y: -6, opacity: 0 }}
        animate={{
          scaleX: [0.4, 1.1, 0.95, 0.65, 0.45],
          scaleY: [0.4, 1.1, 1.15, 1.6, 0.6],
          rotate: [45, 45, 0, 0, 0],
          y: [-6, -8, -4, 96, 164],
          opacity: [0, 1, 1, 0.95, 0],
        }}
        transition={{
          duration: 1.45,
          times: [0.1, 0.28, 0.46, 0.8, 1],
          ease: [0.22, 1, 0.36, 1],
        }}
        className="relative flex items-center justify-center"
      >
        <div className="h-8 w-8 rounded-input bg-accent-2 border-2 border-ink shadow-[0_0_0_4px_var(--color-accent)]" />
      </motion.div>

      {/* 4. Soft ripple where the drop meets the feed card below */}
      <motion.div
        initial={{ y: 158, scaleX: 0.25, scaleY: 0.5, opacity: 0 }}
        animate={{
          y: 158,
          scaleX: [0.25, 1.1, 1.35],
          scaleY: [0.5, 1, 1.2],
          opacity: [0, 0.75, 0],
        }}
        transition={{
          duration: 0.46,
          delay: 1.04,
          times: [0, 0.45, 1],
          ease: [0.16, 1, 0.3, 1],
        }}
        className="absolute h-7 w-28 rounded-pill border border-accent-2/70 bg-accent/15"
      />
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const sendingRef = useRef(false);
  const disabledRef = useRef(disabled);
  const submitGenerationRef = useRef(0);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    if (relayBurstKey <= 0) return;
    const timeoutMs = prefersReducedMotion ? 450 : 1560;
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
      <div className="relative">
      <MotionConfig reducedMotion="user">
      <motion.div
        animate={
          showBurst && !prefersReducedMotion
            ? {
                scaleX: [1, 0.62, 0.36, 0.26],
                scaleY: [1, 0.28, 0.22, 0.14],
                y: [0, 0, -6, 152],
                opacity: [1, 0.75, 0.25, 0],
              }
            : { scaleX: 1, scaleY: 1, y: 0, opacity: 1 }
        }
        transition={
          showBurst && !prefersReducedMotion
            ? {
                duration: 1.48,
                times: [0, 0.24, 0.62, 1],
                ease: [0.22, 1, 0.36, 1],
              }
            : { duration: 0.26, ease: [0.16, 1, 0.3, 1] }
        }
        className={`origin-center ${showBurst ? 'pointer-events-none' : ''}`}
      >
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
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.985 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-none absolute inset-1 rounded-input border-2 border-dashed border-accent-2 bg-cotton/95 flex items-center justify-center gap-2 text-sm font-medium text-accent-2"
              >
                <FileUp className="w-4 h-4" aria-hidden="true" />
                <span>Drop to upload</span>
              </motion.div>
            )}
          </AnimatePresence>
        </MotionConfig>
      </form>
      </motion.div>

        <AnimatePresence>
          {showBurst && (
            <RelayDropBurst
              key={relayBurstKey}
              reducedMotion={Boolean(prefersReducedMotion)}
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
                  className={`h-full w-full origin-left transition-transform duration-150 ${
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
