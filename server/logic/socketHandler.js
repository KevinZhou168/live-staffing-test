require('dotenv').config();

// Import required modules and data
const draftState = require('./draftState'); // Manages the state of the draft
let allConsultants = {};
let pickedConsultants = [];
let allSMs = require('../data/smData'); // List of all SMs
let allPM = require('../data/pmData');
let allSC = require('../data/scData');
let smProjectsMap = require('../data/projects'); // Mapping of SMs to their projects
const { postToGoogleSheet } = require('./staffingHistoryHandler'); // Function to post data to Google Sheets
const { shuffleArray } = require('./draftUtils'); // Utility function to shuffle arrays

const baseApiUrl = process.env.BASE_API_URL;

const pgPool = require('../../db.js'); // Adjust path based on file location
const { all, post } = require('axios');

let selectedConsultants = Object.keys(allConsultants).length;

// Google Sheets queue and background flusher to prevent blocking
const sheetQueue = [];
let sheetFlushTimer = null;

/**
 * Flushes queued Google Sheet updates in the background
 * This prevents blocking the main event loop during picks
 */
async function flushSheetQueue() {
  if (sheetQueue.length === 0) return;
  
  const batch = sheetQueue.splice(0, sheetQueue.length);
  console.log(`Flushing ${batch.length} queued sheet updates`);
  
  for (const item of batch) {
    postToGoogleSheet(item).catch(err => {
      console.error("[Non-critical] Sheet write failed:", err.message);
      // Could implement retry queue here if needed
    });
  }
}

/**
 * Queues a Google Sheet update and schedules flush if needed
 * @param {Object} data - Data to post to Google Sheets
 */
function queueSheetUpdate(data) {
  sheetQueue.push(data);
  
  // Schedule flush if not already scheduled (batch updates every 2 seconds)
  if (!sheetFlushTimer) {
    sheetFlushTimer = setTimeout(() => {
      flushSheetQueue();
      sheetFlushTimer = null;
    }, 2000);
  }
}

// Pick processing mutex to prevent race conditions
let isProcessingPick = false;
const pickQueue = [];

/**
 * Processes the next queued pick if any
 * @param {Object} io - Socket.IO server instance
 */
function processNextPick(io) {
  if (pickQueue.length > 0 && !isProcessingPick) {
    const next = pickQueue.shift();
    isProcessingPick = true;
    handlePick(io, next.socket, next.data)
      .catch(err => {
        console.error('[_internal_process_pick] ERROR processing queued pick:', err);
        next.socket.emit(
          'system message',
          'An error occurred processing your pick. Please try again.'
        );
      })
      .finally(() => {
        isProcessingPick = false;
        processNextPick(io);
      });
  }
}
/**
 * Registers all socket event handlers for the application.
 *
 * @param {Server} io - The Socket.IO server instance.
 */
