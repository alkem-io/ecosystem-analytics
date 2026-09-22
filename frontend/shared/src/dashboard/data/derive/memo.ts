/**
 * Feature 025 — memoisation for layer 2 (derivations).
 *
 * A derivation is a pure function of the loaded dataset plus a few small inputs. It is
 * cached per DATASET IDENTITY (a `WeakMap`, so a replaced dataset frees its results) and
 * per stable serialisation of the other inputs, which gives every tab the same object
 * for the same question and makes a tab switch free (FR-006).
 */
import type { GraphDataset } from '@server/types/graph.js';

type Inputs = Record<string, unknown> | undefined;

function inputsKey(inputs: Inputs): string {
  if (!inputs) return '';
  // Sort keys so `{a,b}` and `{b,a}` share a slot; arrays keep their order (it matters).
  return JSON.stringify(inputs, Object.keys(inputs).sort());
}

/**
 * Wrap a pure `(dataset, inputs) => result` so repeated calls with the same dataset
 * identity and equal inputs return the SAME result object.
 */
export function memoiseByDataset<I extends Inputs, R>(
  fn: (dataset: GraphDataset, inputs: I) => R,
): (dataset: GraphDataset, inputs: I) => R {
  const cache = new WeakMap<GraphDataset, Map<string, R>>();
  return (dataset, inputs) => {
    let slots = cache.get(dataset);
    if (!slots) {
      slots = new Map();
      cache.set(dataset, slots);
    }
    const key = inputsKey(inputs);
    if (slots.has(key)) return slots.get(key) as R;
    const result = fn(dataset, inputs);
    slots.set(key, result);
    return result;
  };
}
