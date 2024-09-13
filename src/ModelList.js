import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Chip, Card, CardContent, CardMedia, Grid } from '@mui/material';
import { FixedSizeList } from 'react-window'; // For virtualization

const ModelList = ({ modelOptions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [listHeight, setListHeight] = useState(400); // Default height

  // Task options for chips
  const taskOptions = ['Computer Vision', 'NLP'];

  // Filter models by search term and selected task
  const filteredModels = modelOptions.filter((model) => {
    const matchesSearch = model.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTask = selectedTask === '' || model.task === selectedTask;
    return matchesSearch && matchesTask;
  });

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  // Handle Chip click
  const handleTaskClick = (task) => {
    setSelectedTask(task === selectedTask ? '' : task); // Toggle task selection
  };

  // Row rendering function for react-window
  const renderRow = ({ index, style }) => {
    const item = filteredModels[index];
    
    const handleClick = () => {
      // Open the model page in a new tab
      window.open(`models/?model=${item.name}`, '_blank', 'noopener,noreferrer');
    };

    return (
      <Grid item xs={12} key={index} style={style}>
        <Card 
          sx={{ 
            display: 'flex', 
            width: '100%', 
            cursor: 'pointer', 
            transition: 'background-color 0.3s, box-shadow 0.3s', // Smooth transition
            '&:hover': {
              backgroundColor: '#f5f5f5', // Change background color on hover
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)', // Add a subtle shadow
            }
          }} 
          onClick={handleClick}
        >
          {/* Left side with text, fixed width */}
          <CardContent sx={{ flexBasis: '220px', flexShrink: 0 }}>
            <Typography variant="h6">{item.name}</Typography>
            <Typography variant="body2" color="textSecondary">{item.library}</Typography>
          </CardContent>

          {/* Right side with the image, takes remaining space */}
          <CardMedia
            component="img"
            sx={{
              flexGrow: 1, // Make this component take up the remaining space
              height: '100px',
              objectFit: 'cover',
              objectPosition: 'left'
            }}
            image={`${process.env.PUBLIC_URL}/data/model_thumbnails/darkspark_thumbnail_${item.name}.png`} 
            alt={item.name}
          />
        </Card>
      </Grid>
    );
  };

  // Calculate available height for the list based on window height
  useEffect(() => {
    const calculateListHeight = () => {
      const availableHeight = window.innerHeight - 380; // Subtract any static content height (like AppBar and margins)
      setListHeight(availableHeight);
    };

    // Calculate on mount
    calculateListHeight();

    // Recalculate on window resize
    window.addEventListener('resize', calculateListHeight);

    // Cleanup the event listener on component unmount
    return () => window.removeEventListener('resize', calculateListHeight);
  }, []);

  return (
    <Box sx={{ backgroundColor: '#e0e0e0', padding: '20px', borderRadius: '8px', height: '100%' }}>
      <Typography variant="h5" gutterBottom>
        Explore pre-traced models
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        timm, HF Transformers, HF Diffusers, Torchvision, and more
      </Typography>

      {/* Search Field */}
      <TextField
        label="Search models"
        variant="outlined"
        fullWidth
        margin="normal"
        value={searchTerm}
        onChange={handleSearchChange}
      />

      {/* Task Chips */}
      {/* <Box sx={{ display: 'flex', gap: 1, marginBottom: 2 }}>
        {taskOptions.map((task) => (
          <Chip
            key={task}
            label={task}
            clickable
            color={selectedTask === task ? 'primary' : 'default'}
            onClick={() => handleTaskClick(task)}
          />
        ))}
      </Box> */}

      {/* Virtualized List */}
      <Box sx={{ height: `${listHeight}px`, backgroundColor: '#fff', padding: '20px', borderRadius: '8px' }}> {/* Dynamic height */}
        <FixedSizeList
          height={listHeight}  // Dynamic height
          width="100%"
          itemSize={150} // Approximate height of each item (adjusted for the card size)
          itemCount={filteredModels.length}
        >
          {renderRow}
        </FixedSizeList>
      </Box>
    </Box>
  );
};

export default ModelList;
