import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2 } from 'lucide-react';
import { cn } from '@ea/shared';

/* ──────────────────────────────────────────────────────────────────────────────
   Layout A building blocks: one floating tooltip for every chart, the card frame and
   the legend. Kept deliberately small — the charts compose them.
   ────────────────────────────────────────────────────────────────────────────── */

/** A list of names under a coloured heading (Groei / GemeenteDelers). */
export interface TipNames {
  heading: string;
  color: string;
  names: string[];
}

export interface TipContent {
  title: string;
  /** An avatar/logo URL shown before the title (gemeenten). */
  image?: string | null;
  /** Fallback initial when there is no image. */
  initial?: string;
  rows?: [string, string | number][];
  lines?: string[];
  names?: TipNames[];
}

interface TipApi {
  show: (e: ReactMouseEvent | MouseEvent, content: TipContent) => void;
  move: (e: ReactMouseEvent | MouseEvent) => void;
  hide: () => void;
}

const TipContext = createContext<TipApi | null>(null);
const MAX_NAMES = 10;

export function TipProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<TipContent | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });

  const place = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = pos.current;
    const b = el.getBoundingClientRect();
    let left = x + 14;
    let top = y + 16;
    if (left + b.width > window.innerWidth - 8) left = x - b.width - 12;
    if (top + b.height > window.innerHeight - 8) top = y - b.height - 12;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;
  }, []);

  const api = useMemo<TipApi>(
    () => ({
      show: (e, c) => {
        pos.current = { x: e.clientX, y: e.clientY };
        setContent(c);
        requestAnimationFrame(place);
      },
      move: (e) => {
        pos.current = { x: e.clientX, y: e.clientY };
        place();
      },
      hide: () => setContent(null),
    }),
    [place],
  );

  // A scroll moves the chart away from under the pointer: the tooltip goes with it.
  useEffect(() => {
    if (!content) return;
    const hide = () => setContent(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [content]);

  return (
    <TipContext.Provider value={api}>
      {children}
      {content &&
        createPortal(
          <div
            ref={ref}
            role="tooltip"
            className="pointer-events-none fixed z-[120] max-w-[300px] rounded-lg border border-border bg-card px-3 py-2 text-xs leading-snug text-muted-foreground shadow-lg"
            style={{ left: -999, top: -999 }}
          >
            <TipBody c={content} />
          </div>,
          document.body,
        )}
    </TipContext.Provider>
  );
}

function TipBody({ c }: { c: TipContent }) {
  return (
    <>
      <div className="flex items-center gap-2">
        {(c.image || c.initial) &&
          (c.image ? (
            <img
              src={c.image}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full border border-border bg-card object-cover"
            />
          ) : (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
              {c.initial}
            </span>
          ))}
        <b className="text-[13px] font-semibold text-foreground">{c.title}</b>
      </div>
      {c.lines?.map((l) => (
        <div key={l} className="mt-0.5">
          {l}
        </div>
      ))}
      {c.rows?.map(([k, v]) => (
        <div key={k} className="mt-0.5 flex justify-between gap-5">
          <span>{k}</span>
          <span className="font-semibold tabular-nums text-foreground">{v}</span>
        </div>
      ))}
      {c.names?.map((n) => (
        <div key={n.heading} className="mt-2">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
            <i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: n.color }} />
            {n.heading}
            <em className="ml-auto pl-4 font-medium not-italic text-muted-foreground">{n.names.length}</em>
          </div>
          {n.names.length > 0 && (
            <ul className="mt-0.5 list-disc pl-3.5 marker:text-border">
              {n.names.slice(0, MAX_NAMES).map((name) => (
                <li key={name} className="truncate">
                  {name}
                </li>
              ))}
              {n.names.length > MAX_NAMES && (
                <li className="-ml-3.5 list-none">+ {n.names.length - MAX_NAMES} meer</li>
              )}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

/** Spread onto any element (HTML or SVG) to give it a tooltip. */
export function useTip() {
  const api = useContext(TipContext);
  return useCallback(
    (content: TipContent | (() => TipContent)) => {
      if (!api) return {};
      const get = () => (typeof content === 'function' ? content() : content);
      return {
        onMouseEnter: (e: ReactMouseEvent) => api.show(e, get()),
        onMouseMove: (e: ReactMouseEvent) => api.move(e),
        onMouseLeave: () => api.hide(),
      };
    },
    [api],
  );
}

/** A dashboard card: title, optional subtitle, tools (download), body and footer. */
export function Card({
  title,
  subtitle,
  tools,
  footer,
  className,
  bodyRef,
  children,
  testId,
  source,
}: {
  title: string;
  subtitle?: ReactNode;
  tools?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyRef?: React.Ref<HTMLDivElement>;
  children: ReactNode;
  testId?: string;
  /** Where the numbers come from, right-aligned in the footer. */
  source?: string;
}) {
  return (
    <section
      ref={bodyRef}
      aria-label={title}
      data-testid={testId}
      className={cn(
        'flex min-w-0 flex-col rounded-[10px] border border-border bg-card px-5 py-[18px]',
        className,
      )}
    >
      <div className="mb-3.5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-semibold tracking-[-0.005em] text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {tools && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{tools}</div>}
      </div>
      {children}
      {(footer || source) && (
        <div className="mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-3 text-xs text-muted-foreground">
          {footer}
          {source && (
            <>
              <span className="flex-1" />
              <span className="text-right max-lg:text-left">{source}</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** The icon-only "download chart" button every card carries. */
export function DownloadButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tip = useTip();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      {...tip({ title: label })}
      className={cn(
        'inline-grid h-[30px] w-[30px] place-items-center rounded-md border border-border bg-card text-muted-foreground',
        'transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  shape?: 'square' | 'dot';
  /** Outline the swatch (for white / very light swatches). */
  outline?: boolean;
}

export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-muted-foreground', className)}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <i
            className={cn('inline-block h-2.5 w-2.5 shrink-0', it.shape === 'dot' ? 'rounded-full' : 'rounded-[3px]')}
            style={{ background: it.color, boxShadow: it.outline ? 'inset 0 0 0 1.5px #a9b5c2' : undefined }}
          />
          {it.label}
        </span>
      ))}
    </span>
  );
}

/** Mix a colour towards white (0 = colour, 1 = white) — used for the soft bubble fills. */
export function tint(color: string, amount = 0.74): string {
  return `color-mix(in srgb, ${color} ${Math.round((1 - amount) * 100)}%, white)`;
}
