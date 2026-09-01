# Skills

Project skills for the spec-driven workflow. Ported from the CodeRadar/MergeLeader
setup and adapted to this repo's conventions — numbered specs (`NNNN-name.md`),
requirement IDs, the `[x]` / `[!]` / `[~]` marks, and the data-tier rules in
`CLAUDE.md`.

## The loop

```
/sdlc <ticket>  run the whole loop below for one ticket, end to end
```

Or drive it a step at a time:

```
/next          pick the next task off the GitHub board
/spec          probe the sources, write requirements, open a draft PR
/update-spec   approve it — then later mark requirements [x] / [!] / [~]
/implement     turn the approved spec into a plan mapped to requirement IDs
   ...build...
/evaluate      run the acceptance checks, verdict per requirement
/review-pr     review a PR against its spec
/address-reviews  fix, reply and resolve review threads
/status        where everything stands
```

## `/sdlc` — the loop as one command

`/sdlc 27` takes a ticket from the board and runs the whole thing: `/spec`,
review, `/update-spec`, `/implement`, build, `/evaluate`, review, merge — polling
the PR with `/babysit` between phases and fixing feedback with
`/address-reviews`. It stops when the ticket's **goal** is met, not when the PR
merges.

Three things it changes about the individual skills, deliberately:

- **No draft PRs.** `/spec` opens one; `/sdlc` opens it ready. The review
  workflow gates on `draft == false || spec-review`, so a ready PR is reviewed
  either way — and it does not sit in a state nobody looks at.
- **No confirmation prompts.** `/implement` normally waits before executing its
  plan; under `/sdlc` the invocation *was* the confirmation. It asks only at the
  stop conditions in its Step 12.
- **The goal is the stop condition**, held in `/goal`. Derived from the issue's
  `## Definition of done`, or given as `/sdlc 27 /goal <text>`, and mirrored into
  the spec's `**Goal:**` field so a resumed iteration can recover it.

`/sdlc 27 3 min` changes the babysit cadence from the 5-minute default. What it
does *not* relax: source probing, the tier rules, `npm run verify`, and the
requirement marks — a run that cannot satisfy one of those stops and says so.

## What was deliberately not ported

| Skill | Why |
|---|---|
| `clone-db` | Railway + Docker Postgres. This project has no database — the pipeline writes CSV and SQLite locally. |
| `local-auth` | NextAuth JWT cookies for a Next.js app. There is no auth here; the site is static. |
| `pen-test` | Targets a running MergeLeader stack and its security rubric. Nothing to attack in a static GitHub Pages site. |
| `mergeleader-design` | Empty in the source repo, and brand-specific regardless. |

## Adaptations worth knowing

- **`/spec` probes before it specifies.** Step 3 is mandatory and blocks the rest
  of the skill — a requirement naming an unverified source is not ready.
- **`/update-spec` guards the marks.** `[x]` needs the acceptance check actually
  run; `[!]` and `[~]` need a recorded reason. It refuses `in-progress → done`
  while any requirement is still `[ ]`.
- **`/evaluate` runs checks rather than reading the diff.** `npm run pipeline:pilot`
  for data changes; lint + build **and loading the page in Chrome** for app
  changes, because a clean build is not evidence the page renders.
- **`/review-pr` treats the data non-negotiables as top-severity findings** —
  an imputed country, an untiered number, an unweighted aggregate, an
  uncited override.
- **`/next` discovers the owner, repo and project board** instead of hardcoding
  them, and falls back to plain issues when there is no board.
