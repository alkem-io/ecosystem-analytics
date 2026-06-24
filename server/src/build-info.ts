import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Build provenance shown in the in-app About dialog (FR: deployment verification). */
export interface BuildInfo {
  /** ISO-8601 image build timestamp, or null if unknown (e.g. local dev). */
  time: string | null;
  /** Short git commit the image was built from, or null if unknown. */
  commit: string | null;
}

let cached: BuildInfo | null = null;

/**
 * Resolve build provenance. The Docker image writes the build timestamp to
 * `build-time.txt` (working dir) and passes the commit via the BUILD_COMMIT
 * env (CI `--build-arg`). Both fall back to null when running outside an image.
 */
export function getBuildInfo(): BuildInfo {
  if (cached) return cached;

  let time = process.env.BUILD_TIME?.trim() || null;
  if (!time) {
    try {
      const p = join(process.cwd(), 'build-time.txt');
      if (existsSync(p)) time = readFileSync(p, 'utf-8').trim() || null;
    } catch {
      /* ignore — leave null */
    }
  }

  const commitEnv = process.env.BUILD_COMMIT?.trim();
  const commit = commitEnv && commitEnv !== 'unknown' ? commitEnv : null;

  cached = { time, commit };
  return cached;
}
