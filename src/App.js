import './App.css';
import { app, analytics } from './firebase';
import React, { useState } from 'react';
import Sidebar from './sidebar';
import MainPanel from './main_panel';

const App = () => {
  const [filters, setFilters] = useState({});
  const [dropdownValue, setDropdownValue] = useState(''); // depth
  const [depthValues, setDepthValues] = useState([]); // depth choices
  const [overviewStats, setOverviewStats] = useState({'total_params':0, 'total_latency':0, 'max_memory_allocated':0});


  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <div style={{ userSelect: 'none' }}>
        <Sidebar onFilterChange={setFilters} 
                  setDropdownValue={setDropdownValue} 
                  dropdownValue={dropdownValue}
                  depthValues={depthValues}
                  overviewStats={overviewStats}
                  />
      </div>
      <div className="main-panel">
        <MainPanel filters={filters} setDropdownValue={setDropdownValue} setDepthValues={setDepthValues} setOverviewStats={setOverviewStats}/> 
      </div>
    </div>
  );
};

export default App;
