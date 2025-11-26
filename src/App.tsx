import './App.css'
import { AppProvider, useAppContext } from './context/AppContext'
import TabNavigation from './components/TabNavigation'
import { SortTab, FillTab, ExportTab } from './components/tabs'

function AppContent() {
  const { activeTab } = useAppContext()

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-icon">📐</span>
          <h1>SVG Grouper</h1>
        </div>
        <TabNavigation />
      </header>
      <div className="app-content">
        {activeTab === 'sort' && <SortTab />}
        {activeTab === 'fill' && <FillTab />}
        {activeTab === 'export' && <ExportTab />}
      </div>
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

export default App
