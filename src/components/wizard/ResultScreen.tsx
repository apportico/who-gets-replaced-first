// The result screen. R10, R11, R12, R14, R15, R16 and R18 all land here.
//
// R14 is the one to read first: **there is no year on this screen.** No
// projected date, no interval band, no adoption slider, and no placeholder
// where they sat. R13 is `[!]` — probed 2026-08-31, nothing publishes a
// displacement date per occupation — so the screen is built to read as finished
// without one rather than as a page with a hole in it. The copy says so out
// loud, because a reader who arrived expecting a date deserves to be told why
// there isn't one rather than left to assume it failed to load.
//
// R3/R4 — this is one of the two places Radix earns its keep. `AccordionTrigger`
// supplies the disclosure's `aria-expanded`, its `aria-controls`/`id` pairing
// and its keyboard handling; getting those wrong is silent, producing a panel
// that looks fine and cannot be operated without a mouse. Spec 0008 was entirely
// about that class of failure. The hand-rolled button this replaced had
// `aria-expanded` and nothing else.
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
  from '@/components/ui/accordion'
import Sparkline from '@/components/Sparkline'
import CopyLink from './CopyLink'
import { groupShare, groupHeadcount } from '@/utils/groupFigures'
import { trendFor } from '@/utils/trend'
import { classificationNotice } from '@/utils/classification'
import { termsFor } from '@/utils/terms'
import {
  BACKTEST_NOTE, backtestFor, tierFor, pct, signedPp, POOLED,
  FIT_START_YEAR, FIT_END_YEAR, TARGET_YEAR,
  ELIGIBLE_COUNTRIES, COUNTRIES_WITH_SERIES,
} from '@/utils/backtest'
import { groupByNumber } from '@/utils/isco'
import { ageBands, eduBands } from '@/utils/crossTabs'
import { qualityTone } from '@/utils/laborMetrics'
import { PRESENT, LOAD_FAILED, NOT_LOADED, absenceMessage } from '@/utils/absence'
import ShareCardButton from './ShareCardButton'

function Figure({ label, result, note }) {
  return (
    <div className="wz-card" style={{ padding: '18px 16px' }}>
      <span className="wz-meta" style={{ letterSpacing: '0.16em', color: 'var(--muted)' }}>
        {label}
      </span>
      {result.state === PRESENT ? (
        <>
          <p className="wz-stat">{result.display}</p>
          <span className="wz-badge" style={{ marginTop: 10 }}>{result.tier}</span>
          {result.year && (
            <span className="wz-badge" style={{ marginTop: 10, marginLeft: 6 }}>{result.year}</span>
          )}
          {note && <p className="wz-note" style={{ margin: '8px 0 0' }}>{note}</p>}
        </>
      ) : (
        // Not a dash and not a zero: a sentence saying which figure is missing
        // and why. This is R10's withdrawal — step 01 may have tagged this
        // country `official series` on the strength of another group.
        <p className="wz-note" style={{ margin: '10px 0 0', color: 'var(--muted-strong)' }}>
          {result.message ?? 'Not published.'}
        </p>
      )}
    </div>
  )
}


