// Import required modules and data
const draftState = require('./draftState'); // Manages the state of the draft
const allConsultants = require('../data/consultants'); // List of all consultants
const allSMs = require('../data/smData'); // List of all SMs (Scrum Masters)
const smProjectsMap = require('../data/projects'); // Mapping of SMs to their projects
const { shuffleArray } = require('./draftUtils'); // Utility function to shuffle arrays

/**
 * Registers all socket event handlers for the application.
 * 
 * @param {Server} io - The Socket.IO server instance.
 */
function registerSocketHandlers(io) {
  // Handle a new client connection
  io.on('connection', (socket) => {
    /**
     * Event: 'register sm'
     * Handles the registration of a Scrum Master (SM).
     */
    socket.on('register sm', ({ UserID, joinCode }) => {
      // Validate the join code
      if (joinCode !== 'sp2025') {
        socket.emit('registration rejected', 'Invalid join code.');
        return;
      }

      // Reject registration if the draft has already started
      if (draftState.isDraftStarted) {
        socket.emit('registration rejected', 'Draft already started.');
        return;
      }

      // Prevent duplicate registration for the same socket
      if (draftState.drafters.find((u) => u.id === socket.id)) return;

      // Validate the SM's UserID
      const smData = allSMs[UserID];
      if (!smData) {
        socket.emit('registration rejected', 'SM not found.');
        return;
      }

      // Add the SM to the list of drafters
      const newDrafter = { id: socket.id, userId: UserID, name: smData.Name };
      draftState.drafters.push(newDrafter);

      // Notify the client of successful registration
      socket.emit('registration confirmed', newDrafter);
      socket.emit('assigned projects', smProjectsMap[UserID] || {});
      socket.emit('all consultants', allConsultants);

      // Update the lobby for all connected clients
      io.emit('lobby update', draftState.drafters);
    });

    /**
     * Event: 'start draft'
     * Starts the draft process if conditions are met.
     */
    socket.on('start draft', () => {
      if (!draftState.isDraftStarted && draftState.drafters.length > 0) {
        // Shuffle the drafters to randomize the order
        const shuffled = shuffleArray([...draftState.drafters]);
        draftState.drafters.splice(0, draftState.drafters.length, ...shuffled);

        // Initialize draft state
        draftState.isDraftStarted = true;
        draftState.currentPrivilegedUserIndex = 0;
        draftState.movingForward = true;
        draftState.isSecondTurn = false;
        draftState.isInitialTurn = true;

        // Notify all clients that the draft has started
        io.emit('draft started', draftState.drafters);
        emitDraftStatus(io);
        updatePrivileges(io);
      }
    });

    /**
     * Event: 'pick consultant'
     * Handles the selection of a consultant for a project.
     */
    socket.on('pick consultant', ({ consultantId, projectId }) => {
      // Ensure the draft has started
      if (!draftState.isDraftStarted) return;

      // Validate that it's the current user's turn
      const currentSM = draftState.drafters[draftState.currentPrivilegedUserIndex];
      if (socket.id !== currentSM.id) {
        socket.emit('system message', 'Not your turn.');
        return;
      }

      // Ensure the consultant hasn't already been picked
      if (draftState.draftedConsultants.has(consultantId)) {
        socket.emit('system message', 'Already picked.');
        return;
      }

      // Validate the consultant ID
      const consultant = allConsultants[consultantId];
      if (!consultant) {
        socket.emit('system message', 'Invalid consultant.');
        return;
      }

      // Validate the project ID
      const userProjects = smProjectsMap[currentSM.userId];
      if (!userProjects || !userProjects[projectId]) {
        socket.emit('system message', 'Invalid project.');
        return;
      }

      // Assign the consultant to the project
      userProjects[projectId].NC.push(consultant);
      draftState.draftedConsultants.set(consultantId, consultant);

      // Notify all clients of the selection
      io.emit('system message', `${currentSM.name} picked ${consultant.Name} for ${projectId}`);
      emitDraftStatus(io);
      rotatePrivileges(io);
    });

    /**
     * Event: 'disconnect'
     * Handles a client disconnecting from the server.
     */
    socket.on('disconnect', () => {
      // Remove the disconnected user from the drafters list
      const index = draftState.drafters.findIndex((u) => u.id === socket.id);
      if (index !== -1) {
        const removed = draftState.drafters.splice(index, 1)[0];

        // Adjust the privileged user index if necessary
        if (draftState.isDraftStarted && index <= draftState.currentPrivilegedUserIndex) {
          draftState.currentPrivilegedUserIndex = Math.max(0, draftState.currentPrivilegedUserIndex - 1);
          updatePrivileges(io);
        }

        // Notify all clients of the disconnection
        io.emit('system message', `${removed.name} disconnected.`);
        io.emit('lobby update', draftState.drafters);
      }
    });
  });
}

/**
 * Rotates the privileges to the next drafter in the queue.
 * Handles forward and backward movement based on the draft state.
 */
function rotatePrivileges(io) {
  if (draftState.drafters.length <= 1) {
    updatePrivileges(io);
    return;
  }

  const isAtFirst = draftState.currentPrivilegedUserIndex === 0;
  const isAtLast = draftState.currentPrivilegedUserIndex === draftState.drafters.length - 1;

  // Handle second turn logic
  if ((isAtLast || (isAtFirst && !draftState.isInitialTurn)) && !draftState.isSecondTurn) {
    draftState.isSecondTurn = true;
    updatePrivileges(io);
    return;
  }

  draftState.isSecondTurn = false;
  if (draftState.isInitialTurn) draftState.isInitialTurn = false;

  // Move forward or backward in the queue
  if (draftState.movingForward) {
    draftState.currentPrivilegedUserIndex++;
    if (draftState.currentPrivilegedUserIndex >= draftState.drafters.length - 1) {
      draftState.currentPrivilegedUserIndex = draftState.drafters.length - 1;
      draftState.movingForward = false;
    }
  } else {
    draftState.currentPrivilegedUserIndex--;
    if (draftState.currentPrivilegedUserIndex <= 0) {
      draftState.currentPrivilegedUserIndex = 0;
      draftState.movingForward = true;
    }
  }

  updatePrivileges(io);
}

/**
 * Updates the privileges for the current drafter.
 * Notifies all clients of the current privileged user.
 */
function updatePrivileges(io) {
  if (draftState.drafters.length > 0 && draftState.isDraftStarted) {
    const currentUser = draftState.drafters[draftState.currentPrivilegedUserIndex];
    io.emit('system message', `${currentUser.name} now has chat privileges.`);
    io.emit('privilege update', currentUser);
  }
}

/**
 * Emits the current draft status to all clients.
 */
function emitDraftStatus(io) {
  io.emit('draft status update', smProjectsMap);
}

// Export the function to register socket handlers
module.exports = registerSocketHandlers;