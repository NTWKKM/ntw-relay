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
    const nextHeight = Math.min(Math.max(el.scrollHeight, 108), 240);
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
        textareaRef.current.style.height = '108px';
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
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-stretch">
        {/* Text & Link Box */}
        <div className="rounded-xl bg-[#13161C] border border-zinc-800/90 p-4 flex flex-col justify-between gap-3 focus-within:border-zinc-700 transition-colors">
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
              placeholder="Drop text, links, code, or Thai notes... (Cmd/Ctrl + V anywhere to paste screenshots)"
              rows={3}
              className="w-full min-h-[108px] resize-none bg-transparent text-sm sm:text-[15px] text-[#F4F5F7] placeholder:text-zinc-500 focus:outline-none leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/70">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePasteButton}
                disabled={disabled || sending}
                className="h-9 px-3 rounded-lg bg-[#0B0D11] border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-[#F4F5F7] hover:border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Paste from Clipboard</span>
              </button>

              {text.length > 0 && (
                <span className="text-xs text-zinc-500 tabular-nums hidden sm:inline">
                  {text.length.toLocaleString()} chars
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-zinc-500">
                <span>Cmd/Ctrl</span>
                <CornerDownLeft className="w-3 h-3" aria-hidden="true" />
              </span>
              <button
                type="button"
                onClick={handleSubmitText}
                disabled={disabled || sending}
                className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{sending ? 'Sending...' : 'Send'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* File & Image Drop Zone */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-xl border border-dashed p-5 flex flex-col items-center justify-center text-center gap-3 transition-colors ${
            isDragging
              ? 'bg-indigo-500/10 border-indigo-400 text-indigo-100'
              : 'bg-[#13161C] border-zinc-800 hover:border-zinc-700 text-zinc-300'
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
            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
              isDragging
                ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-300'
                : 'bg-[#0B0D11] border-zinc-800 text-zinc-400'
            }`}
          >
            {isDragging ? (
              <FileUp className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Upload className="w-5 h-5" aria-hidden="true" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-[#F4F5F7]">
              {isDragging ? 'Release to upload' : 'Drop files or images'}
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Multiple files supported · Paste screenshot with Cmd/Ctrl+V
            </p>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="h-9 px-4 rounded-lg bg-[#0B0D11] border border-zinc-800 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Choose Files
          </button>
        </div>
      </div>

      {/* Inline validation or clipboard error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-500/10 border border-red-500/25 px-4 py-2.5 text-xs sm:text-sm text-red-300 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Real-time Upload Progress Queue */}
      {uploads.length > 0 && (
        <div
          aria-live="polite"
          className="rounded-xl bg-[#13161C] border border-zinc-800/90 divide-y divide-zinc-800/70"
        >
          {uploads.map((task) => (
            <div key={task.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {task.status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : task.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="font-medium text-zinc-200 truncate">{task.fileName}</span>
                </div>
                <div className="text-zinc-400 tabular-nums shrink-0">
                  {task.status === 'error' ? (
                    <span className="text-red-400">{task.errorMessage || 'Upload failed'}</span>
                  ) : (
                    <>
                      {formatBytes(task.bytesTransferred)} / {formatBytes(task.fileSize)}
                      {task.speedBps > 0 && task.status === 'uploading' && (
                        <> · {formatBytes(task.speedBps)}/s</>
                      )}
                      {' · '}
                      <span className="text-zinc-200 font-medium">{task.progress}%</span>
                    </>
                  )}
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#0B0D11] overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${
                    task.status === 'error'
                      ? 'bg-red-500'
                      : task.status === 'done'
                        ? 'bg-emerald-500'
                        : 'bg-indigo-500'
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
