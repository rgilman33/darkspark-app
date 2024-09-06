import './App.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { app, analytics } from './firebase';
import React, { useState, useEffect } from 'react';
import Sidebar from './sidebar';
import MainPanel from './main_panel';
import LandingPage from './landing_page';

import ReactDOM from 'react-dom';
import { BrowserRouter as Router, Route, useLocation, useNavigate, Routes } from 'react-router-dom';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function Settings() {
  const navigate = useNavigate();
  const query = useQuery();
  const [selectedSetting, setSelectedSetting] = useState(query.get("setting") || "Option1");

  useEffect(() => {
    // Update the URL query parameter whenever the selected setting changes
    navigate(`?setting=${selectedSetting}`, { replace: true });
  }, [selectedSetting, navigate]);

  const handleChange = (event) => {
    setSelectedSetting(event.target.value);
  };

  return (
    <div>
      <h2>Settings</h2>
      <label>
        Choose a setting:
        <select value={selectedSetting} onChange={handleChange}>
          <option value="Option1">Option 1</option>
          <option value="Option2">Option 2</option>
          <option value="Option3">Option 3</option>
        </select>
      </label>
    </div>
  );
}

const App = () => {
  const [filters, setFilters] = useState({});
  const [dropdownValue, setDropdownValue] = useState(''); // depth
  const [depthValues, setDepthValues] = useState([]); // depth choices
  const [overviewStats, setOverviewStats] = useState({'total_params':0, 'total_latency':0, 'max_memory_allocated':0});


  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} /> 
        <Route 
          path="/models" 
          element={
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
        } />
      </Routes>
    </Router>
  );
};

export default App;
