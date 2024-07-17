import './App.css';
import { app, analytics } from './firebase';
import React, { useState } from 'react';
import Sidebar from './sidebar';
import MainPanel from './main_panel';

const App = () => {
  const [filters, setFilters] = useState({});
  const [dropdownValue, setDropdownValue] = useState(''); // depth
  const [depthValues, setDepthValues] = useState([]); // depth choices


  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <div style={{ userSelect: 'none' }}>
        <Sidebar onFilterChange={setFilters} 
                  setDropdownValue={setDropdownValue} 
                  dropdownValue={dropdownValue}
                  depthValues={depthValues}
                  />
      </div>
      <div className="main-panel">
        <MainPanel filters={filters} setDropdownValue={setDropdownValue} setDepthValues={setDepthValues}/> 
      </div>
    </div>
  );
};

export default App;