export default function ResultScreen({ row, group, age, edu, cross, onRestart, onBack }) {
  const g = groupByNumber(group)
  const share = groupShare(row, group)
  const head = groupHeadcount(row, group)
  const trend = trendFor(row?.iso3, group)
  const notice = classificationNotice(row, group)
  const data = cross?.state === PRESENT ? cross.data : null
  const terms = termsFor(row, group, data)
  const quality = qualityTone(row?.data_quality_flag)
  const backtest = backtestFor(row?.iso3, group)

  const ages = data ? ageBands(data, group) : null
  const edus = data ? eduBands(data, group) : null
  const chosenAge = ages?.state === PRESENT ? ages.bands.find((b) => b.key === age) : null
  const chosenEdu = edus?.state === PRESENT ? edus.bands.find((b) => b.key === edu) : null

  const subject = [g?.label, row?.country_name].filter(Boolean).join(' · ')

  return (
    <div className="wz-pad wz-step" style={{ paddingBottom: 40 }}>
      <p className="wz-meta" style={{ margin: '32px 0 0', lineHeight: 1.6, color: 'var(--muted)', whiteSpace: 'normal' }}>
        {subject}
      </p>

      <h1 className="wz-h2" style={{ marginTop: 14, fontSize: 40 }}>
        {share.state === PRESENT
          ? <>{share.display} of {row.country_name}&apos;s workers</>
          : <>No published figure</>}
      </h1>

      {/* R14. Said plainly, at the top, rather than left as an absence the
          reader has to notice. */}
      <p className="wz-caveat" style={{ marginTop: 18 }}>
        No displacement date is published for any occupation, anywhere — so this
        page does not state one. What follows is what the statistics record.
      </p>

      {/* R18 */}
      {notice && (
        <p className="wz-note" style={{ margin: '18px 0 0', color: 'var(--muted-strong)' }}>
          {notice.text}
        </p>
      )}

      {/* R15 */}
      {row?.data_quality_flag && row.data_quality_flag !== 'complete' && (
        <p className="wz-note" style={{ margin: '12px 0 0' }}>
          Coverage for this country is flagged <strong>{quality.label}</strong>. Figures
          below are reported as published, and gaps are shown as gaps.
        </p>
      )}

      {/* R10 + R11 */}
      <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Figure label="Share today" result={share} note={share.state === PRESENT ? `of employment, ${share.year}` : null} />
        <Figure label="People doing it" result={head} note={head.state === PRESENT ? head.note : null} />
      </div>

      {/* the chosen bands, if any */}
      {(chosenAge || chosenEdu) && (
        <div className="wz-card" style={{ marginTop: 10 }}>
          <span className="wz-meta" style={{ color: 'var(--muted)' }}>Within this group</span>
          {/* Tier first, year second — the order `Figure` uses above, and the
              order a reader has already learned by the time they reach this
              card. These two were the only figures on the screen with no tier
              at all, with the year sitting in the slot where the tier goes, so
              `2021` read as the provenance of the number. The tier was in hand
              the whole time: readBands returns it and step 03 renders it. */}
          {chosenAge && (
            <p className="wz-body" style={{ margin: '10px 0 0', color: 'var(--fg)' }}>
              {chosenAge.value.toFixed(1)}% are aged {chosenAge.label}
              <span className="wz-badge" style={{ marginLeft: 8 }}>{ages.tier}</span>
              <span className="wz-badge" style={{ marginLeft: 6 }}>{ages.year}</span>
            </p>
          )}
          {chosenEdu && (
            <p className="wz-body" style={{ margin: '8px 0 0', color: 'var(--fg)' }}>
              {chosenEdu.value.toFixed(1)}% have {chosenEdu.label.toLowerCase()} education
              <span className="wz-badge" style={{ marginLeft: 8 }}>{edus.tier}</span>
              <span className="wz-badge" style={{ marginLeft: 6 }}>{edus.year}</span>
            </p>
          )}
          <p className="wz-note" style={{ margin: '10px 0 0' }}>
            {chosenAge?.residualNote ?? ages?.residualNote} {chosenEdu ? edus?.residualNote : ''}
          </p>
        </div>
      )}

      {(cross?.state === LOAD_FAILED || cross?.state === NOT_LOADED) && (
        <p className="wz-note" style={{ margin: '10px 0 0' }}>
          {absenceMessage(cross.state)}
        </p>
      )}

      {/* R12 */}
      {trend.show && (
        <div className="wz-card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span className="wz-meta" style={{ color: 'var(--muted)' }}>Share since 2013</span>
            <span className="wz-badge">{trend.tier}</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <Sparkline points={trend.points} markerYear={trend.genaiYear} />
          </div>
          {trend.notice && (
            <p className="wz-note" style={{ margin: '10px 0 0', color: 'var(--accent-soft)' }}>
              {trend.notice}
            </p>
          )}
          <p className="wz-note" style={{ margin: '10px 0 0' }}>
            The dashed line marks the arrival of generative AI. The trend does not bend there.
          </p>
        </div>
      )}

      {/* R16 */}
      <Accordion type="multiple" className="wz-accordion" style={{ marginTop: 22 }}>
        <AccordionItem value="method">
          <AccordionTrigger>How the number is built</AccordionTrigger>
          <AccordionContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {terms.map((t) => (
                <div key={t.name}>
                  <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 16, color: 'var(--fg-strong)' }}>
                    {t.name}
                    <span
                      className="wz-badge"
                      style={t.unsourced || !t.sourced
                        ? { background: 'var(--accent-tint)', color: 'var(--accent-soft)', borderColor: 'var(--accent-edge)' }
                        : undefined}
                    >
                      {t.tier ?? 'not sourced'}
                    </span>
                    {t.year && <span className="wz-badge">{t.year}</span>}
                  </p>
                  <p className="wz-note" style={{ margin: '4px 0 0' }}>{t.desc}</p>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="backtest">
          <AccordionTrigger>What this cannot tell you</AccordionTrigger>
          <AccordionContent>
            <p className="wz-body" style={{ margin: 0, color: 'var(--muted-strong)' }}>
              {BACKTEST_NOTE}
            </p>

            {/* 0017 R7. The measurement behind the refusal, and R14 still
                holds: there is no year in here either. */}
            <div className="wz-card" style={{ marginTop: 16 }}>
              {/* wrap, not nowrap: `.wz-meta` does not wrap by default, and this
                  eyebrow is long enough to push the badge past the card edge at
                  375px — it clipped to "MODEL" before this. */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 10, flexWrap: 'wrap',
              }}>
                <span className="wz-meta" style={{ color: 'var(--muted)', whiteSpace: 'normal' }}>
                  Fit {FIT_START_YEAR}–{FIT_END_YEAR}, predict {TARGET_YEAR}
                </span>
                <span className="wz-badge">{tierFor('retrodicted_2025_pct')}</span>
              </div>

              {backtest.scored ? (
                <>
                  <p className="wz-body" style={{ margin: '12px 0 0', color: 'var(--fg)' }}>
                    For {g?.label.toLowerCase()} in {row.country_name}, the trend fitted to{' '}
                    {FIT_START_YEAR}–{FIT_END_YEAR} predicted{' '}
                    <strong>{pct(backtest.retrodicted_2025_pct)}</strong> for {TARGET_YEAR}.
                    <span className="wz-badge" style={{ marginLeft: 8 }}>
                      {tierFor('retrodicted_2025_pct')}
                    </span>
                  </p>
                  <p className="wz-body" style={{ margin: '8px 0 0', color: 'var(--fg)' }}>
                    The published figure is <strong>{pct(backtest.observed_2025_pct)}</strong>.
                    <span className="wz-badge" style={{ marginLeft: 8 }}>
                      {tierFor('observed_2025_pct')}
                    </span>
                  </p>
                  <p className="wz-note" style={{ margin: '10px 0 0' }}>
                    Out by {signedPp(backtest.error_pp)}
                    {backtest.direction_correct === false
                      ? ', and in the wrong direction — the model expected this group to move the other way.'
                      : '.'}
                  </p>
                </>
              ) : (
                <p className="wz-body" style={{ margin: '12px 0 0', color: 'var(--muted-strong)' }}>
                  {row?.country_name ? `${row.country_name} cannot be back-tested` : 'This country cannot be back-tested'}
                  {' '}for this group: it has no published {TARGET_YEAR} figure to score a
                  prediction against, or too short a run of years to fit one. Only{' '}
                  {ELIGIBLE_COUNTRIES} of the {COUNTRIES_WITH_SERIES} countries with an
                  occupation series can be. No figure is shown here rather than one
                  borrowed from elsewhere.
                </p>
              )}

              <p className="wz-note" style={{ margin: '14px 0 0', color: 'var(--accent-soft)' }}>
                Across all {POOLED.n} country-and-group pairs that can be scored, that
                model is out by {POOLED.mae_pp.toFixed(2)}pp on average — worse than the{' '}
                {POOLED.persistence_mae_pp.toFixed(2)}pp you get by assuming nothing changes
                at all — and it gets the direction of travel wrong{' '}
                {POOLED.direction_wrong_n} times out of {POOLED.n}.
              </p>
              <p className="wz-note" style={{ margin: '10px 0 0' }}>
                The share is a net figure: it bundles displacement with demand growth,
                offshoring, ageing and reclassification. A model reading the net and
                calling it displacement measures the wrong thing, which is why this page
                gives you no date.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* 0016 R8. Above "Start again" on purpose: this screen's whole output is
          the cell the reader landed on, and sending it to someone is the thing
          they are most likely to want next. Starting over is the retreat. */}
      <CopyLink />

      {/* 0015 R5. Above "start again", because the reader who has just read
          the figures is the one who wants to keep them. */}
      <ShareCardButton row={row} group={group} />

      {/* 0015 R8. A real link with an href, not a scripted navigation: it has
          to survive being opened in a new tab, and be followed by a crawler.
          One click from the result, which is what #78 asks for and what a
          third accordion would not have been. */}
      <a
        href="methodology.html"
        className="wz-option"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 10, minHeight: 'var(--tap-option)', textDecoration: 'none',
        }}
      >
        How these numbers are made, and what we refuse to say →
      </a>

      {/* 0014 R1. Back and Start again are different moves and sit side by side
          rather than one replacing the other: back returns to step 03 with every
          answer intact, Start again clears the occupation, age and education.
          (It leaves the country -- probed 2026-09-01, and left alone: changing
          that is this spec's Non-goal.) This screen has no `wz-footer`, so the
          row stays inline where Start again already was, below the three things
          0015 and 0016 put between the figures and the retreat. */}
      <div className="wz-actions" style={{ marginTop: 22 }}>
        <button
          type="button"
          className="wz-back"
          onClick={onBack}
          aria-label="Back to the optional questions"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="wz-tertiary"
          style={{
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-pill)', minHeight: 'var(--tap-option)',
          }}
        >
          Start again
        </button>
      </div>
    </div>
  )
}
