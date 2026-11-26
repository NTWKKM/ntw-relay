'use client';

import React, { useEffect, useRef } from 'react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  variant?: 'card' | 'fullscreen';
  size?: 'sm' | 'lg';
  className?: string;
  children: React.ReactNode;
}

/**
 * Native <dialog> primitive following Chrome Modern Web Guidance:
 * - showModal() for native top-layer promotion, focus trapping, inert background, and Esc dismissal
 * - closedby="any" for declarative light-dismiss + Safari bounding-box fallback
 * - Pure CSS overscroll-behavior: contain on dialog & ::backdrop (no root body scroll hacks)
 * - @starting-style + allow-discrete transitions in globals.css
 */
export function ModalDialog({
  open,
  onClose,
  ariaLabelledBy,
  ariaLabel,
  variant = 'card',
  size = 'sm',
  className = '',
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Declarative light-dismiss for supporting browsers (Chrome 134+, Edge 134+, Firefox 141+)
    dialog.setAttribute('closedby', 'any');

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Sync native close event (Esc key, closedby="any", or form method="dialog") back to React state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onCloseRef.current();
    };
    dialog.addEventListener('close', handleClose);

    // Mandatory fallback for browsers without closedby support (e.g. Safari)
    const supportsClosedBy =
      typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const clickedInside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!clickedInside) {
        dialog.close();
      }
    };

    if (!supportsClosedBy) {
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (!supportsClosedBy) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, []);

  const variantClass =
    variant === 'fullscreen'
      ? 'mwg-dialog-fullscreen'
      : size === 'lg'
        ? 'mwg-dialog-lg'
        : '';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      className={`mwg-dialog ${variantClass} ${className}`.trim()}
    >
      {open ? children : null}
    </dialog>
  );
}
