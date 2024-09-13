import React, { useEffect, useState } from 'react';
import { AppBar, Toolbar, Typography, Button, Box, Grid } from '@mui/material';
import { Google as GoogleIcon, GitHub as GitHubIcon } from '@mui/icons-material'; // Importing icons
import { FcGoogle } from 'react-icons/fc'; // Import the colored Google icon from react-icons

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import ModelList from './ModelList'; 

const LandingPage = () => {
  const [modelOptions, setModelOptions] = useState([]);
  const [user, setUser] = useState(null);

  // Firebase authentication
  const auth = getAuth();

  // Check if the user is logged in on app load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe(); // Clean up the listener on component unmount
  }, [auth]);

  // Login with Google
  const handleGoogleLogin = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
      .then((result) => {
        console.log('Google Sign-in successful:', result);
      })
      .catch((error) => {
        console.error('Google Sign-in error:', error);
      });
  };

  // Login with GitHub
  const handleGithubLogin = () => {
    const provider = new GithubAuthProvider();
    signInWithPopup(auth, provider)
      .then((result) => {
        console.log('GitHub Sign-in successful:', result);
      })
      .catch((error) => {
        console.error('GitHub Sign-in error:', error);
      });
  };

  // Logout function
  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        console.log('User logged out');
        setUser(null);
      })
      .catch((error) => {
        console.error('Sign out error:', error);
      });
  };

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
    <div style={{ height: '100vh' }}> {/* Full height of the viewport */}
      {/* Top Menu Bar */}
      <AppBar position="static" sx={{ backgroundColor: '#333' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            darkspark
          </Typography>

          {/* <Box>
            <Button color="inherit">About</Button>
            <Button color="inherit" href="https://github.com/your-repo">GitHub</Button>
            <Button color="inherit">Contact</Button>
          </Box> */}
        </Toolbar>
      </AppBar>
      
      <Box sx={{ padding: '20px', width: '100vw', height: 'calc(100% - 64px)' }}> {/* Full height minus the AppBar */}
        <Grid container spacing={2} sx={{ height: '100%' }}>
          <Grid item xs={4}>
          <Box sx={{ backgroundColor: '#e0e0e0', padding: '20px', borderRadius: '8px' }}>
              <Typography variant="h5" gutterBottom>View your own model</Typography>
              <Typography variant="subtitle1" gutterBottom>Add one line to trace your PyTorch model and view it locally</Typography>
              <SyntaxHighlighter language="python" style={vscDarkPlus}>
              {code_demo_str}
              </SyntaxHighlighter>

              {/* Sign-up Text */}
              <Typography variant="subtitle1" gutterBottom sx={{ mt: 4, fontStyle: 'italic' }}>
                {user
                  ? `You're logged in as ${user.email}. We'll let you know when the public repo is ready! For now, check out our pretraced models -->`
                  : 'Support for tracing your own models is coming soon. Sign up to get updated when the package is ready!'}
              </Typography>

              {/* Centering and spacing the buttons */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 2 }}>
                {user ? (
                  <Button
                    variant="outlined"
                    sx={{
                      fontSize: '18px',
                      padding: '10px 20px',
                      backgroundColor: 'white', // White background for the logout button
                      color: '#555', // Text color
                      borderColor: '#d9d9d9',
                      '&:hover': {
                        backgroundColor: 'lightgrey', // Slight hover effect
                      },
                    }}
                    onClick={handleLogout}
                  >
                    Logout
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      startIcon={<FcGoogle />} // Multicolored Google icon
                      sx={{
                        fontSize: '18px',
                        padding: '10px 20px',
                        justifyContent: 'flex-start',
                        textTransform: 'none', // Prevent uppercase
                        borderColor: '#d9d9d9',
                        backgroundColor: 'white', //
                        color: '#555', // Text color
                        '&:hover': {
                          borderColor: '#bbb',
                          backgroundColor: 'lightgrey', // Hover effect
                        },
                      }}
                      onClick={handleGoogleLogin}
                    >
                      Sign up with Google
                    </Button>

                    <Button
                      variant="contained"
                      startIcon={<GitHubIcon />} // GitHub Icon
                      sx={{
                        fontSize: '18px',
                        padding: '10px 20px',
                        justifyContent: 'flex-start',
                        textTransform: 'none', // Prevent uppercase
                        backgroundColor: '#333', // Dark GitHub color
                        color: 'white', // White text color
                        '&:hover': {
                          backgroundColor: '#444', // Slight hover effect
                        },
                      }}
                      onClick={handleGithubLogin}
                    >
                      Sign up with GitHub
                    </Button>
                  </>
                )}
              </Box>
            </Box>

          </Grid>

          <Grid item xs={8} sx={{ height: '100%' }}>
            <Box sx={{ height: 'calc(100% - 100px)' }}> {/* Full height for ModelList container */}
              <ModelList modelOptions={modelOptions} />
            </Box>
          </Grid>
        </Grid>
      </Box>
    </div>
  );
};

export default LandingPage;

const code_demo_str = `import darkspark
import timm
import torch

model = timm.create_model("efficientnet_b0")
inputs = torch.randn(1,3,224,224)

with darkspark.Tracer():  # <-- wrap your code with this line
  out = model(inputs)

# interactive diagram now available at localhost
`
