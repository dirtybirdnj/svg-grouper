import { useAppContext } from '../context/AppContext'
import { TABS } from '../types/tabs'
import './TabNavigation.css'

export default function TabNavigation() {
  const { activeTab, setActiveTab, svgContent, fillTargetNodeIds } = useAppContext()

  const isTabDisabled = (tabKey: string) => {
    if (!svgContent && tabKey !== 'sort') return true
    if (tabKey === 'fill' && fillTargetNodeIds.length === 0) return true
    return false
  }

  const getTabTitle = (tabKey: string) => {
    if (!svgContent && tabKey !== 'sort') return 'Load an SVG first'
    if (tabKey === 'fill' && fillTargetNodeIds.length === 0) return 'Select fill layers and use the Fill button'
    return undefined
  }

  return (
    <div className="tab-navigation">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.key)}
          disabled={isTabDisabled(tab.key)}
          title={getTabTitle(tab.key)}
        >
          {tab.icon && <span className="tab-icon">{tab.icon}</span>}
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
