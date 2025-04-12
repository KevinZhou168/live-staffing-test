const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

let allConsultants = {
  c1: {
    UserID: 'c1',
    Name: 'Jenny Kim',
    Email: 'jenny@example.com',
    Major: 'CS',
    Year: 2,
    Availability_Mon: 'Morning',
    Availability_Tue: 'Afternoon',
    ConsultantScore: 4.7,
    FunctionalAreaInterests: 'AI/ML'
  },
  c2: {
    UserID: 'c2',
    Name: 'David Lee',
    Email: 'david@example.com',
    Major: 'ECE',
    Year: 3,
    Availability_Mon: 'Evening',
    Availability_Tue: 'Morning',
    ConsultantScore: 4.3,
    FunctionalAreaInterests: 'FinTech'
  },
  c3: {
    UserID: 'c3',
    Name: 'Sarah Johnson',
    Email: 'sarah@example.com',
    Major: 'Data Science',
    Year: 4,
    Availability_Mon: 'Afternoon',
    Availability_Tue: 'Evening',
    ConsultantScore: 4.8,
    FunctionalAreaInterests: 'Big Data'
  },
  c4: {
    UserID: 'c4',
    Name: 'Michael Chen',
    Email: 'michael@example.com',
    Major: 'MIS',
    Year: 2,
    Availability_Mon: 'Morning',
    Availability_Tue: 'Morning',
    ConsultantScore: 4.1,
    FunctionalAreaInterests: 'Cybersecurity'
  },
  c5: {
    UserID: 'c5',
    Name: 'Olivia Garcia',
    Email: 'olivia@example.com',
    Major: 'CE',
    Year: 3,
    Availability_Mon: 'Evening',
    Availability_Tue: 'Afternoon',
    ConsultantScore: 4.5,
    FunctionalAreaInterests: 'Web Development'
  }
};

let allSMs = {
  sm1: { UserID: 'sm1', Name: 'Alice Johnson', Email: 'alice@smail.com', Major: 'Business', Year: 4 },
  sm2: { UserID: 'sm2', Name: 'Bob Martinez', Email: 'bob@smail.com', Major: 'Finance', Year: 3 },
  sm3: { UserID: 'sm3', Name: 'Carlos Rodriguez', Email: 'carlos@smail.com', Major: 'Marketing', Year: 2 },
  sm4: { UserID: 'sm4', Name: 'Diana Lee', Email: 'diana@smail.com', Major: 'Accounting', Year: 4 },
  sm5: { UserID: 'sm5', Name: 'Eric Taylor', Email: 'eric@smail.com', Major: 'Economics', Year: 3 }
};

let smProjectsMap = {
  sm1: {
    project1: { PM: 'pm1', SC: ['sc1'], NC: [], Description: 'AI Research Project' },
    project2: { PM: 'pm2', SC: ['sc2'], NC: [], Description: 'Blockchain Development' }
  },
  sm2: {
    project3: { PM: 'pm3', SC: ['sc3'], NC: [], Description: 'Marketing Analytics' }
  },
  sm3: {
    project4: { PM: 'pm4', SC: [], NC: [], Description: 'Cybersecurity Initiative' }
  },
  sm4: {
    project5: { PM: 'pm5', SC: [], NC: [], Description: 'E-commerce Optimization' }
  },
  sm5: {
    project6: { PM: 'pm6', SC: [], NC: [], Description: 'Financial Modeling' }
  }
};

let draftedConsultants = new Map();
let drafters = [];
let currentPrivilegedUserIndex = 0;
let movingForward = true;
let isSecondTurn = false;
let isInitialTurn = true;
let isDraftStarted = false;
// Store the original draft order to use when SMs rejoin
let originalDraftOrder = [];
// Track disconnected SMs to allow rejoining
let disconnectedSMs = new Map();
// Track if we need to restore turn to a rejoining SM
let turnOwnerUserIdAtDisconnect = null;

