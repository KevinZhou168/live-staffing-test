// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Create an Express app
const app = express();
const server = http.createServer(app);

// Set up Socket.IO
const io = socketIo(server);

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Handle socket connections
io.on('connection', (socket) => {
  console.log('A user connected');

  // Listen for messages from clients
  socket.on('message', (data) => {
    console.log(data);
    
    // Broadcast the message to all connected clients
    io.emit('message', data);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
