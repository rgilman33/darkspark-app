import React, { useState, useEffect } from 'react';
import { TextField, Autocomplete } from '@mui/material';

const Sidebar = ({ onFilterChange, setDropdownValue, dropdownValue, depthValues, overviewStats }) => {
    const [modelOptions, setModelOptions] = useState({});
    const [selectedModel, setSelectedModel] = useState('');

    const handleDropdownChange = (event) => {
        setDropdownValue(event.target.value);
        onFilterChange({ dropdownValue: event.target.value });
    };

    const handleModelChange = (model_entry) => {
        setSelectedModel(model_entry['label']) 
        onFilterChange({ 'selectedModelPath': `${process.env.PUBLIC_URL}/data/model_specs/${model_entry["value"]}.json.gz` })
    };

    useEffect(() => {
        fetch(`${process.env.PUBLIC_URL}/data/model_specs_overview.json`) // overview index not compressed
        .then(response => response.json())
        .then(data => {
            // let default_model = Object.keys(data)[0]
            let default_model = "efficientnet_b0" //"maskrcnn_resnet50_fpn" 
            console.log("json loaded", default_model)

            setSelectedModel(default_model) // display name of model

            setModelOptions(data);
            
            // send model path to main panel
            onFilterChange({ 'selectedModelPath': `${process.env.PUBLIC_URL}/data/model_specs/${data[default_model]}.json.gz` })
        });

    }, []);

    function formatNumParams(num) {
        if (num >= 1e9) {
          return (num / 1e9).toFixed(1) + 'b';
        } else if (num >= 1e6) {
          return (num / 1e6).toFixed(1) + 'm';
        } else if (num >= 1e3) {
          return (num / 1e3).toFixed(1) + 'k';
        } else {
          return num.toFixed(1).toString();
        }
      }

    return (
        <div>

            <div className="sidebar">

                <Autocomplete id="model" 
                    value={selectedModel} 
                    isOptionEqualToValue={(option, value) => option.label === value}
                    onChange={(event, newValue) => handleModelChange(newValue)}
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
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{formatNumParams(overviewStats.total_params)}</div>
                </div>
                
                {/* Second Column */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'gray' }}>latency</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{overviewStats.total_latency.toFixed(0)+'ms'}</div>
                </div>
                
                {/* Third Column */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'gray' }}>something</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>333</div>
                </div>
            </div>
        </div>

    </div>

    );
};

export default Sidebar;