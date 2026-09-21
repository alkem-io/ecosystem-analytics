/**
 * Built-in per-hub orchestrator defaults (feature 024, FR-008).
 *
 * A DELIBERATE STOPGAP. Alkemio has no way yet to designate which Space orchestrates an
 * innovation hub, so the dashboard ships the handful it knows. Changing this table is a
 * code change and a release (spec clarification Q5) — there is no environment variable
 * and no YAML for it, because the moment the platform can express the relationship this
 * file goes away rather than growing.
 *
 * Keyed by innovation-hub nameID → orchestrator Space nameID.
 *
 * NOTE: `programmagroei` ("Kenniscentrum Innovatie") is NOT one of the Spaces `vih-test`
 * lists — verified against the live platform. That is expected and handled: the
 * Ecosystem tab fetches the resolved orchestrator in addition to the hub's Spaces.
 *
 * The acceptance hub (`vnginnovationhub`) is deliberately absent: viewers there resolve
 * through the community preset and the profile-based guess, which is exactly the path
 * this table is meant to be replaced by.
 */
export const BUILT_IN_ORCHESTRATORS: Readonly<Record<string, string>> = Object.freeze({
  'vih-test': 'programmagroei',
  vih: 'programmagroei',
});

/** The built-in default for a hub, or `null` when the table does not know it. */
export function builtInOrchestrator(hubNameId: string): string | null {
  return BUILT_IN_ORCHESTRATORS[hubNameId] ?? null;
}
