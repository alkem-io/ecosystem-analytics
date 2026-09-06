import { useTranslation } from 'react-i18next';

/**
 * Intake — placeholder.
 *
 * The tab exists so the intake step has a visible home in the navigation while the
 * feature behind it is built. It says so plainly rather than showing an empty frame,
 * which reads as a broken tab rather than an unbuilt one.
 *
 * The illustration is inline SVG rather than an asset: it costs no request, scales at
 * any size, and takes its colours from the app's own tokens so it follows the theme.
 * The subject is deliberately this feature — a funnel drawn solid on the left and left
 * unfinished on the right — rather than a generic construction sign.
 */
export function IntakeTab() {
  const { t } = useTranslation();
  const wip = t('intake.workInProgress', { defaultValue: 'Work in progress' });

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <div className="max-w-sm text-center">
        <svg
          viewBox="0 0 320 190"
          className="mx-auto h-auto w-full max-w-[320px]"
          role="img"
          aria-label={wip}
        >
          {/* The drawing board the funnel is being sketched on. */}
          <rect
            x="8"
            y="8"
            width="304"
            height="140"
            rx="10"
            fill="var(--surface)"
            stroke="var(--border)"
            strokeWidth="1.5"
            strokeDasharray="7 5"
          />

          {/* The funnel: solid where it is finished, dashed where it is not. The upper
              curve stays ABOVE the lower one for the whole span — swap them and the two
              cross into an X rather than closing into a neck. */}
          <path
            d="M34 42 C 78 54, 114 68, 150 74"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M34 116 C 78 104, 114 92, 150 86"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M150 74 C 196 75, 240 76, 284 76"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="7 7"
          />
          <path
            d="M150 86 C 196 85, 240 84, 284 84"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="7 7"
          />

          {/* A few initiatives already in the mouth; the rest are still to come. */}
          <circle cx="62" cy="79" r="13" fill="var(--primary)" fillOpacity="0.85" />
          <circle cx="96" cy="70" r="9" fill="var(--primary)" fillOpacity="0.6" />
          <circle cx="100" cy="94" r="7" fill="var(--primary)" fillOpacity="0.45" />
          <circle cx="126" cy="80" r="6" fill="var(--primary)" fillOpacity="0.3" />
          <circle
            cx="196"
            cy="80"
            r="6"
            fill="none"
            stroke="var(--border)"
            strokeWidth="2"
            strokeDasharray="3 3"
          />

          {/* Hazard band — the one unambiguous "not finished yet" cue. */}
          <defs>
            <pattern
              id="intake-hazard"
              width="16"
              height="16"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="16" height="16" fill="var(--warning)" fillOpacity="0.22" />
              <rect width="8" height="16" fill="var(--warning)" fillOpacity="0.55" />
            </pattern>
          </defs>
          <rect x="8" y="162" width="304" height="18" rx="4" fill="url(#intake-hazard)" />
        </svg>

        <h2 className="mt-5 text-base font-semibold text-foreground">{t('tabs.intake')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('intake.notImplemented', { defaultValue: 'Not yet implemented.' })}
        </p>
      </div>
    </div>
  );
}
