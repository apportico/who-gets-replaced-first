import Header from './components/Header'
import LaborPage from './components/LaborPage'

export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-white text-gray-900 overflow-hidden">
      <Header />
      <LaborPage />
    </div>
  )
}
