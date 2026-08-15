import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery.js';
import styles from './Sheet.module.css';

export type SheetSide = 'left' | 'bottom';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** `left` = off-canvas navigation drawer, `bottom` = draggable bottom sheet. */
  side?: SheetSide;
  /** Accessible name for the dialog; also rendered as the visible header title. */
  title: string;
  /** Hide the visible header (the sheet content brings its own). */
  hideHeader?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Distance in px a downward drag must cover before the sheet dismisses. */
const DISMISS_THRESHOLD = 110;
/** Velocity (px/ms) that dismisses regardless of distance — a "flick". */
const DISMISS_VELOCITY = 0.5;

/**
 * Mobile sheet — a modal surface that slides in from the left (navigation) or
 * up from the bottom (details).
 *
 * Bottom sheets support the interactions people expect from a native sheet:
 * drag the grabber to move it, flick down to dismiss, tap the grabber to
 * toggle between the peek height and full height. Left sheets are a plain
 * off-canvas drawer with a scrim.
 *
 * Both trap focus, close on Escape and on scrim tap, lock background scroll,
 * and restore focus to whatever opened them.
 */
export default function Sheet({
  open,
  onClose,
  side = 'bottom',
  title,
  hideHeader = false,
  children,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const reducedMotion = usePrefersReducedMotion();

  /** Bottom sheet only: `false` = peek height, `true` = near-full height. */
  const [expanded, setExpanded] = useState(false);
  /** Live drag offset in px while the grabber is held. */
  const [dragOffset, setDragOffset] = useState(0);
  const dragStateRef = useRef<{ startY: number; startTime: number } | null>(null);

  // Reset transient sheet state each time it opens, so a sheet that was
  // dragged half-way and dismissed doesn't reopen mid-drag.
  useEffect(() => {
    if (open) {
      setExpanded(false);
      setDragOffset(0);
      dragStateRef.current = null;
    }
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Lock background scroll while the sheet owns the screen.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus into the sheet on open, and back out on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the panel itself rather than the first control: landing on a
    // checkbox would read out mid-list and hide the sheet's title.
    panel?.focus({ preventScroll: true });
    return () => {
      restoreFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // Keep Tab inside the sheet.
  const onKeyDownTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // ── Grabber drag (bottom sheets) ──────────────────────────────────────────
  const onGrabberPointerDown = useCallback((e: React.PointerEvent) => {
    if (side !== 'bottom') return;
    dragStateRef.current = { startY: e.clientY, startTime: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [side]);

  const onGrabberPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    // Only track downward movement — upward drags are handled by the
    // peek/full toggle on release, so the sheet never overshoots its top.
    setDragOffset(Math.max(0, e.clientY - drag.startY));
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (!drag) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    const distance = e.clientY - drag.startY;
    const elapsed = Math.max(1, e.timeStamp - drag.startTime);
    const velocity = distance / elapsed;

    setDragOffset(0);

    if (distance > DISMISS_THRESHOLD || velocity > DISMISS_VELOCITY) {
      onClose();
      return;
    }
    // A short upward drag promotes the sheet to full height.
    if (distance < -40) {
      setExpanded(true);
      return;
    }
    // Anything else was effectively a tap — toggle peek/full.
    if (Math.abs(distance) < 8) setExpanded((prev) => !prev);
  }, [onClose]);

  if (!open) return null;

  const isBottom = side === 'bottom';
  const panelClasses = [
    styles.panel,
    isBottom ? styles.panelBottom : styles.panelLeft,
    isBottom && expanded ? styles.panelExpanded : '',
    dragOffset > 0 ? styles.panelDragging : '',
    reducedMotion ? styles.noMotion : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.root}>
      <div
        className={`${styles.scrim} ${reducedMotion ? styles.noMotion : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={panelClasses}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDownTrap}
      >
        {isBottom && (
          <div
            className={styles.grabberZone}
            onPointerDown={onGrabberPointerDown}
            onPointerMove={onGrabberPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="button"
            tabIndex={0}
            aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded((prev) => !prev);
              }
            }}
          >
            <span className={styles.grabber} aria-hidden="true" />
          </div>
        )}

        <div className={hideHeader ? styles.srOnlyHeader : styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {!hideHeader && (
            <button className={styles.closeBtn} onClick={onClose} aria-label={`Close ${title}`}>
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
