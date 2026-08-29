export default function Header() {
  return (
    <header className="bg-white h-12 flex items-center px-4 gap-3 w-full select-none flex-shrink-0 border-b border-gray-200">
      <h1 className="text-base font-bold tracking-wide flex-shrink-0">
        WHO GETS REPLACED FIRST
      </h1>
      <span className="text-[11px] text-gray-400 hidden sm:block truncate">
        Population, work, and occupational exposure to AI — 218 countries
      </span>

      <div className="flex-1" />

      <a
        href="https://github.com/apportico/who-gets-replaced-first"
        target="_blank"
        rel="noreferrer"
        className="text-[11px] text-gray-500 hover:text-gray-900 transition-colors flex-shrink-0"
      >
        Source &amp; method →
      </a>
    </header>
  )
}
