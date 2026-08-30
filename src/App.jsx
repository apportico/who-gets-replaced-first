import Header from './components/Header'
import LaborPage from './components/LaborPage'

export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-white text-[var(--text-primary)] overflow-hidden">
      <Header />
      <LaborPage />
    </div>
  )
}
