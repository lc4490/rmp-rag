// Chris Jin 

"use client"
import { useState, useRef, useEffect, useMemo } from "react";
import { TextField, Box, Stack, Button, Paper, Typography, Container, ThemeProvider, createTheme, CssBaseline, IconButton, Tooltip } from "@mui/material";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SendIcon from '@mui/icons-material/Send';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

// Custom theme 
const getTheme = (mode) => createTheme({
  palette: {
    mode,
    primary: {
      main: mode === 'dark' ? '#90caf9' : '#1976d2',
    },
    secondary: {
      main: mode === 'dark' ? '#f48fb1' : '#d81b60',
    },
    background: {
      default: mode === 'dark' ? '#121212' : '#f5f5f5',
      paper: mode === 'dark' ? '#1e1e1e' : '#ffffff',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I'm the Rate My Professor support assistant. How can I help you today?"
    }
  ]);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('light');
  const theme = useMemo(() => getTheme(mode), [mode]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async () => {
    setMessages((messages) => [  
      ...messages,
      {role: "user", content: message},
      {role: "assistant", content: ""}
    ]);
    setMessage('');
    const response = fetch('/api/chat', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([...messages, {role: "user", content: message}])
    }).then(async(res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let result = '';
      return reader.read().then(function processText({done, value}) {
        if (done) {
          return result;
        }
        const text = decoder.decode(value || new Uint8Array(), {stream:true});
        setMessages((messages) => {
          let lastMessage = messages[messages.length-1];
          let otherMessages = messages.slice(0, messages.length-1);
          return [
            ...otherMessages,
            {...lastMessage, content: lastMessage.content + text}
          ];
        });
        return reader.read().then(processText);
      });
    });
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const toggleMode = () => {
    setMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ height: '100vh', display: 'flex', alignItems: 'center' }}>
        <Paper 
          elevation={3} 
          sx={{ 
            width: '100%', 
            height: '80vh', 
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'hidden',
            bgcolor: 'background.paper',
            transition: 'all 0.3s ease-in-out',
          }}
        >
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h5">Rate My Professor Bot</Typography>
            <Tooltip title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
              <IconButton onClick={toggleMode} color="inherit">
                {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>
            </Tooltip>
          </Box>
          <Box 
            sx={{ 
              flexGrow: 1, 
              overflowY: 'auto', 
              p: 2, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 2 
            }}
          >
            {messages.map((message, index) => (
              <Box 
                key={index}
                sx={{ 
                  display: 'flex', 
                  justifyContent: message.role === 'assistant' ? 'flex-start' : 'flex-end',
                  mb: 2,
                }}
              >
                <Paper 
                  elevation={1}
                  sx={{
                    maxWidth: '80%',
                    p: 2,
                    bgcolor: message.role === 'assistant' ? 'primary.main' : 'secondary.main',
                    color: message.role === 'assistant' ? 'primary.contrastText' : 'secondary.contrastText',
                  }}
                >
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({node, ...props}) => <Typography paragraph {...props} />,
                      a: ({node, ...props}) => <Typography component="a" {...props} sx={{wordBreak: 'break-all'}} />,
                      pre: ({node, ...props}) => (
                        <Box component="pre" sx={{
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          maxWidth: '100%',
                        }} {...props} />
                      ),
                      code: ({node, inline, ...props}) => 
                        inline ? 
                          <Typography component="code" {...props} sx={{wordBreak: 'break-all'}} /> : 
                          <Box component="code" sx={{
                            display: 'block',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                            maxWidth: '100%',
                          }} {...props} />,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </Paper>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Box>
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Message"
                fullWidth
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                variant="outlined"
                size="small"
                multiline
                maxRows={4}
              />
              <Button
                variant="contained"
                onClick={sendMessage}
                endIcon={<SendIcon />}
                disabled={!message.trim()}
              >
                Send
              </Button>
            </Stack>
          </Box>
        </Paper>
      </Container>
    </ThemeProvider>
  );
}