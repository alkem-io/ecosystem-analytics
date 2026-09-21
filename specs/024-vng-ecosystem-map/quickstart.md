# Quickstart: VNG Ecosystem Map

**Feature**: 024-vng-ecosystem-map

## Run it

```bash
pnpm install
pnpm run dev            # BFF :4000 + Explorer :5173 + VNG :5174 + GovTech :5175
```
Open http://localhost:5174, sign in, keep the default hub (VIH / `vih-test`), and open the
**Ecosystem** tab (second-to-last, before Graph).

What you should see on first load (nobody has saved a choice yet):
- one cloud labelled "VNG Innovation Hub - Test";
- **Kenniscentrum Innovatie** (`programmagroei`) at the centre, badge "built-in default" —
  it is *not* one of the hub's 23 listed Spaces; the tab fetched it in addition;
- 23 initiative cards on a ring, each with `· N` organisations, joined to the centre by faint
  "part of" lines;
- "VNG Kenniscentrum Innovatie" as a heavily emphasised connector (lead on 20 Spaces), Gemeente
  Amsterdam / Den Haag / Leeuwarden / Tilburg as further connectors, and a long tail of
  single-Space municipalities around the edge.

## Try the orchestrator control

1. Change the select to *Signalen* → map re-centres instantly, badge reads "your choice", the
   Reset button appears, and `programmagroei` now sits on the ring as an initiative.
2. Reload → still Signalen (server-side per user). Sign in on another browser → still Signalen.
3. Sign in as a **different** user → badge "chosen by other viewers", preset Signalen
   (community). Reset on the first user → second user falls back to "built-in default".

## Try the filters

- **Linked to orchestrator** → only organisations with a role on the centre Space remain; the
  hidden count appears.
- **Multiple memberships** → only organisations on ≥2 Spaces remain.
- Both → intersection. Clear → everything back. Switch tab and return → filters and zoom kept.

## Tests

```bash
pnpm -C frontend/vng test              # ecosystem.test.ts, ecosystem-layout.test.ts
pnpm -C server test                    # routes/ecosystem.test.ts (choice store + community)
pnpm -C frontend/vng start &           # then:
pnpm run test:visual                   # tests/vng-ecosystem.spec.mjs + mobile-navigation.spec.mjs
```

## Verify against the live platform (no login needed)

```bash
curl -s https://alkem.io/api/public/graphql -H 'content-type: application/json' -d '{"query":
"{ lookup { innovationHub(ID: \"dd3a25ba-5f6d-4a24-adc4-6df204fae67b\") { spaceListFilter { nameID } } } }"}'
```
Confirms the 23 listed Spaces and that `programmagroei` is absent from the list.