function registerSocketHandlers(io) {
  // Reset draft state on server startup to clear any stale data
  // This ensures we start fresh after server restarts
  console.log('🔄 Initializing socket handlers - resetting draft state');
  draftState.reset();
  console.log(`✅ Draft state reset complete. Drafters count: ${draftState.drafters.length}`);
  
  // Aggressive cleanup: validate Socket.IO connections every 30 seconds
  setInterval(() => {
    const before = draftState.drafters.length;
    const invalidDrafters = [];
    
    // Find drafters with no active socket connection
    for (const drafter of draftState.drafters) {
      if (drafter.id && !io.sockets.sockets.get(drafter.id)) {
        console.warn(`⚠️ Found phantom drafter: ${drafter.name} (${drafter.userId}) with dead socket ${drafter.id}`);
        invalidDrafters.push(drafter);
      }
    }
    
    // Remove phantom drafters
    for (const phantom of invalidDrafters) {
      const idx = draftState.drafters.findIndex(d => d.userId === phantom.userId);
      if (idx !== -1) {
        draftState.drafters.splice(idx, 1);
        console.log(`🧹 Removed phantom drafter: ${phantom.name}`);
      }
    }
    
    if (invalidDrafters.length > 0) {
      const after = draftState.drafters.length;
      console.log(`🧹 Phantom cleanup: ${before} -> ${after} drafters (removed ${invalidDrafters.length})`);
      io.emit('lobby update', draftState.drafters.filter(d => !d.isDisconnected && !d.isTemporarilyDisconnected));
    }
  }, 30000); // Every 30 seconds
  
  // Handle a new client connection
  io.on('connection', (socket) => {
    /**
     * Event: 'register sm'
     * Handles the registration of a SM
     */
    socket.on('register sm', async ({ UserID, joinCode }) => {
      console.log(`Registering SM: ${UserID}, Join Code: ${joinCode}`);
      
      // SM validation handled by the login-validation endpoint
      
      // Validate the join code
      if (joinCode !== process.env.JOIN_CODE) {
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

        // This SM was previously in the draft, allow them to rejoin
        const newDrafter = {
          id: socket.id,
          userId: UserID,
          name: disconnectedSMInfo.name || UserID,
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
        
        console.log('allConsultants keys:', Object.keys(allConsultants));
        console.log('smProjectsMap for user:', smProjectsMap[UserID]);

        socket.emit('assigned projects', smProjectsMap[UserID] || {});
        socket.emit('all consultants', allConsultants);
        socket.emit('all pm', allPM);
        socket.emit('all sc', allSC);
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
      const existingDrafter = draftState.drafters.find((u) => u.userId === UserID);
      if (existingDrafter) {
        // Check if this is a reconnection attempt
        if (existingDrafter.isTemporarilyDisconnected || existingDrafter.isDisconnected || !existingDrafter.id) {
          // This is a reconnection - update the socket ID and clear ALL disconnect flags
          existingDrafter.id = socket.id;
          existingDrafter.isTemporarilyDisconnected = false;
          existingDrafter.isDisconnected = false;
          delete existingDrafter.disconnectTime;
          
          console.log(`[Reconnect] ${existingDrafter.name} reconnected (draft started: ${draftState.isDraftStarted})`);
          socket.emit('registration confirmed', existingDrafter);
          socket.emit('assigned projects', smProjectsMap[UserID] || {});
          socket.emit('all consultants', allConsultants);
          socket.emit('all pm', allPM);
          socket.emit('all sc', allSC);
          
          // If draft has started, send draft state
          if (draftState.isDraftStarted) {
            socket.emit('draft rejoined');
            emitDraftStatus(io);
            updatePrivileges(io);
          }
          
          io.emit('lobby update', draftState.drafters.filter(d => !d.isDisconnected));
          return;
        }
        
        socket.emit('registration rejected', 'This SM ID is already in use by another user.');
        return;
      }

      // Query for name of sm based on the sm id passed in
      const result = await pgPool.query(
        `SELECT name FROM users WHERE user_id = $1 LIMIT 1`,
        [UserID]
      );
      
      // One more extra check for valid sm id
      if (result.rowCount === 0) {
        socket.emit('registration rejected', 'SM ID not found in users table.');
        return;
      }
      
      const smName = result.rows[0].name;

      // Add the SM to the list of drafters
      const newDrafter = { id: socket.id, userId: UserID, name: smName || UserID };
      draftState.drafters.push(newDrafter);
      
      console.log(`✅ [Registration] New drafter added: ${smName} (${UserID}, socket: ${socket.id}). Total drafters: ${draftState.drafters.length}`);

      // Notify the client of successful registration
      socket.emit('registration confirmed', newDrafter);
      socket.emit('assigned projects', smProjectsMap[UserID] || {});
      socket.emit('all consultants', allConsultants);
      socket.emit('all pm', allPM);
      socket.emit('all sc', allSC);

      // Update the lobby for all connected clients
      io.emit('lobby update', draftState.drafters);
    });

    socket.on('kick user', ({ userId }) => {
      console.log(`[Kick] Request to remove userId=${userId}`);

      const idx = draftState.drafters.findIndex(d => d.userId === userId);
      if (idx === -1) {
        console.log('[Kick] No matching user found.');
        return;
      }

      const removed = draftState.drafters.splice(idx, 1)[0];
      if (!removed) return;

      console.log(`[Kick] ${removed.name} removed from draft.`);

      // Mark as kicked and disconnect
      removed.wasKicked = true;
      const sock = io.sockets.sockets.get(removed.id);
      if (sock) {
        console.log(`[Kick] Disconnecting socket ${removed.id}`);
        sock.wasKicked = true;
        sock.disconnect(true);
      } else {
        console.log(`[Kick] Socket ${removed.id} not found (phantom drafter or already disconnected)`);
      }

      // If we’re in the middle of a draft, handle turn logic
      if (draftState.isDraftStarted) {
        // Adjust current turn if the removed user was up next
        if (idx === draftState.currentPrivilegedUserIndex) {
          console.log(`[Kick] ${removed.name} was current turn — rotating turn.`);
          // Clamp index so we don’t go out of range
          if (draftState.currentPrivilegedUserIndex >= draftState.drafters.length) {
            draftState.currentPrivilegedUserIndex = 0;
          }
          rotatePrivileges(io);
        } else if (idx < draftState.currentPrivilegedUserIndex) {
          // If the removed user was before the current turn, shift index left
          draftState.currentPrivilegedUserIndex = Math.max(
            0,
            draftState.currentPrivilegedUserIndex - 1
          );
        }
      }

      // Notify all clients
      io.emit('system message', `${removed.name} was kicked from the draft.`);
      io.emit('user kicked', userId);
      io.emit('lobby update', draftState.drafters);
      emitDraftStatus(io);
    });


    /**
     * Event: 'start draft'
     * Starts the draft process if conditions are met.
     */
    socket.on('start draft', async ({ project_semester }) => {
      // Trigger data generation on the backend
      await fetch(`${baseApiUrl}/api/start-draft?project_semester=${project_semester}`);

      // Wait for files to be written (background operation in server.js)
      // Poll for file existence/freshness to avoid race condition
      const fs = require('fs');
      const path = require('path');
      const maxWaitTime = 10000; // 10 seconds max wait (increased from 5)
      const startTime = Date.now();
      
      console.log('⏳ Waiting for data files to be ready...');
      
      while (Date.now() - startTime < maxWaitTime) {
        try {
          // Check if consultants file exists and was recently modified
          const consultantsPath = path.join(__dirname, '../data/consultants.js');
          const stats = fs.statSync(consultantsPath);
          const fileAge = Date.now() - stats.mtimeMs;
          
          // If file was modified in last 15 seconds, assume it's fresh
          if (fileAge < 15000) {
            console.log(`✅ Data files ready (file age: ${Math.round(fileAge/1000)}s)`);
            break;
          }
        } catch (err) {
          // File doesn't exist yet, wait a bit
          console.log('⏳ Files not ready yet, waiting...');
        }
        
        // Wait 200ms before checking again (increased from 100ms)
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      if (Date.now() - startTime >= maxWaitTime) {
        console.warn('⚠️ Timeout waiting for files, proceeding anyway');
      }

      // Clear require cache to ensure we load updated files
      delete require.cache[require.resolve('../data/consultants')];
      delete require.cache[require.resolve('../data/projects')];
      delete require.cache[require.resolve('../data/smData')];
      delete require.cache[require.resolve('../data/pmData')];
      delete require.cache[require.resolve('../data/scData')];

      // Reload latest data into memory
      try {
        allConsultants = require('../data/consultants').allConsultants;
        smProjectsMap = require('../data/projects');
        allSMs = require('../data/smData');
        allPM = require('../data/pmData');
        allSC = require('../data/scData');

        // Validate data was loaded
        console.log(`📊 Loaded data: ${Object.keys(allConsultants || {}).length} consultants, ${Object.keys(smProjectsMap || {}).length} projects, ${(allSMs || []).length} SMs, ${(allPM || []).length} PMs, ${(allSC || []).length} SCs`);

        if (!allConsultants || Object.keys(allConsultants).length === 0) {
          console.error('❌ No consultants loaded!');
        }
        if (!smProjectsMap || Object.keys(smProjectsMap).length === 0) {
          console.error('❌ No projects loaded!');
        }
      } catch (err) {
        console.error('❌ Error loading data files:', err);
        io.emit('draft error', { message: 'Failed to load draft data. Please try again.' });
        return;
      }

      // Reset state
      pickedConsultants = [];
      selectedConsultants = Object.keys(allConsultants).length;

      // console.log("Reloaded consultants:", Object.keys(allConsultants));

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

        // Post the staffing order to Google Sheets
        const orderedNames = [...draftState.originalDraftOrder]
          .sort((a, b) => a.originalIndex - b.originalIndex)
          .map(({ userId }) => {
            const name = allSMs[userId]?.Name || "Unknown";
            return `${name} (${userId})`;
          });
        const data = {
          type: 'staffingOrder',
          order: orderedNames
        };

        // Notify all clients that the draft has started
        io.emit('draft started', draftState.drafters);
        io.emit('all consultants', allConsultants);
        emitDraftStatus(io);
        updatePrivileges(io);

        // Log sheet posting in background
        postToGoogleSheet(data).catch(err => {
          console.error("Sheet post failed:", err);
          // optionally retry here
        });
      }
    });

    socket.on('end draft', async () => {
      const remainingConsultants = Object.values(allConsultants).filter(
        (consultant) => !pickedConsultants.some(
          (picked) => picked.UserID === consultant.UserID
        )
      );
      
      const data = {"remainingConsultants" : remainingConsultants}
      // Log sheet posting in background
      postToGoogleSheet(data).catch(err => {
        console.error("Sheet post failed:", err);
        // optionally retry here
      });

      try {
        const response = await fetch(`${baseApiUrl}/api/import-project-data`, {
          method: 'POST',
        }); // adjust if deployed
        const result = await response.json();
        console.log('Imported to DB:', result);
      } catch (error) {
        console.error('Failed to import to DB:', error);
      }
      
      emitDraftStatus(io)
      io.emit('endDraft', 'All picks have been made. Ending draft.');
      draftState.isDraftStarted = false;

      // Kick all members and reset draft state
      draftState.reset();

    })

    socket.on('pick consultant', ({ consultantId, projectId }) => {
      console.log(
        '[pick consultant] received from socket',
        socket.id,
        'consultantId=',
        consultantId,
        'projectId=',
        projectId
      );

      if (isProcessingPick) {
        pickQueue.push({ socket, data: { consultantId, projectId } });
        console.log(`[pick consultant] queued pick (queue size now ${pickQueue.length})`);
        return;
      }

      isProcessingPick = true;
      handlePick(io, socket, { consultantId, projectId })
        .catch(err => {
          console.error('[_internal_process_pick] ERROR processing pick:', err);
          socket.emit(
            'system message',
            'An error occurred processing your pick. Please try again.'
          );
        })
        .finally(() => {
          isProcessingPick = false;
          processNextPick(io);
        });
    });

    // helper for processing picks
    async function handlePick(io, socket, { consultantId, projectId }) {
      console.log('[_internal_process_pick] START', { consultantId, projectId });

      if (!draftState.isDraftStarted) {
        console.log('[_internal_process_pick] rejected: draft not started');
        return;
      }

      selectedConsultants -= 1;

      const currentSM = draftState.drafters[draftState.currentPrivilegedUserIndex];
      console.log('[_internal_process_pick] currentSM:', currentSM);

      if (!currentSM) {
        console.log('[_internal_process_pick] rejected: no current SM');
        selectedConsultants += 1;
        return;
      }

      if (socket.id !== currentSM.id) {
        console.log(
          '[_internal_process_pick] rejected: not your turn. socket.id=',
          socket.id,
          'owner.id=',
          currentSM.id
        );
        socket.emit('system message', 'Not your turn.');
        selectedConsultants += 1;
        return;
      }

      if (draftState.draftedConsultants.has(consultantId)) {
        console.log('[_internal_process_pick] rejected: already picked', consultantId);
        socket.emit('system message', 'Already picked.');
        selectedConsultants += 1;
        return;
      }

      const consultant = allConsultants[consultantId];
      console.log('[_internal_process_pick] consultant lookup:', consultant);

      if (!consultant) {
        console.log('[_internal_process_pick] rejected: invalid consultant', consultantId);
        socket.emit('system message', 'Invalid consultant.');
        selectedConsultants += 1;
        return;
      }

      const currentSMProjects = smProjectsMap[currentSM.userId];
      console.log(
        '[_internal_process_pick] currentSMProjects keys:',
        currentSMProjects ? Object.keys(currentSMProjects) : 'NO PROJECTS'
      );

      if (!currentSMProjects || !currentSMProjects[projectId]) {
        console.log(
          '[_internal_process_pick] rejected: invalid project',
          projectId,
          'for user',
          currentSM.userId
        );
        socket.emit('system message', 'Invalid project.');
        selectedConsultants += 1;
        return;
      }

      // Defensive role → bucket mapping
      const rawRole = consultant.Role;
      console.log('[_internal_process_pick] consultant.Role:', rawRole);

      const bucketKey =
        rawRole === 'NC' || rawRole === 'EC'
          ? rawRole
          : 'NC'; // fallback so we don't blow up on weird roles

      if (!currentSMProjects[projectId][bucketKey]) {
        console.log(
          `[_internal_process_pick] creating missing bucket ${bucketKey} for project ${projectId}`
        );
        currentSMProjects[projectId][bucketKey] = [];
      }

      console.log(
        '[_internal_process_pick] pushing consultant into',
        bucketKey,
        'for project',
        projectId
      );

      currentSMProjects[projectId][bucketKey].push(consultant);
      draftState.draftedConsultants.set(consultantId, consultant);
      pickedConsultants.push(consultant);

      
      // Prepare data for Google Sheets (queue it instead of blocking)
      const timestamp = new Date().toLocaleString();
      const pickData = {
        type: 'staffingHistory',
        timestamp: timestamp,
        smId: currentSM.userId,
        smName: currentSM.name,
        consultantId: consultant.UserID,
        consultantName: consultant.Name,
        consultantRole: consultant.Role,
        projectId: projectId,
        projectName: currentSMProjects[projectId]['Description'],
        message: `${currentSM.name} picked ${consultant.Name} (${consultant.Role}) for ${currentSMProjects[projectId]['Description']} (${projectId}) at ${timestamp}`
      };

      if (selectedConsultants === 0) {
        console.log('draft ended');
        
        io.emit('draft finalizing', 'Finalizing draft and uploading to database...');
        
        // Queue the final sheet updates but don't block on them
        queueSheetUpdate(pickData);
        queueSheetUpdate({ smProjectsMap, allConsultants, allPM, allSC });
        
        // Force immediate flush for draft end
        setTimeout(() => flushSheetQueue(), 0);
        
        // Handle end draft in parallel
        handleEndDraft(io).catch(err => {
          console.error('Error ending draft:', err);
        });

        emitDraftStatus(io);
        io.emit('endDraft', 'All consultants have been drafted. Ending draft.');
        draftState.isDraftStarted = false; // Optionally, mark the draft as ended
        
        return; 
      }
      
      // Queue Google Sheets updates (non-blocking)
      queueSheetUpdate(pickData);
      queueSheetUpdate({ smProjectsMap, allConsultants, allPM, allSC });


      io.emit(
        'system message',
        `${currentSM.name} picked ${consultant.Name} for ${
          currentSMProjects[projectId]['Description']
        } (${projectId})`
      );

      emitDraftStatus(io);
      rotatePrivileges(io);
    }


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
    socket.on('disconnect', (reason) => {
      if (socket.wasKicked) {
        console.log(`[Disconnect] Skipping kicked user ${socket.id}`);
        return;
      }

      console.log(`[Disconnect] Socket ${socket.id} disconnected. Reason: ${reason}`);

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
          // Pre-draft disconnect - give them time to reconnect
          // DON'T remove immediately, wait 5 seconds
          console.log(`[Disconnect] ${drafter.name} disconnected from lobby, waiting 5s for reconnect`);
          
          // Mark as temporarily disconnected
          drafter.isTemporarilyDisconnected = true;
          drafter.disconnectTime = Date.now();
          drafter.id = null; // Clear socket ID immediately
          
          // After 5 seconds, if they haven't reconnected, remove them
          setTimeout(() => {
            // Check if they're still disconnected and haven't reconnected
            const currentIndex = draftState.drafters.findIndex((u) => u.userId === drafter.userId);
            if (currentIndex !== -1) {
              const currentDrafter = draftState.drafters[currentIndex];
              if (currentDrafter.isTemporarilyDisconnected && 
                  Date.now() - currentDrafter.disconnectTime >= 5000) {
                // They didn't reconnect, remove them
                draftState.drafters.splice(currentIndex, 1);
                console.log(`[Disconnect] ${drafter.name} removed from lobby after timeout`);
                io.emit('system message', `${drafter.name} disconnected.`);
                io.emit('lobby update', draftState.drafters.filter(d => !d.isTemporarilyDisconnected && !d.isDisconnected));
              }
            }
          }, 5000);
        }
      }
    });
  });
}

// Handler for ending the draft and posting data to Google Sheets
/**
 * Handles the end of the draft process.
 * Posts remaining consultants to Google Sheets and imports project data to the database.
 *
 * @param {Server} io - The Socket.IO server instance.
 */
async function handleEndDraft(io) {
  const remainingConsultants = Object.values(allConsultants).filter(
    (consultant) =>
      !pickedConsultants.some((picked) => picked.UserID === consultant.UserID)
  );

  const data = {"remainingConsultants" : remainingConsultants };
  postToGoogleSheet(data).catch(err => {
    console.error("Sheet post failed:", err);
    // can implement some retry logic here
  });

  try {
    const response = await fetch(`${baseApiUrl}/api/import-project-data`, {
      method: 'POST',
    });
    const result = await response.json();
    console.log('Imported to DB:', result);
  } catch (error) {
    console.error('Failed to import to DB:', error);
  }

  emitDraftStatus(io);
  draftState.isDraftStarted = false;
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