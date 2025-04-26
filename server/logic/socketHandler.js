// Import required modules and data
const draftState = require('./draftState'); // Manages the state of the draft
const allConsultants = require('../data/consultants'); // List of all consultants
const allSMs = require('../data/smData'); // List of all SMs (Scrum Masters)
const smProjectsMap = require('../data/projects'); // Mapping of SMs to their projects
const { postToGoogleSheet } = require('./staffingHistoryHandler'); // Function to post data to Google Sheets
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
        const disconnectedSMInfo = draftState.disconnectedSMs.get(UserID);

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
        const rejoinIndex = draftState.drafters.findIndex(drafter => drafter.userId === UserID);

        if (rejoinIndex !== -1) {
          // If there was a placeholder, replace it
          draftState.drafters[rejoinIndex] = newDrafter;
        } else {
          // If somehow there was no placeholder, add them back at their original position
          draftState.drafters.splice(disconnectedSMInfo.originalIndex, 0, newDrafter);
        }

        // Remove from disconnected list
        draftState.disconnectedSMs.delete(UserID);

        socket.emit('registration confirmed', newDrafter);
        socket.emit('assigned projects', smProjectsMap[UserID] || {});
        socket.emit('all consultants', allConsultants);
        socket.emit('draft rejoined');
        io.emit('lobby update', draftState.drafters);

        // Send the current state of the draft to the rejoining SM
        emitDraftStatus(io);

        // Check if this SM was disconnected during their turn
        if (draftState.turnOwnerUserIdAtDisconnect === UserID) {
          // Restore their turn
          draftState.currentPrivilegedUserIndex = rejoinIndex !== -1 ? rejoinIndex : disconnectedSMInfo.originalIndex;
          draftState.turnOwnerUserIdAtDisconnect = null;
          updatePrivileges(io);
        } else {
          // Just update privileges normally
          updatePrivileges(io);
        }
        return;
      }

      // Prevent duplicate registration for the same socket
      if (draftState.drafters.find((u) => u.userId === UserID)) {
        socket.emit('registration rejected', 'This SM ID is already in use by another user.');
        return;
      }

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

        // Store the original draft order for rejoining SMs
        draftState.originalDraftOrder = draftState.drafters.map((drafter, index) => ({
          userId: drafter.userId,
          originalIndex: index
        }));

        // Add the originalIndex to each drafter
        draftState.drafters.forEach((drafter, index) => {
          drafter.originalIndex = index;
        });

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

      // Post the selection to Google Sheets
      const timestamp = new Date().toLocaleString();
      const data = {
        type: 'staffingHistory',
        timestamp: timestamp,
        smId: currentSM.userId,
        smName: currentSM.name,
        consultantId: consultant.UserID,
        consultantName: consultant.Name,
        consultantRole: consultant.Role,
        projectId: projectId,
        projectName: projectId,
        message: `${currentSM.name} picked ${consultant.Name} (${consultant.Role}) for ${projectId} at ${timestamp}`
      };
      postToGoogleSheet(data);
      postToGoogleSheet(smProjectsMap);

      // Notify all clients of the selection
      io.emit('system message', `${currentSM.name} picked ${consultant.Name} for ${projectId}`);
      emitDraftStatus(io);
      rotatePrivileges(io);
    });

    /**
     * Event: 'defer turn'
     * Handles a user skipping their turn in the draft.
     */
    socket.on('defer turn', () => {
      // Ensure the draft has started
      if (!draftState.isDraftStarted) return;

      // Validate that it's the current user's turn
      const currentSM = draftState.drafters[draftState.currentPrivilegedUserIndex];
      if (socket.id !== currentSM.id) {
        socket.emit('system message', 'Not your turn.');
        return;
      }

      // Log this action
      const timestamp = new Date().toLocaleString();
      io.emit('system message', `${currentSM.name} deferred their turn at ${timestamp}`);
      
      // Check if the player would get consecutive turns (at first or last position)
      const isAtFirst = draftState.currentPrivilegedUserIndex === 0;
      const isAtLast = draftState.currentPrivilegedUserIndex === draftState.drafters.length - 1;
      
      // If they're in a position to get consecutive turns and not in their second turn yet
      if ((isAtLast || (isAtFirst && !draftState.isInitialTurn)) && !draftState.isSecondTurn) {
        // Skip both turns by calling rotatePrivileges twice
        rotatePrivileges(io);  // This will set isSecondTurn = true
        rotatePrivileges(io);  // This will move to the next player
      } else {
        // Regular turn deferral - just move to the next player
        rotatePrivileges(io);
      }
    });

    socket.on('leave lobby', () => {
      if (!draftState.isDraftStarted) {
        // Normal lobby leave if draft hasn't started
        const index = draftState.drafters.findIndex((u) => u.id === socket.id);
        if (index !== -1) {
          const removed = draftState.drafters.splice(index, 1)[0];
          io.emit('system message', `${removed.name} left the lobby.`);
          io.emit('lobby update', draftState.drafters);
        }
      } else {
        // If draft has started, keep their place but mark as disconnected
        const index = draftState.drafters.findIndex((u) => u.id === socket.id);
        if (index !== -1) {
          const drafter = draftState.drafters[index];

          // Store their information for possible reconnection
          draftState.disconnectedSMs.set(drafter.userId, {
            originalIndex: drafter.originalIndex,
            name: drafter.name
          });

          // Keep them in the drafters array but mark their socket as disconnected
          // This preserves the draft order
          drafter.isDisconnected = true;
          drafter.id = null; // Clear the socket ID

          io.emit('system message', `${drafter.name} left the draft but can rejoin later.`);
          io.emit('lobby update', draftState.drafters.filter(d => !d.isDisconnected));

          // If it was their turn, remember it, but still skip to next active player for now
          if (index === draftState.currentPrivilegedUserIndex) {
            draftState.turnOwnerUserIdAtDisconnect = drafter.userId;

            // Find the next active player temporarily
            // findNextActivePlayer();
          }
        }
      }
    });

    /**
     * Event: 'disconnect'
     * Handles a client disconnecting from the server.
     */
    socket.on('disconnect', () => {
      const index = draftState.drafters.findIndex((u) => u.id === socket.id);
      if (index !== -1) {
        const drafter = draftState.drafters[index];

        if (draftState.isDraftStarted) {
          // Similar to leave lobby, but due to disconnection
          draftState.disconnectedSMs.set(drafter.userId, {
            originalIndex: drafter.originalIndex,
            name: drafter.name
          });

          // Keep them in the drafters array but mark as disconnected
          drafter.isDisconnected = true;
          drafter.id = null;

          io.emit('system message', `${drafter.name} disconnected but can rejoin later.`);
          io.emit('lobby update', draftState.drafters.filter(d => !d.isDisconnected));

          // If it was their turn, remember it, but still skip to next active player for now
          if (index === draftState.currentPrivilegedUserIndex) {
            draftState.turnOwnerUserIdAtDisconnect = drafter.userId;

            // Find the next active player temporarily
            // findNextActivePlayer();
          }
        } else {
          // Pre-draft regular disconnect
          draftState.drafters.splice(index, 1);
          io.emit('system message', `${drafter.name} disconnected.`);
          io.emit('lobby update', draftState.drafters);
        }
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
    // Only send privilege updates if the user is active
    if (currentUser && !currentUser.isDisconnected && currentUser.id) {
      io.emit('system message', `${currentUser.name} now has chat privileges.`);
      io.emit('privilege update', currentUser);
    }
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