io.on('connection', (socket) => {
  socket.on('register sm', ({ UserID, joinCode }) => {
    if (joinCode !== 'sp2025') {
      socket.emit('registration rejected', 'Invalid join code.');
      return;
    }

    // Check if this SM is trying to rejoin an active draft
    if (isDraftStarted) {
      // Check if this SM was previously in the draft
      const disconnectedSMInfo = disconnectedSMs.get(UserID);
      
      if (!disconnectedSMInfo) {
        socket.emit('registration rejected', 'Draft already started and you were not part of it.');
        return;
      }
      
      const smData = allSMs[UserID];
      if (!smData) {
        socket.emit('registration rejected', 'SM not found.');
        return;
      }

      // This SM was previously in the draft, allow them to rejoin
      const newDrafter = { 
        id: socket.id, 
        userId: UserID, 
        name: smData.Name, 
        originalIndex: disconnectedSMInfo.originalIndex 
      };
      
      // Replace the placeholder for this SM with the new connection
      const rejoinIndex = drafters.findIndex(drafter => drafter.userId === UserID);
      
      if (rejoinIndex !== -1) {
        // If there was a placeholder, replace it
        drafters[rejoinIndex] = newDrafter;
      } else {
        // If somehow there was no placeholder, add them back at their original position
        drafters.splice(disconnectedSMInfo.originalIndex, 0, newDrafter);
      }
      
      // Remove from disconnected list
      disconnectedSMs.delete(UserID);
      
      socket.emit('registration confirmed', newDrafter);
      socket.emit('assigned projects', smProjectsMap[UserID] || {});
      socket.emit('all consultants', allConsultants);
      socket.emit('draft rejoined');
      io.emit('lobby update', drafters);
      
      // Send the current state of the draft to the rejoining SM
      emitDraftStatus();
      
      // Check if this SM was disconnected during their turn
      if (turnOwnerUserIdAtDisconnect === UserID) {
        // Restore their turn
        currentPrivilegedUserIndex = rejoinIndex !== -1 ? rejoinIndex : disconnectedSMInfo.originalIndex;
        turnOwnerUserIdAtDisconnect = null;
        updatePrivileges();
      } else {
        // Just update privileges normally
        updatePrivileges();
      }
      return;
    }

    if (drafters.find((u) => u.id === socket.id)) return;
    
    // Check if SM ID is already in use by another user in the lobby
    if (drafters.find((u) => u.userId === UserID)) {
      socket.emit('registration rejected', 'This SM ID is already in use by another user.');
      return;
    }
    
    const smData = allSMs[UserID];
    if (!smData) {
      socket.emit('registration rejected', 'SM not found.');
      return;
    }

    const newDrafter = { id: socket.id, userId: UserID, name: smData.Name };
    drafters.push(newDrafter);

    socket.emit('registration confirmed', newDrafter);
    socket.emit('assigned projects', smProjectsMap[UserID] || {});
    socket.emit('all consultants', allConsultants);
    io.emit('lobby update', drafters);
  });

  socket.on('start draft', () => {
    if (!isDraftStarted && drafters.length > 0) {
      drafters = shuffleArray([...drafters]);
      
      // Store the original draft order for rejoining SMs
      originalDraftOrder = drafters.map((drafter, index) => ({
        userId: drafter.userId,
        originalIndex: index
      }));
      
      // Add the originalIndex to each drafter
      drafters.forEach((drafter, index) => {
        drafter.originalIndex = index;
      });
      
      isDraftStarted = true;
      currentPrivilegedUserIndex = 0;
      movingForward = true;
      isSecondTurn = false;
      isInitialTurn = true;
      io.emit('draft started', drafters);
      emitDraftStatus();
      updatePrivileges();
    }
  });

  socket.on('pick consultant', ({ consultantId, projectId }) => {
    if (!isDraftStarted) return;
    const currentSM = drafters[currentPrivilegedUserIndex];
    if (socket.id !== currentSM.id) {
      socket.emit('system message', 'Not your turn.');
      return;
    }

    if (draftedConsultants.has(consultantId)) {
      socket.emit('system message', 'Already picked.');
      return;
    }

    const consultant = allConsultants[consultantId];
    if (!consultant) {
      socket.emit('system message', 'Invalid consultant.');
      return;
    }

    const userProjects = smProjectsMap[currentSM.userId];
    if (!userProjects || !userProjects[projectId]) {
      socket.emit('system message', 'Invalid project.');
      return;
    }

    userProjects[projectId].NC.push(consultant);
    draftedConsultants.set(consultantId, consultant);
    io.emit('system message', `${currentSM.name} picked ${consultant.Name} for ${projectId}`);
    emitDraftStatus();
    rotatePrivileges();
  });

  socket.on('leave lobby', () => {
    if (!isDraftStarted) {
      // Normal lobby leave if draft hasn't started
      const index = drafters.findIndex((u) => u.id === socket.id);
      if (index !== -1) {
        const removed = drafters.splice(index, 1)[0];
        io.emit('system message', `${removed.name} left the lobby.`);
        io.emit('lobby update', drafters);
      }
    } else {
      // If draft has started, keep their place but mark as disconnected
      const index = drafters.findIndex((u) => u.id === socket.id);
      if (index !== -1) {
        const drafter = drafters[index];
        
        // Store their information for possible reconnection
        disconnectedSMs.set(drafter.userId, {
          originalIndex: drafter.originalIndex,
          name: drafter.name
        });
        
        // Keep them in the drafters array but mark their socket as disconnected
        // This preserves the draft order
        drafter.isDisconnected = true;
        drafter.id = null; // Clear the socket ID
        
        io.emit('system message', `${drafter.name} left the draft but can rejoin later.`);
        io.emit('lobby update', drafters.filter(d => !d.isDisconnected));
        
        // If it was their turn, remember it, but still skip to next active player for now
        if (index === currentPrivilegedUserIndex) {
          turnOwnerUserIdAtDisconnect = drafter.userId;
          
          // Find the next active player temporarily
          // findNextActivePlayer();
        }
      }
    }
  });

  socket.on('disconnect', () => {
    const index = drafters.findIndex((u) => u.id === socket.id);
    if (index !== -1) {
      const drafter = drafters[index];
      
      if (isDraftStarted) {
        // Similar to leave lobby, but due to disconnection
        disconnectedSMs.set(drafter.userId, {
          originalIndex: drafter.originalIndex,
          name: drafter.name
        });
        
        // Keep them in the drafters array but mark as disconnected
        drafter.isDisconnected = true;
        drafter.id = null;
        
        io.emit('system message', `${drafter.name} disconnected but can rejoin later.`);
        io.emit('lobby update', drafters.filter(d => !d.isDisconnected));
        
        // If it was their turn, remember it, but still skip to next active player for now
        if (index === currentPrivilegedUserIndex) {
          turnOwnerUserIdAtDisconnect = drafter.userId;
          
          // Find the next active player temporarily
          // findNextActivePlayer();
        }
      } else {
        // Pre-draft regular disconnect
        drafters.splice(index, 1);
        io.emit('system message', `${drafter.name} disconnected.`);
        io.emit('lobby update', drafters);
      }
    }
  });
});

