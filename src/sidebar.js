import React, { useState, useEffect } from 'react';
import { TextField, Autocomplete } from '@mui/material';
import * as utils from './utils'


import { useLocation, useNavigate } from 'react-router-dom';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}


const Sidebar = ({ onFilterChange, setDropdownValue, dropdownValue, depthValues, overviewStats }) => {
    
    const navigate = useNavigate();
    const query = useQuery();

    const [modelOptions, setModelOptions] = useState({});
    let default_model = "efficientnet_b0"
    const [selectedModel, setSelectedModel] = useState(query.get("model") || default_model);

    // depth dropdown
    const handleDropdownChange = (event) => {
        setDropdownValue(event.target.value);
        onFilterChange({ dropdownValue: event.target.value });
    };
    
    // url parameters
    useEffect(() => {
      // Update the URL query parameter whenever the selected setting changes
      console.log("url change", selectedModel)
      navigate(`?model=${selectedModel}`, { replace: true });

      // send model path to main panel
      onFilterChange({ 'selectedModelPath': `${process.env.PUBLIC_URL}/data/model_specs/${selectedModel}.json.gz` })

    }, [selectedModel, navigate]);

    // load model specs table of contents
    useEffect(() => {
        fetch(`${process.env.PUBLIC_URL}/data/model_specs_overview.json`) // overview index not compressed
        .then(response => response.json())
        .then(data => {
            setModelOptions(data);
        });

    }, []);

    return (
        <div>

            <div className="sidebar">

                <Autocomplete id="model" 
                    value={selectedModel} 
                    isOptionEqualToValue={(option, value) => option.label === value}
                    onChange={(event, newValue) => setSelectedModel(newValue['label'])}
                    selectOnFocus
                    clearOnBlur
                    handleHomeEndKeys
                    options={
                        Object.keys(modelOptions).map(model_name => (
                            {'label': model_name, 'value':modelOptions[model_name]}
                        ))
                    }
                    sx={{ width: '100%' }}
                    renderInput={(params) => <TextField {...params} label="Model" />}
                />
            
                <div className="form-control">
                    <label htmlFor="dropdown">Depth</label>
                    <select id="dropdown" value={dropdownValue} onChange={handleDropdownChange}>
                    {depthValues.map(i => (
                        <option key={i} value={i}>
                        {i}
                        </option>
                    ))}
                    </select>
                </div>
            </div>
        <div style={{ padding: '20px', 
                        fontFamily: 'Arial, sans-serif',
                        position: 'fixed',
                        left: '50px',
                        bottom: '50px',
                        width: 'auto',
                        height: 'auto',
                        zIndex: 3,
                        fontSize: 'xx-large',
                        paddingLeft: '20px',
                        paddingRight: '20px',
                        paddingTop: '10px',
                        paddingBottom: '10px',
                        
                        }}>
            {/* Title Row */}
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '36px', margin: 0 }}>{selectedModel.toUpperCase()}</h1>
            </div>
            
            {/* Content Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {/* First Column */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'gray' }}>n_params</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{utils.formatNumParams(overviewStats.total_params)}</div>
                </div>
                
                {/* Second Column */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'gray' }}>latency</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{overviewStats.total_latency.toFixed(0)+'ms'}</div>
                </div>
                
                {/* Third Column */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'gray' }}>gpu memory</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{utils.formatMemorySize(overviewStats.max_memory_allocated)}</div>
                </div>
            </div>
        </div>

    </div>

    );
};

export default Sidebar;