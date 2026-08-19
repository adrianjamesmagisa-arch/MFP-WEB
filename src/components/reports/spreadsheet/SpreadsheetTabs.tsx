import React from 'react'

export type TabType = 'overview' | 'region' | 'province' | 'sdo' | 'coop' | 'all'

export function SpreadsheetTabs({
  activeTab,
  setActiveTab,
  handlePrint,
  hasSdo = true
}: {
  activeTab: TabType
  setActiveTab: (t: TabType) => void
  handlePrint: (t: TabType) => void
  hasSdo?: boolean
}) {
  return (
    <div className="report-nav">
      <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
      <button className={activeTab === 'region' ? 'active' : ''} onClick={() => setActiveTab('region')}>By Region</button>
      <button className={activeTab === 'province' ? 'active' : ''} onClick={() => setActiveTab('province')}>By Province</button>
      {hasSdo && (
        <button className={activeTab === 'sdo' ? 'active' : ''} onClick={() => setActiveTab('sdo')}>By School Division Office</button>
      )}
      <button className={activeTab === 'coop' ? 'active' : ''} onClick={() => setActiveTab('coop')}>Cooperatives / Suppliers</button>
      <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>All Tables</button>
      
      <button className="print-btn" onClick={() => handlePrint(activeTab)}>
        Download {activeTab === 'all' ? 'All Tables' : activeTab === 'overview' ? 'Overview' : activeTab === 'region' ? 'Region' : activeTab === 'province' ? 'Province' : activeTab === 'sdo' ? 'SDO' : 'Cooperatives'} PDF
      </button>
    </div>
  )
}
