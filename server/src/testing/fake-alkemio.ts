/**
 * A fake of the slice of Alkemio the admin area uses (feature 027 tests only): Spaces by
 * nameID / UUID with classifications and privileges, search, and the selection mutation.
 * Each Space can be made unreadable (FORBIDDEN) to the caller.
 */
import type { AdminSdk } from '../admin/space-lookup.js';

export interface FakeSpace {
  id: string;
  nameID: string;
  level?: 'L0' | 'L1' | 'L2';
  displayName?: string;
  privileges?: string[];
  forbidden?: boolean;
  classifications?: Array<{
    id: string;
    displayLabel: string;
    cardinality: 'SINGLE_SELECT' | 'MULTI_SELECT';
    values: Array<{ id: string; label: string }>;
    selectedValueIDs: string[];
  }>;
}

export const gqlError = (code: string, message = code) =>
  Object.assign(new Error(message), {
    response: { status: 200, errors: [{ message, extensions: { code } }] },
  });

export class FakeAlkemio {
  spaces = new Map<string, FakeSpace>();
  mutationError: unknown = null;
  mutations: Array<{ entryId: string; selectedValueIDs: string[] }> = [];
  /** Called just before a mutation is applied — to simulate a concurrent change. */
  beforeMutation: (() => void) | null = null;

  add(space: FakeSpace): FakeSpace {
    this.spaces.set(space.nameID, { level: 'L0', privileges: ['READ'], classifications: [], ...space });
    return this.spaces.get(space.nameID)!;
  }

  private raw(space: FakeSpace) {
    return {
      id: space.id,
      nameID: space.nameID,
      level: space.level ?? 'L0',
      about: {
        authorization: { myPrivileges: space.privileges ?? [] },
        profile: { displayName: space.displayName ?? space.nameID, url: `https://alkem.io/${space.nameID}` },
        classifications: (space.classifications ?? []).map((c, i) => ({ ...c, sortOrder: i })),
      },
    };
  }

  private find(pred: (s: FakeSpace) => boolean) {
    const space = [...this.spaces.values()].find(pred);
    if (!space) throw gqlError('ENTITY_NOT_FOUND', 'not found');
    if (space.forbidden) throw gqlError('FORBIDDEN_POLICY');
    return this.raw(space);
  }

  sdk(): AdminSdk {
    return {
      AdminSpaceClassifications: async ({ nameId }: { nameId: string }) => ({
        data: { lookupByName: { space: this.find((s) => s.nameID === nameId) } },
      }),
      AdminSpaceClassificationsById: async ({ id }: { id: string }) => ({
        data: { lookup: { space: this.find((s) => s.id === id) } },
      }),
      AdminSpaceSearch: async ({ terms }: { terms: string[] }) => ({
        data: {
          search: {
            spaceResults: {
              results: [...this.spaces.values()]
                .filter((s) => !s.forbidden)
                .filter((s) => terms.some((t) => (s.displayName ?? s.nameID).toLowerCase().includes(t.toLowerCase())))
                .map((s) => ({ type: s.level === 'L0' ? 'SPACE' : 'SUBSPACE', space: this.raw(s) })),
            },
          },
        },
      }),
      UpdateClassificationSelection: async (vars: { entryId: string; selectedValueIDs: string[] }) => {
        this.beforeMutation?.();
        if (this.mutationError) throw this.mutationError;
        for (const s of this.spaces.values()) {
          const entry = s.classifications?.find((c) => c.id === vars.entryId);
          if (entry) entry.selectedValueIDs = [...vars.selectedValueIDs];
        }
        this.mutations.push(vars);
        return { data: { updateClassificationEntrySelection: { id: vars.entryId, selectedValueIDs: vars.selectedValueIDs } } };
      },
    } as unknown as AdminSdk;
  }
}
