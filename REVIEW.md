# Review contract

The passes every change gets, and what each finding is worth. One file, so a
human reviewer and an automated one apply the same rules — the review-pr skill
and the PR workflow both read this rather than restating it.

Introduced by [spec 0003](specs/0003-ai-native-sdlc.md) R3.

## Severities

| Severity | Meaning | Review verdict |
|---|---|---|
| **Blocker** | Breaks a project non-negotiable. The change cannot merge in this form. | `REQUEST_CHANGES` |
| **Bug** | Incorrect behaviour, a logic error, or a validation gap. | `REQUEST_CHANGES` |
| **Missing** | A requirement the spec states, not implemented. | `REQUEST_CHANGES` |
| **Suggestion** | An improvement that does not block merge. | `COMMENT` |

No Blocker, Bug or Missing findings, and every requirement satisfied → `APPROVE`.

## Pass 1 — The data non-negotiables (Blocker)

The highest-severity findings in this repo. Each of these is a Blocker on its
own, and none of them is a matter of taste:

- **A number without a tier.** Every published figure carries `OFFICIAL`,
  `DERIVED`, `PROXY` or `MODELED`, in the data and in the UI.
- **An imputed country.** A country with no data is a row of nulls with a
  `data_quality_flag`. Never a regional average, never an income-group
  stand-in, never a zero.
- **A simple average of country percentages** where a weighted aggregate
  belongs — and an aggregate published without its coverage figure.
- **A manual override without a citation, a year and a retrieval date.**
- **A row presented as a single-year snapshot** when its fields carry different
  vintages.

A reviewer asking for any of these is asking for something this project does
not do. Cite `CLAUDE.md` and decline.

## Pass 2 — Unprobed sources (Blocker)

Code that reads an API or dataset with no row in its spec's *Source
verification* table. A requirement naming an unverified source is not ready to
implement, and code that got written anyway is a Blocker.

## Pass 3 — Requirement coverage (Missing)

Every requirement ID the spec claims this change satisfies is actually
satisfied, and the acceptance criterion was **run**, not asserted. A
requirement marked `[x]` with no evidence is a Missing finding.

`[!]` and `[~]` are correct outcomes. A requirement closed `[!]` with a
recorded reason is not a failure and must not be reported as one.

## Pass 4 — Correctness (Bug)

Does it do what the requirement says? Edge cases, null handling, off-by-one,
error paths. Null handling deserves particular attention here — a null that
becomes a zero is both a bug and a Pass 1 Blocker.

## Pass 5 — Dependency policy (Bug)

The pipeline is **Python standard library only — no pip installs**. The app's
npm dependencies are ordinary, but a new one needs a reason in the PR body.

## Pass 6 — Non-goals (Missing or Suggestion)

Nothing listed in the spec's Non-goals section got built anyway. Report as
Missing when it displaces required work, Suggestion when it is merely extra.

## Pass 7 — Validation coverage (Missing)

New pipeline behaviour is covered by a regression check, a cross-check, or a
test. A data change with nothing that would catch its regression is a Missing
finding.

For UI changes: a passing `npm run build` is not evidence the page renders.
Evidence means the page was loaded and the console read.

## Pass 8 — Consistency (Suggestion)

Does it follow the patterns of the code around it — naming, structure, error
handling? Check neighbouring files before calling something inconsistent.

## Out of scope for review

Do not spend findings on these:

- **Formatting and lint** — `npm run verify` covers it. If lint passes, the
  formatting is correct by definition.
- **Style preference** where the codebase has no established pattern.
- **Work the spec explicitly deferred**, including anything under Non-goals.
- **Speculative future-proofing** for requirements nobody has written.
- **Re-litigating a decision the spec records.** If the spec states a choice
  and its reason, disagreeing with it is an issue to open, not a review finding.
