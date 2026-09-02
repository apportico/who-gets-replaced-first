// 0015 R5. The control that turns the reader's own result into an image.
//
// Generated in the reader's browser from `shareCardModel`, which is the same
// function tree the screen renders. That is not an implementation convenience:
// it is what stops the card and the screen disagreeing. A build-time or
// server-side generator would be a second derivation of the same figures, and
// the drift would be invisible — an image that contradicts the page still looks
// authoritative, and it is the artefact that travels.
//
// Download is the path that always works. `navigator.share` is offered on top
// where the browser supports sharing files, because on a phone that is the
// gesture a reader actually reaches for; it is never the only route.
import { useState } from 'react'
import { ImageDown } from 'lucide-react'

import { shareCardModel } from '@/utils/shareCard'
import { drawCard, readyFonts, cardFilename } from '@/utils/shareCardCanvas'

const IDLE = 'idle'
const WORKING = 'working'
const FAILED = 'failed'

export default function ShareCardButton({ row, group }) {
  const [state, setState] = useState(IDLE)

  async function make() {
    setState(WORKING)
    try {
      // Before drawing, not after. A canvas silently substitutes a fallback
      // face rather than erroring, so the wait is the only thing between this
      // and a card that is correct in content and wrong in every typeface.
      await readyFonts()
      // 0015 R6, composed with 0016. When this was written the site had no
      // result URLs, so R6 recorded that the card would carry the site root
      // and "must not imply it already has one". 0016 landed mid-run and the
      // result is addressable now, so the card carries the reader's actual
      // result link — which is the difference between an image that sends
      // someone to the intro and one that sends them to the cell it shows.
      // `location.href` is the same source 0016's own CopyLink uses.
      const model = shareCardModel({
        row, group, url: globalThis.location?.href || undefined,
      })
      const { canvas } = drawCard(model)
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('canvas produced no blob')

      const file = new File([blob], cardFilename(model), { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] })
          setState(IDLE)
          return
        } catch (err) {
          // A cancelled share sheet is a choice, not a failure, and must not
          // fall through to a surprise download.
          if (err?.name === 'AbortError') { setState(IDLE); return }
        }
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setState(IDLE)
    } catch {
      setState(FAILED)
    }
  }

  return (
    <div style={{ marginTop: 22 }}>
      <button
        type="button"
        onClick={make}
        className="wz-option"
        disabled={state === WORKING}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, width: '100%', minHeight: 'var(--tap-option)',
        }}
      >
        <ImageDown size={17} aria-hidden="true" />
        {state === WORKING ? 'Drawing the card…' : 'Save this as an image'}
      </button>
      {state === FAILED && (
        <p className="wz-note" style={{ margin: '8px 0 0' }}>
          The image could not be generated in this browser. Everything it would
          have carried is on this page.
        </p>
      )}
      <p className="wz-note" style={{ margin: '8px 0 0' }}>
        A 1200×630 card carrying these figures, their tiers and the caveats
        above. It states no date, for the reason given at the top of this page.
      </p>
    </div>
  )
}
