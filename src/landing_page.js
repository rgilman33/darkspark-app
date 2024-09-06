import React, { useEffect, useState } from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Grid, List, ListItem, ListItemText } from '@mui/material';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const LandingPage = () => {
  const [modelOptions, setModelOptions] = useState([]);

  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/data/model_specs_overview.json`)
      .then((response) => response.json())
      .then((data) => {
        let data_as_array = Object.keys(data).map((model_name) => data[model_name]);

        const transformers_str_w_emoji = '\u{1F917} Transformers';
        const diffusers_str_w_emoji = '\u{1F917} Diffusers';
        
        data_as_array.forEach((d) => {
          d.library = d?.trace_metadata?.library ?? "none";
          d.library = d.library === "transformers" ? transformers_str_w_emoji : d.library;
          d.library = d.library === "diffusers" ? diffusers_str_w_emoji : d.library;
        });

        data_as_array.sort((a, b) => {
          const libraryCompare = a.library.localeCompare(b.library, undefined, { sensitivity: 'base' });
          if (libraryCompare !== 0) {
            return libraryCompare;
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        setModelOptions(data_as_array);
      });
  }, []);

  return (
    <div>
      {/* Top Menu Bar */}
      <AppBar position="static" sx={{ backgroundColor: '#333' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            darkspark
          </Typography>

          <Box>
            <Button color="inherit">About</Button>
            <Button color="inherit" href="https://github.com/your-repo">GitHub</Button>
            <Button color="inherit">Contact</Button>
          </Box>
        </Toolbar>
      </AppBar>
      
      {/* Main Content */}
      <Box sx={{ padding: '20px', width: '100vw' }}>
        <Grid container spacing={2} sx={{ width: '100%' }}>
          {/* Left Column: Python Code Snippet */}
          <Grid item xs={6}>
            <Box sx={{ backgroundColor: '#f0f0f0', padding: '20px', borderRadius: '8px' }}>
              <Typography variant="h5" gutterBottom>View your own model</Typography>
              <Typography variant="h8" gutterBottom>Add one line to trace your PyTorch model and view it locally</Typography>
              <SyntaxHighlighter language="python" style={dark}>
                {
                "import darkspark \n"+
                "\n" + 
                "with darkspark.Tracer():\n"+
                "   model(inputs)\n"+
                "# interactive diagram now available at localhost"
                }
              </SyntaxHighlighter>
            </Box>
          </Grid>

          {/* Right Column: Scrollable List of Models */}
          <Grid item xs={6}>
            <Box sx={{ backgroundColor: '#e0e0e0', padding: '20px', borderRadius: '8px', height: '400px', overflowY: 'auto' }}>
              <Typography variant="h5" gutterBottom>Explore pre-traced models</Typography>
              <Typography variant="h8" gutterBottom>We've already traced all the models from timm, hf Transformers, hf Diffusers, Torchvision, and more</Typography>
              <List>
                {modelOptions.map((item, index) => (
                  <ListItem 
                    key={index} 
                    button 
                    component="a" 
                    href={`models/?model=${item.name}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <ListItemText primary={item.name} secondary={item.library} />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </div>
  );
};

export default LandingPage;
