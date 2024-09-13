import React, { useState, useEffect } from 'react';
import { TextField, Autocomplete } from '@mui/material';
import * as utils from './utils'


import { useLocation, useNavigate } from 'react-router-dom';

import { styled, lighten, darken } from '@mui/system';

import { Link } from 'react-router-dom';
import HomeIcon from '@mui/icons-material/Home';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';


const GroupHeader = styled('div')(({ theme }) => ({
  position: 'sticky',
  top: '-8px',
  padding: '4px 10px',
  color: '#1976d2',
  backgroundColor: lighten('#42a5f5', 0.85),
  ...theme.applyStyles('dark', {
    backgroundColor: darken('#1976d2', 0.8),
  }),
}));

const GroupItems = styled('ul')({
  padding: 0,
});

function useQuery() {
  return new URLSearchParams(useLocation().search);
}


const Sidebar = ({ onFilterChange, setDropdownValue, dropdownValue, depthValues, overviewStats }) => {
    
    const navigate = useNavigate();
    const query = useQuery();

    const [modelOptions, setModelOptions] = useState([]);
    let default_model = "efficientnet_b0"
    const [selectedModel, setSelectedModel] = useState(query.get("model") || default_model);

    // depth dropdown
    const handleDropdownChange = (event) => {
        setDropdownValue(event.target.value);
        onFilterChange({ dropdownValue: event.target.value });
    };
    function onSelectModel(model_entry) {
        let model_name = model_entry.name
        setSelectedModel(model_name)
        setIsSidebarOpen(false)
    }
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
            let data_as_array = Object.keys(data).map(model_name => data[model_name])
            console.log(data_as_array)
            const transformers_str_w_emoji = '\u{1F917} Transformers'
            const diffusers_str_w_emoji = '\u{1F917} Diffusers'
            data_as_array.forEach(d => {
                d.library = d?.trace_metadata?.library ?? "none"
                d.library = d.library === "transformers" ? transformers_str_w_emoji : d.library
                d.library = d.library === "diffusers" ? diffusers_str_w_emoji : d.library
            })
            data_as_array.sort((a, b) => {
                const libraryCompare = a.library.localeCompare(b.library, undefined, { sensitivity: 'base' });
                
                if (libraryCompare !== 0) {
                  return libraryCompare;
                }
                
                // Fallback to sorting alphabetically by another field within the same library
                return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            });
              
            setModelOptions(data_as_array);
        });

    }, []);
    

    //////////////////////
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const handleMouseEnter = () => {
        console.log("entering sidebar")
        setIsSidebarOpen(true);
      };
      
      const handleMouseLeave = () => {
        console.log("leaving sidebar")
        setIsSidebarOpen(false);
      };
      
    return (
        <div>

            <div 
              className={`sidebar ${isSidebarOpen ? 'open' : ''}`}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
               
                <Autocomplete id="model" 
                    // value={modelOptions.filter(d => d.name===selectedModel)[0]} 
                    // isOptionEqualToValue={(option, value) => option.label === value}
                    onChange={(event, newValue) => onSelectModel(newValue)}
                    selectOnFocus
                    disableClearable
                    clearOnBlur
                    handleHomeEndKeys
                    options={ modelOptions }
                    getOptionLabel={(option) => option.name}
                    groupBy={(option) => option.library}
                    sx={{ width: '100%' }}
                    renderInput={(params) => <TextField {...params} label="Model" />}
                    renderGroup={(params) => (
                        <li key={params.key}>
                          <GroupHeader>{params.group}</GroupHeader>
                          <GroupItems>{params.children}</GroupItems>
                        </li>
                    )}
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
                
                {/* Home Icon with Tooltip */}
                {/* <Tooltip title="Return to DarkSpark Home" arrow>
                  <IconButton component={Link} to="/" aria-label="return to home">
                    <HomeIcon />
                  </IconButton>
                </Tooltip> */}


                <div className="sidebar-handle">
                    <i className="fas fa-bars"></i>
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
            <div style={{ display: 'flex', 
                        justifyContent: 'space-between',
                        gap: "20px",
                         }}>
                {/* First Column */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'gray' }}>n_params</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{utils.formatNumParams(overviewStats.total_params)}</div>
                </div>
                
                {/* Second Column */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'gray' }}>total time</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{utils.formatLatency(overviewStats.total_latency)}</div>
                </div>
                
                {/* Third Column */}
                <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'gray' }}>peak gpu memory</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{utils.formatMemorySize(overviewStats.max_memory_allocated)}</div>
                </div>
            </div>
        </div>

    </div>

    );
};

export default Sidebar;