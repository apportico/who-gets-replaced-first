# Skills

Project skills for the spec-driven workflow. Ported from the CodeRadar/MergeLeader
setup and adapted to this repo's conventions — numbered specs (`NNNN-name.md`),
requirement IDs, the `[x]` / `[!]` / `[~]` marks, and the data-tier rules in
`CLAUDE.md`.

## The loop

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
