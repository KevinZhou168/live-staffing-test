// Import required modules
const express = require('express'); // Express framework for handling HTTP requests
const { createServer } = require('node:http'); // Node.js HTTP server
const { join } = require('node:path'); // Utility for handling file paths
const { Server } = require('socket.io'); // Socket.IO for real-time communication
const registerSocketHandlers = require('./server/logic/socketHandler'); // Function to register socket event handlers

// Create an Express application
const app = express();

// Create an HTTP server and attach the Express app
const server = createServer(app);

// Create a Socket.IO server and attach it to the HTTP server
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(join(__dirname, 'public')));

// Handle the root route and serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// Register all socket event handlers
registerSocketHandlers(io);

// Start the server and listen on port 3000
server.listen(3000, () => {
  console.log('server running at http://localhost:3000'); // Log the server URL
});