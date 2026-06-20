/**
 * VNG brand mark — the light-blue rounded "loop" with the dark-navy VNG wordmark
 * (Vereniging van Nederlandse Gemeenten). Recreated as a self-contained SVG (no
 * official asset was available in the repos); brand colours approximated:
 * loop #009BDC, wordmark #162C68. If the official VNG logo SVG/PNG becomes
 * available, drop it in `frontend/vng/public/` and swap this for an <img>.
 */
export function VngLogo({
  className,
  title = 'VNG',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 100"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Rounded "loop" outline */}
      <rect
        x="7"
        y="7"
        width="186"
        height="86"
        rx="43"
        ry="43"
        fill="none"
        stroke="#009BDC"
        strokeWidth="13"
      />
      {/* Wordmark */}
      <text
        x="100"
        y="54"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'Inter', Arial, Helvetica, sans-serif"
        fontWeight="800"
        fontSize="56"
        letterSpacing="-1"
        fill="#162C68"
      >
        VNG
      </text>
    </svg>
  );
}
