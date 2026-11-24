const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab / Shift+Tab inside a modal (`aria-modal` alone does not). Call it from a
 * keydown handler; it wraps at both ends and brings back focus that has left.
 */
export function containTab(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || !container) return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    // Skips what is not rendered and what a disabled fieldset disables.
    (el) => el.getClientRects().length > 0 && !el.matches(':disabled'),
  );
  const active = document.activeElement;
  if (items.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const outside = !active || active === container || !container.contains(active);
  if (event.shiftKey && (outside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (outside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}
