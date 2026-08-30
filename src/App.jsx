import Header from './components/Header'
import LaborPage from './components/LaborPage'

export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-white text-[var(--text-primary)] overflow-hidden">
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
