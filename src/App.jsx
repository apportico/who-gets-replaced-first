import Header from './components/Header'
import LaborPage from './components/LaborPage'

export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-white text-[var(--text-primary)] overflow-hidden">
      {/* Spec 0008 R2. The ranking listbox is the keyboard path to a country,
          and it sits at tab stop 57 — behind the whole sidebar. Reachable, but
          only just. This is the standard escape hatch: hidden until focused,
          first in the tab order. */}
      <a
        href="#country-ranking"
        onClick={(e) => {
          // A bare fragment link scrolls the target into view but does not
          // reliably move focus to it, so the next Tab restarts from the top of
          // the document — measured: it landed on <body>. Focusing explicitly is
          // what makes the link actually skip.
          const target = document.getElementById('country-ranking');
          if (!target) return;
          e.preventDefault();
          target.focus();
          target.scrollIntoView({ block: 'nearest' });
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:z-[2000] focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:bg-white focus:rounded focus:shadow-lg focus:text-[var(--text-primary)] focus:text-sm"
      >
        Skip to the country list
      </a>
      <Header />
      {/* Spec 0008 R8. Everything below the banner is the main landmark;
          without it axe reported 23 `region` violations, because no page
          content was inside a landmark at all. */}
      <main className="flex-1 flex flex-col min-h-0">
        <LaborPage />
      </main>
    </div>
  )
}
