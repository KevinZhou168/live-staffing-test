const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Store connected users with their names
var users = [];
// Track the index of the currently privileged user
var currentPrivilegedUserIndex = 0;
// Track direction of rotation (true = forward, false = backward)
var movingForward = true;
// Track if the current user is on their second turn (for first/last positions)
var isSecondTurn = false;
// Track if this is the initial turn
var isInitialTurn = true;
// Track if the draft has started
var isDraftStarted = false;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Register user name
  socket.on('register name', (name) => {
    // Check if draft has already started - reject new registrations
    if (isDraftStarted) {
      socket.emit('registration rejected', 'Sorry, the draft has already started. Please try again later.');
      return;
    }
    
    // Add user with name to our array
    const user = { id: socket.id, name: name };
    users.push(user);
    console.log(`User ${name} (${socket.id}) registered`);
    
    // Send updated users list to everyone in the lobby
    io.emit('lobby update', users);
    
    // Send confirmation to this user
    socket.emit('registration confirmed', { id: socket.id, name: name });
  });
  
  // Start draft request
  socket.on('start draft', () => {
    if (!isDraftStarted && users.length > 0) {
      // Randomize the users array
      users = shuffleArray([...users]);
      
      // Mark draft as started
      isDraftStarted = true;
      
      // Reset control variables
      currentPrivilegedUserIndex = 0;
      movingForward = true;
      isSecondTurn = false;
      isInitialTurn = true;
      
      // Notify all clients that the draft has started
      io.emit('draft started', users);
      
      // Update privileges
      updatePrivileges();
    }
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    // Remove user from array
    const index = users.findIndex(user => user.id === socket.id);
    if (index !== -1) {
      const removedUser = users[index];
      users.splice(index, 1);
      
      // If the disconnected user had privileges or was before the privileged user,
      // we need to adjust the index
      if (isDraftStarted && index <= currentPrivilegedUserIndex) {
        currentPrivilegedUserIndex = Math.max(0, currentPrivilegedUserIndex - 1);
        updatePrivileges();
      }
      
      // Notify others
      io.emit('system message', `User ${removedUser.name} disconnected`);
      io.emit('lobby update', users);
    }
    
    console.log(io.engine.clientsCount + ' users connected');
  });
  
  socket.on('chat message', (msg) => {
    if (!isDraftStarted) return;
    
    // Only allow the privileged user to send messages
    if (users.length > 0 && socket.id === users[currentPrivilegedUserIndex].id) {
      const user = users.find(u => u.id === socket.id);
      io.emit('chat message', `${user.name}: ${msg}`);
    } else {
      // Send a private message to the user without privileges
      socket.emit('system message', "You don't have chat privileges right now.");
    }
  });
  
  // Add new event handler for passing control
  socket.on('pass control', () => {
    if (!isDraftStarted) return;
    
    // Only allow the privileged user to pass control
    if (users.length > 0 && socket.id === users[currentPrivilegedUserIndex].id) {
      rotatePrivileges();
    } else {
      socket.emit('system message', "You don't have chat privileges to pass.");
    }
  });
});

// Function to rotate privileges
function rotatePrivileges() {
  if (users.length <= 1) return; // No need to rotate with 0 or 1 users
  
  // Check if we're at first or last position
  const isAtFirstPosition = currentPrivilegedUserIndex === 0;
  const isAtLastPosition = currentPrivilegedUserIndex === users.length - 1;
  
  // Special handling for the first user's turn
  // Only give a second turn if it's not the initial turn
  if ((isAtLastPosition || (isAtFirstPosition && !isInitialTurn)) && !isSecondTurn) {
    isSecondTurn = true;
    const currentUser = users[currentPrivilegedUserIndex];
    io.emit('system message', `${currentUser.name} gets a second turn.`);
    updatePrivileges(); // Re-announce the same user has privileges
    return;
  }
  
  // Reset the second turn flag since we're moving now
  isSecondTurn = false;
  
  // If this was the initial turn, mark it as completed
  if (isInitialTurn) {
    isInitialTurn = false;
  }
  
  // Calculate new index based on snake pattern
  if (movingForward) {
    currentPrivilegedUserIndex++;
    // If we reached the end, switch direction
    if (currentPrivilegedUserIndex >= users.length - 1) {
      currentPrivilegedUserIndex = users.length - 1;
      movingForward = false;
    }
  } else {
    currentPrivilegedUserIndex--;
    // If we reached the start, switch direction
    if (currentPrivilegedUserIndex <= 0) {
      currentPrivilegedUserIndex = 0;
      movingForward = true;
    }
  }
  
  updatePrivileges();
}

// Function to update all users about current privileges
function updatePrivileges() {
  if (users.length > 0 && isDraftStarted) {
    const currentUser = users[currentPrivilegedUserIndex];
    io.emit('system message', `${currentUser.name} now has chat privileges.`);
    io.emit('privilege update', currentUser);
  }
}

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});