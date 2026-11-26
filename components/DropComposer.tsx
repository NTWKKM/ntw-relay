'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  CornerDownLeft,
  FileUp,
  Send,
  Upload,
} from 'lucide-react';
import { formatBytes, MAX_TEXT_LENGTH } from '@/lib/drop-utils';
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  // Auto-expand textarea height up to 240px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 120), 240);
    el.style.height = `${nextHeight}px`;
  }, [text]);

  async function handleSubmitText() {
    setError(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Enter text or paste a link to send.');
      textareaRef.current?.focus();
      return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      setError(`Text exceeds the ${MAX_TEXT_LENGTH.toLocaleString()} character limit.`);
      return;
    }

    setSending(true);
    try {
      await onSendText(trimmed);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '120px';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send text.');
    } finally {
      setSending(false);
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
        setError('Clipboard read is not supported in this browser. Press Cmd/Ctrl+V directly.');
      }
    } catch {
      setError('Clipboard access was denied. Press Cmd/Ctrl+V directly inside the page.');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmitText();
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
    <section aria-label="Quick input and file drop" className="space-y-3">
      {/* Unified Architectural Dispatch Surface: single surface split by a 1px structural divider */}
      <div className="rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_296px] items-stretch focus-within:border-[#BFB7A8] dark:focus-within:border-[#454039] transition-colors">
        {/* Left: Text, Link & Code Writing Desk */}
        <div className="p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div>
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
              placeholder="Write a note, paste a URL or code snippet, or press Cmd/Ctrl+V anywhere to send a screenshot..."
              rows={4}
              className="w-full min-h-[120px] resize-none bg-transparent text-[15px] text-[#181715] dark:text-[#F3EFE8] placeholder:text-[#8E877B] dark:placeholder:text-[#6E685F] focus:outline-none leading-[1.65]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-[#ECE7DD] dark:border-[#272420]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePasteButton}
                disabled={disabled || sending}
                className="h-9 px-3 rounded-lg bg-[#F5F2EB] dark:bg-[#141311] border border-[#DDD6C8] dark:border-[#2E2A25] text-xs font-medium text-[#3D3A35] dark:text-[#CFC8BC] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:border-[#C7BFB0] dark:hover:border-[#443F38] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Paste Clipboard</span>
              </button>

              {text.length > 0 && (
                <span className="font-mono text-xs text-[#787268] dark:text-[#8A8378] tabular-nums hidden sm:inline">
                  {text.length.toLocaleString()} chars
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] text-[#787268] dark:text-[#8A8378]">
                <span>Cmd/Ctrl</span>
                <CornerDownLeft className="w-3 h-3" aria-hidden="true" />
              </span>
              <button
                type="button"
                onClick={handleSubmitText}
                disabled={disabled || sending}
                className="h-9 px-4 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] disabled:opacity-50 text-[#FCFBF8] dark:text-[#121110] text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{sending ? 'Sending...' : 'Send'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Tactile File & Screenshot Drop Tray */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`p-5 sm:p-6 border-t lg:border-t-0 lg:border-l flex flex-col items-center justify-center text-center gap-3.5 transition-colors ${
            isDragging
              ? 'bg-[#1D4ED8]/8 dark:bg-[#60A5FA]/10 border-[#1D4ED8] dark:border-[#60A5FA]'
              : 'bg-[#F7F4EE] dark:bg-[#161513] border-[#E2DCD0] dark:border-[#2C2925]'
          }`}
        >
          <input
            ref={fileInputRef}
            id="file-upload-input"
            type="file"
            multiple
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Choose files or images to upload"
          />

          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors ${
              isDragging
                ? 'bg-[#1D4ED8]/12 dark:bg-[#60A5FA]/15 border-[#1D4ED8]/40 text-[#1D4ED8] dark:text-[#60A5FA]'
                : 'bg-[#FCFBF8] dark:bg-[#1E1C1A] border-[#DDD6C8] dark:border-[#2E2A25] text-[#5D5850] dark:text-[#A8A196]'
            }`}
          >
            {isDragging ? (
              <FileUp className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Upload className="w-4 h-4" aria-hidden="true" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#181715] dark:text-[#F3EFE8]">
              {isDragging ? 'Release to transfer' : 'Drop files or images'}
            </p>
            <p className="text-xs text-[#6B655C] dark:text-[#968F84] leading-relaxed max-w-[220px]">
              Multi-file handoff up to 500 MB · Paste screenshots anywhere
            </p>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="h-9 px-4 rounded-lg bg-[#FCFBF8] dark:bg-[#1E1C1A] border border-[#DDD6C8] dark:border-[#322E28] text-xs font-medium text-[#181715] dark:text-[#F3EFE8] hover:border-[#B9B0A0] dark:hover:border-[#4A453E] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Choose Files
          </button>
        </div>
      </div>

      {/* Inline validation or clipboard error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-[#FEF2F2] dark:bg-[#3A1717]/60 border border-[#FECACA] dark:border-[#7F1D1D]/70 px-4 py-2.5 text-xs sm:text-sm text-[#991B1B] dark:text-[#FCA5A5] flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Real-time Upload Progress Queue */}
      {uploads.length > 0 && (
        <div
          aria-live="polite"
          className="rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] divide-y divide-[#ECE7DD] dark:divide-[#272420]"
        >
          {uploads.map((task) => (
            <div key={task.id} className="px-5 py-3.5 space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {task.status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-[#4ADE80] shrink-0" aria-hidden="true" />
                  ) : task.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-[#B91C1C] dark:text-[#F87171] shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="font-medium text-[#181715] dark:text-[#F3EFE8] truncate">
                    {task.fileName}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-[#6B655C] dark:text-[#968F84] tabular-nums shrink-0">
                  {task.status === 'error' ? (
                    <span className="text-[#B91C1C] dark:text-[#F87171]">
                      {task.errorMessage || 'Upload failed'}
                    </span>
                  ) : (
                    <>
                      {formatBytes(task.bytesTransferred)} / {formatBytes(task.fileSize)}
                      {task.speedBps > 0 && task.status === 'uploading' && (
                        <> · {formatBytes(task.speedBps)}/s</>
                      )}
                      {' · '}
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
