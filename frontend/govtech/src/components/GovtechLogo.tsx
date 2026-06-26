/**
 * GovTech brand mark — the official Digicampus logo, served as a static asset from
 * `frontend/govtech/public/logo-digicampus-light.svg` (so it resolves at
 * `/logo-digicampus-light.svg` at runtime). It is a wide gradient wordmark, so the
 * caller controls size by height (`h-8 w-auto` etc.) and the width scales to keep
 * the aspect ratio.
 */
export function GovtechLogo({
  className,
  title = 'Digicampus — GovTech Nederland',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <img
      src="/logo-digicampus-light.svg"
      alt={title}
      className={className}
      draggable={false}
    />
  );
}
