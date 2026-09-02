// Spec 0019 R17. The Suspense fallback, and therefore what actually lands in
// out/index.html.
//
// The probed behaviour this rests on: "If a route is prerendered, calling
// useSearchParams will cause the Client Component tree up to the closest
// Suspense boundary to be client-side rendered" — so the prerendered HTML for
// the subtree IS this fallback. One island with a static fallback was chosen
// over three sibling islands because it keeps 0016 R10's single navigation
// seam, and because WizardShell writes history directly (pushState /
// replaceState / popstate) while useSearchParams tracks router state: three
// readers would never see the wizard's own writes, one reader consulted once at
// mount is unaffected.
import WizardFrame from './WizardFrame'

export default function WizardChrome() {
  return (
    <div
      className="wz-pad"
      style={{
        width: '100%',
        margin: '0 auto',
        maxWidth: 'var(--column)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <WizardFrame />
    </div>
  )
}