function rotatePrivileges() {
  if (drafters.length <= 1) {
    updatePrivileges();
    return;
  }

  const isAtFirst = currentPrivilegedUserIndex === 0;
  const isAtLast = currentPrivilegedUserIndex === drafters.length - 1;

  if ((isAtLast || (isAtFirst && !isInitialTurn)) && !isSecondTurn) {
    isSecondTurn = true;
    updatePrivileges();
    return;
  }

  isSecondTurn = false;
  if (isInitialTurn) isInitialTurn = false;

  if (movingForward) {
    currentPrivilegedUserIndex++;
    if (currentPrivilegedUserIndex >= drafters.length - 1) {
      currentPrivilegedUserIndex = drafters.length - 1;
      movingForward = false;
    }
  } else {
    currentPrivilegedUserIndex--;
    if (currentPrivilegedUserIndex <= 0) {
      currentPrivilegedUserIndex = 0;
      movingForward = true;
    }
  }

  updatePrivileges();
}

function findNextActivePlayer() {
  let nextIndex = currentPrivilegedUserIndex;
  let foundActive = false;
  let checkedAllPlayers = false;
  let directionAttempts = 0;
  
  // Only try switching directions once to avoid infinite recursion
  while (!foundActive && directionAttempts < 2) {
    // Try to find the next active player in the current direction
    let checked = 0;
    
    while (checked < drafters.length && !foundActive) {
      if (movingForward) {
        nextIndex = (nextIndex + 1) % drafters.length;
      } else {
        nextIndex = (nextIndex - 1 + drafters.length) % drafters.length;
      }
      
      checked++;
      
      // Found an active player
      if (!drafters[nextIndex].isDisconnected && drafters[nextIndex].id) {
        foundActive = true;
        break;
      }
    }
    
    // If we couldn't find an active player in the current direction, switch directions
    if (!foundActive) {
      movingForward = !movingForward;
      directionAttempts++;
    }
  }
  
  // If we found an active player, update the index
  if (foundActive) {
    currentPrivilegedUserIndex = nextIndex;
    updatePrivileges();
  } else {
    // If no active players at all, just log this situation
    console.log("No active players found in the draft");
    // Don't update privileges as there's no one to give them to
  }
}

function updatePrivileges() {
  if (drafters.length > 0 && isDraftStarted) {
    const currentUser = drafters[currentPrivilegedUserIndex];
    
    // Only send privilege updates if the user is active
    if (currentUser && !currentUser.isDisconnected && currentUser.id) {
      io.emit('system message', `${currentUser.name} now has chat privileges.`);
      io.emit('privilege update', currentUser);
    }
  }
}

function emitDraftStatus() {
  io.emit('draft status update', smProjectsMap);
}

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
