// Spec 0008 R7 — the app's text palette, in one place.
//
// Why this module exists rather than Tailwind's colour scale: the repo runs
// `tailwindcss ^4.2.2` with no `tailwind.config.*` and no `@theme` block, so
// every `text-gray-400` resolves from Tailwind v4's OKLCH default theme. That
// makes a class name's contrast ratio underivable from the class name, which
// means a test cannot check it and a reviewer cannot eyeball it. Two of the
// greys in use were failing WCAG AA and nothing caught it:
//
//   gray-400 #9ca3af  2.54:1 on white  (21 usages, most 10px secondary text)
//   gray-300 #d1d5db  1.47:1 on white  (the disabled play button)
//
// So the colours are pinned here as explicit hex, mirrored into CSS custom
// properties in `src/styles/index.css`, and asserted by `test/palette.test.mjs`
// — which also checks the CSS and this module have not drifted apart.
//
// `on` is the background each colour is *used* against and is what the ratio is
// computed for. The neutrals originally all declared `#ffffff`, but the app
// paints them on the sidebar's `gray-50` panels and the detail panel's
// `gray-100` too, where `faint` fell to 4.39:1 — below AA, at
// `LaborSidebar.jsx:122` among others. They now declare the DARKEST surface
// they are used on, so the assertion checks the worst case rather than the
// flattering one. `large` marks entries whose rendered size qualifies for the 3:1
// large-text threshold; none currently do, because this app's small text is the
// whole problem R7 is about.

/** Text colours. Every entry must clear 4.5:1 against its `on` background. */
export const TEXT = {
  primary: { hex: '#111827', on: '#f3f4f6', large: false, css: '--text-primary' },
  body: { hex: '#374151', on: '#f3f4f6', large: false, css: '--text-body' },
  secondary: { hex: '#4b5563', on: '#f3f4f6', large: false, css: '--text-secondary' },
  muted: { hex: '#5b6270', on: '#f3f4f6', large: false, css: '--text-muted' },
  // The lightest neutral that still clears AA *on gray-100*, which is the
  // darkest surface it is painted on. #6b7280 cleared 4.83 on white but only
  // 4.39 there, so it is darkened rather than left passing against a background
  // the app does not always use.
  faint: { hex: '#646b78', on: '#f3f4f6', large: false, css: '--text-faint' },

  // Tinted roles. Each is paired with its own surface below, because the
  // ratio is meaningless without the background it actually sits on.
  warn: { hex: '#8a5300', on: '#fdf6e7', large: false, css: '--text-warn' },
  caution: { hex: '#9a4200', on: '#fdf1e7', large: false, css: '--text-caution' },
  info: { hex: '#1a4fa0', on: '#e8eefb', large: false, css: '--text-info' },
  accent: { hex: '#6b21a8', on: '#f4e8fb', large: false, css: '--text-accent' },
  alert: { hex: '#a4161a', on: '#fdeaea', large: false, css: '--text-alert' },
};

/** Tinted surfaces, paired with the text roles above. */
export const SURFACE = {
  warn: { hex: '#fdf6e7', css: '--surface-warn' },
  caution: { hex: '#fdf1e7', css: '--surface-caution' },
  info: { hex: '#e8eefb', css: '--surface-info' },
  accent: { hex: '#f4e8fb', css: '--surface-accent' },
  alert: { hex: '#fdeaea', css: '--surface-alert' },
};

// Exempt from the ratio by R7, which allows it for disabled controls — but only
// because disabled state is also carried non-visually. The play button in
// `LaborTimeline` sets the real `disabled` attribute, so assistive tech is told
// regardless of colour. Kept out of TEXT so the test never treats it as
// body text.
export const DISABLED_TEXT = { hex: '#d1d5db', css: '--text-disabled' };
