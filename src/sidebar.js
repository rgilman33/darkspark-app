import React, { useState, useEffect } from 'react';
import { TextField, Autocomplete } from '@mui/material';

const Sidebar = ({ onFilterChange, setDropdownValue, dropdownValue, depthValues }) => {
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
            let default_model = Object.keys(data)[0]
            console.log("json loaded", default_model)

            setSelectedModel(default_model) // display name of model

            setModelOptions(data);
            
            // send model path to main panel
            onFilterChange({ 'selectedModelPath': `${process.env.PUBLIC_URL}/data/model_specs/${data[default_model]}.json.gz` })
        });

    }, []);

    return (
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
    );
};

export default Sidebar;