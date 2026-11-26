'use client';

import React, { useEffect, useRef, useState } from 'react';
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
}

export function DropComposer({
  onSendText,
  onUploadFiles,
  uploads,
  disabled = false,
}: DropComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

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
    setError(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Enter text or a link first.');
      textareaRef.current?.focus();
      return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      setError(`Max ${MAX_TEXT_LENGTH.toLocaleString()} characters.`);
      return;
    }

    setSending(true);
    try {
      await onSendText(trimmed);
      setText('');
      if (
        textareaRef.current &&
        !(typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content'))
      ) {
        textareaRef.current.style.height = '84px';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
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
    setError(null);
    try {
      if (navigator.clipboard?.read) {
        try {
          const items = await navigator.clipboard.read();
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
    if (selected.length > 0) {
      void onUploadFiles(selected);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
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
      <form
        ref={formRef}
        onSubmit={handleFormSubmit}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        noValidate
        className={`relative rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border transition-colors ${
          isDragging
            ? 'border-[#1D4ED8] dark:border-[#60A5FA] bg-[#1D4ED8]/[0.03] dark:bg-[#60A5FA]/[0.06]'
            : 'border-[#E2DCD0] dark:border-[#2C2925] focus-within:border-[#BFB7A8] dark:focus-within:border-[#454039]'
        }`}
      >
        <input
          ref={fileInputRef}
          id="file-upload-input"
          type="file"
          multiple
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Attach files or images"
        />

        <div className="px-4 sm:px-5 pt-4 pb-3">
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
            className="mwg-autogrow w-full resize-none bg-transparent text-[15px] text-[#181715] dark:text-[#F3EFE8] placeholder:text-[#8E877B] dark:placeholder:text-[#6E685F] focus:outline-none leading-[1.6]"
          />
        </div>

        <div className="px-3.5 sm:px-4 py-2.5 border-t border-[#ECE7DD] dark:border-[#272420] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || sending}
              aria-label="Attach files up to 10 MB"
              title="Attach files (max 10 MB)"
              className="h-9 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F2EFE7] dark:hover:bg-[#25221E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Attach</span>
            </button>

            <button
              type="button"
              onClick={handlePasteButton}
              disabled={disabled || sending}
              aria-label="Paste from clipboard"
              className="h-9 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F2EFE7] dark:hover:bg-[#25221E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Paste</span>
            </button>

            {text.length > 0 && (
              <span className="font-mono text-[11px] text-[#787268] dark:text-[#8A8378] tabular-nums pl-1.5 hidden sm:inline">
                {text.length.toLocaleString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <kbd className="hidden sm:inline font-mono text-[11px] text-[#8E877B] dark:text-[#777066]">
              ⌘↵
            </kbd>
            <button
              type="submit"
              disabled={disabled || sending}
              className="h-9 px-4 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] disabled:opacity-50 text-[#FCFBF8] dark:text-[#121110] text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{sending ? 'Sending...' : 'Send'}</span>
            </button>
          </div>
        </div>

        {/* Active Drag Overlay */}
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 rounded-xl bg-[#FCFBF8]/92 dark:bg-[#1A1917]/92 flex items-center justify-center gap-2 text-sm font-medium text-[#1D4ED8] dark:text-[#60A5FA]">
            <FileUp className="w-4 h-4" aria-hidden="true" />
            <span>Drop to upload</span>
          </div>
        )}
      </form>

      {/* Inline Validation Error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-[#FEF2F2] dark:bg-[#3A1717]/60 border border-[#FECACA] dark:border-[#7F1D1D]/70 px-3.5 py-2 text-xs text-[#991B1B] dark:text-[#FCA5A5] flex items-center gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Progress Queue */}
      {uploads.length > 0 && (
        <div
          aria-live="polite"
          className="rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] divide-y divide-[#ECE7DD] dark:divide-[#272420]"
        >
          {uploads.map((task) => (
            <div key={task.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {task.status === 'done' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80] shrink-0" aria-hidden="true" />
                  ) : task.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-[#B91C1C] dark:text-[#F87171] shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="font-medium text-[#181715] dark:text-[#F3EFE8] truncate">
                    {task.fileName}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-[#6B655C] dark:text-[#968F84] tabular-nums shrink-0">
                  {task.status === 'error' ? (
                    <span className="text-[#B91C1C] dark:text-[#F87171]">
                      {task.errorMessage || 'Failed'}
                    </span>
                  ) : (
                    <>
                      {formatBytes(task.fileSize)} ·{' '}
                      <span className="text-[#181715] dark:text-[#F3EFE8] font-medium">
                        {task.progress}%
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="h-1 w-full rounded-full bg-[#EAE5DB] dark:bg-[#272420] overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    task.status === 'error'
                      ? 'bg-[#B91C1C] dark:bg-[#F87171]'
                      : task.status === 'done'
                        ? 'bg-[#15803D] dark:bg-[#4ADE80]'
                        : 'bg-[#1D4ED8] dark:bg-[#60A5FA]'
                  }`}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
