// server.js
const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// Dummy consultant data
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
  }
};

let allSMs = {
  sm1: { UserID: 'sm1', Name: 'Alice Johnson', Email: 'alice@smail.com', Major: 'Business', Year: 4 },
  sm2: { UserID: 'sm2', Name: 'Bob Martinez', Email: 'bob@smail.com', Major: 'Finance', Year: 3 }
};

let smProjectsMap = {
  sm1: {
    project1: { PM: 'pm1', SC: ['sc1'], NC: [] },
    project2: { PM: 'pm2', SC: ['sc2'], NC: [] }
  },
  sm2: {
    project3: { PM: 'pm3', SC: ['sc3'], NC: [] }
  }
};

let draftedConsultants = new Map();
let drafters = [];
let currentPrivilegedUserIndex = 0;
let movingForward = true;
let isSecondTurn = false;
let isInitialTurn = true;
let isDraftStarted = false;

io.on('connection', (socket) => {
  socket.on('register sm', ({ UserID }) => {
    if (isDraftStarted) {
      socket.emit('registration rejected', 'Draft already started.');
      return;
    }
    if (drafters.find((u) => u.id === socket.id)) return;
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

  socket.on('get consultant details', (consultantId) => {
    const consultant = allConsultants[consultantId];
    if (consultant) {
      socket.emit('consultant details', consultant);
    } else {
      socket.emit('system message', 'Consultant not found');
    }
  });

  socket.on('pass control', () => {
    if (socket.id !== drafters[currentPrivilegedUserIndex].id) {
      socket.emit('system message', 'You do not have control.');
      return;
    }
    rotatePrivileges();
  });

  socket.on('disconnect', () => {
    const index = drafters.findIndex((u) => u.id === socket.id);
    if (index !== -1) {
      const removed = drafters.splice(index, 1)[0];
      if (isDraftStarted && index <= currentPrivilegedUserIndex) {
        currentPrivilegedUserIndex = Math.max(0, currentPrivilegedUserIndex - 1);
        updatePrivileges();
      }
      io.emit('system message', `${removed.name} disconnected.`);
      io.emit('lobby update', drafters);
    }
  });
});

function rotatePrivileges() {
  if (drafters.length === 1) {
    updatePrivileges();
    return;
  }
  if (drafters.length === 0) return;

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

function updatePrivileges() {
  if (drafters.length > 0 && isDraftStarted) {
    const currentUser = drafters[currentPrivilegedUserIndex];
    io.emit('system message', `${currentUser.name} now has chat privileges.`);
    io.emit('privilege update', currentUser);
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