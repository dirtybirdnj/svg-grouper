import { useAppContext } from '../context/AppContext'
import { TABS } from '../types/tabs'
import './TabNavigation.css'

export default function TabNavigation() {
  const { activeTab, setActiveTab, svgContent } = useAppContext()

  return (
    <div className="tab-navigation">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.key)}
          disabled={!svgContent && tab.key !== 'sort'}
          title={!svgContent && tab.key !== 'sort' ? 'Load an SVG first' : undefined}
        >
          {tab.icon && <span className="tab-icon">{tab.icon}</span>}
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
