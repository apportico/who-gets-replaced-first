// Spec 0019 R2. methodology.html as an App Router route.
//
// The body is carried across verbatim — this migration moves the page, it does
// not rewrite it. 0015 R2 made this a real page with a real URL so it can be
// linked, opened in a new tab and followed by a crawler, and R2 keeps that
// promise: `trailingSlash: false` emits out/methodology.html, so the published
// og:url below still points at a path the build emits.
import type { Metadata } from 'next'

const DESCRIPTION =
  'How the numbers on Who Gets Replaced First are made — the four tiers, what is measured, what is constructed, and what the model cannot tell you.'

export const metadata: Metadata = {
  title: 'Method \u2014 WHO GETS REPLACED FIRST',
  description: DESCRIPTION,
  openGraph: {
    // See app/page.tsx: a route's openGraph replaces the layout's rather than
    // merging into it, so siteName is repeated here too.
    type: 'article',
    siteName: 'Who Gets Replaced First',
    title: 'Method \u2014 Who Gets Replaced First',
    description: DESCRIPTION,
    url: 'https://apportico.github.io/who-gets-replaced-first/methodology.html',
    images: [{
      url: 'https://apportico.github.io/who-gets-replaced-first/og.png',
      width: 1200,
      height: 630,
      alt: 'Who Gets Replaced First \u2014 official labour statistics for 177 countries, every figure carrying its tier.',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Method \u2014 Who Gets Replaced First',
    description: DESCRIPTION,
    images: ['https://apportico.github.io/who-gets-replaced-first/og.png'],
  },
}

export default function MethodologyPage() {
  return (
    <>

    <main className="wz-pad" style={{ maxWidth: '640px', margin: '0 auto', paddingBottom: '64px' }}>
      <p className="wz-meta" style={{ margin: '32px 0 0', color: 'var(--accent)' }}>
        WHO GETS REPLACED FIRST
      </p>

      <h1 className="wz-h2" style={{ marginTop: '14px' }}>How these numbers are made.</h1>

      <p className="wz-body" style={{ marginTop: '18px', fontSize: '17.5px' }}>
        Every number on this site is labelled with where it came from. That
        labelling is the point of the site, not a disclaimer attached to it: a
        published statistic and an analyst's estimate look identical once they
        are both set in the same typeface, and most of the harm in this subject
        comes from that resemblance.
      </p>

      {/* R2. The four-tier vocabulary, in CLAUDE.md's own words. */}
      <h2 className="wz-h2" style={{ marginTop: '44px', fontSize: '30px' }}>The four tiers</h2>

      <p className="wz-body" style={{ marginTop: '14px' }}>
        Every figure carries exactly one of these, in the data, in the
        documentation, and on the screen. A figure with no tier is not shown.
      </p>

      <div className="wz-card" style={{ marginTop: '18px' }}>
        <p style={{ margin: '0' }}>
          <span className="wz-badge">OFFICIAL</span>
        </p>
        <p className="wz-body" style={{ margin: '8px 0 0' }}>
          A published national statistic, taken as the source published it —
          World Bank, ILOSTAT or Eurostat.
        </p>
      </div>

      <div className="wz-card" style={{ marginTop: '10px' }}>
        <p style={{ margin: '0' }}>
          <span className="wz-badge">DERIVED</span>
        </p>
        <p className="wz-body" style={{ margin: '8px 0 0' }}>
          Arithmetic on official statistics. Nothing is added; the inputs and
          the operation are both stated.
        </p>
      </div>

      <div className="wz-card" style={{ marginTop: '10px' }}>
        <p style={{ margin: '0' }}>
          <span className="wz-badge">PROXY</span>
        </p>
        <p className="wz-body" style={{ margin: '8px 0 0' }}>
          A stand-in for something no source measures globally. A proxy always
          says that it is one, and says what it is standing in for.
        </p>
      </div>

      <div className="wz-card" style={{ marginTop: '10px' }}>
        <p style={{ margin: '0' }}>
          <span className="wz-badge">MODELED</span>
        </p>
        <p className="wz-body" style={{ margin: '8px 0 0' }}>
          Analyst-assigned model output. The AI exposure weights are ours; only
          their rank order is defensible, and that claim rests on a sensitivity
          analysis rather than on assertion — the median country moves four
          places across three different weightings.
        </p>
      </div>

      {/* R2. What each figure on the result screen is built from. */}
      <h2 className="wz-h2" style={{ marginTop: '44px', fontSize: '30px' }}>
        What each figure on the result screen is
      </h2>

      <div className="wz-card" style={{ marginTop: '18px' }}>
        <p style={{ margin: '0', color: 'var(--fg-strong)' }}>
          Share today <span className="wz-badge" style={{ marginLeft: '8px' }}>DERIVED</span>
        </p>
        <p className="wz-body" style={{ margin: '8px 0 0' }}>
          Your occupational group as a share of employment, from the ILOSTAT
          occupation survey, at the ISCO-08 major-group level. The year shown
          beside it is that country's survey vintage, which differs between
          countries. It is never presented as a single-year snapshot of the
          whole row.
        </p>
      </div>

      <div className="wz-card" style={{ marginTop: '10px' }}>
        <p style={{ margin: '0', color: 'var(--fg-strong)' }}>
          People doing it <span className="wz-badge" style={{ marginLeft: '8px' }}>DERIVED</span>
        </p>
        <p className="wz-body" style={{ margin: '8px 0 0' }}>
          The share multiplied by total employment. This is a join of two
          sources that disagree slightly — the ILO survey base and the World
          Bank employment total — and both are named rather than one being
          implied. For the United Kingdom the two bases differ by about 1%.
        </p>
      </div>

      <div className="wz-card" style={{ marginTop: '10px' }}>
        <p style={{ margin: '0', color: 'var(--fg-strong)' }}>
          The trend <span className="wz-badge" style={{ marginLeft: '8px' }}>DERIVED</span>
        </p>
        <p className="wz-body" style={{ margin: '8px 0 0' }}>
          Only one occupational time series is published across countries:
          clerical support workers. For the other eight groups the line is that
          clerical series, shown as a stand-in and labelled as one everywhere it
          appears, including on the share card. An unlabelled clerical line
          under a heading about craft workers would be a real series presented
          as if it were about something else, which is worse for being harder to
          spot.
        </p>
      </div>

      <div className="wz-card" style={{ marginTop: '10px' }}>
        <p style={{ margin: '0', color: 'var(--fg-strong)' }}>
          Age and education profile
          <span className="wz-badge" style={{ marginLeft: '8px' }}>DERIVED</span>
        </p>
        <p className="wz-body" style={{ margin: '8px 0 0' }}>
          ILOSTAT, cross-tabulated with occupation, carrying its own vintage. A
          band whose published cells describe too little of the group to report
          honestly is withheld and says so, rather than being shown thin.
        </p>
      </div>

      {/* R3. The refusal, in full, as its own section. */}
      <h2 className="wz-h2" style={{ marginTop: '44px', fontSize: '30px' }}>
        What this site refuses to say
      </h2>

      <p className="wz-caveat" style={{ marginTop: '18px' }}>
        No displacement date is published for any occupation, anywhere — so this
        site does not state one, in any tier.
      </p>

      <p className="wz-body" style={{ marginTop: '18px' }}>
        This is the site's main claim to credibility, so it is worth saying in
        full rather than as a footnote. The original design for this project had
        a projected replacement year as its headline output, with an uncertainty
        band and a three-notch adoption slider underneath it. None of that
        shipped.
      </p>

      <p className="wz-body" style={{ marginTop: '14px' }}>
        The reason is a probe, not a preference. On <strong>31 August 2026</strong>
        we went looking for a source that publishes a displacement date per
        occupation, and there is none. The nearest published work is United
        States decadal occupational churn, on United States census
        classifications. That is not ISCO-08, it is not per country, and it is
        not AI displacement — it is the ordinary rate at which occupations turn
        over, measured somewhere else, on a different taxonomy. Presenting it as
        an answer to "when will my job go" would have meant three separate
        substitutions, none of them visible to a reader.
      </p>

      <p className="wz-body" style={{ marginTop: '14px' }}>
        So the result screen is built to read as finished without a date rather
        than as a page with a hole in it, and the share card states none either
        — an image is not an exemption, and it is the artefact most likely to be
        seen with no context at all. Reviving a replacement year as
        <span className="wz-badge">MODELED</span> is not ruled out forever, but it
        would need its own formula, its own sensitivity analysis and its own
        issue, on the precedent already set by the exposure weights. Until then
        the honest output is the absence, stated.
      </p>

      <h2 className="wz-h2" style={{ marginTop: '44px', fontSize: '30px' }}>
        The other things it will not do
      </h2>

      <ul className="wz-body" style={{ marginTop: '14px', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '10px' }}>
          <strong>It never fills in a missing country.</strong> A country with
          no published data is a row of nulls carrying a quality flag, never a
          regional average, an income-group stand-in, or a zero. Forty-one
          countries have no occupational series and the site says so by name
          rather than quietly dropping them.
        </li>
        <li style={{ marginBottom: '10px' }}>
          <strong>It never averages country percentages.</strong> Aggregates are
          weighted by employment and published with the coverage they rest on,
          so partial coverage is visible rather than implied.
        </li>
        <li style={{ marginBottom: '10px' }}>
          <strong>It never tells an individual about their own job.</strong>
          Occupation detail bottoms out at nine major groups worldwide. No
          source supports a claim about a specific role, only about an
          occupational group.
        </li>
        <li style={{ marginBottom: '10px' }}>
          <strong>It claims no back-test.</strong> There is no displacement
          model here to back-test, which is a consequence of the section above
          rather than an oversight.
        </li>
      </ul>

      <p className="wz-note" style={{ marginTop: '32px' }}>
        Every figure, its source, its vintage and its limitations are documented
        in the repository, and the pipeline that produces them runs offline from
        cached responses so the numbers can be reproduced.
      </p>

      <a
        href="./index.html"
        className="wz-option"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '28px', minHeight: 'var(--tap-option)', textDecoration: 'none' }}
      >
        ← Back to the questions
      </a>
    </main>
  
    </>
  )
}
