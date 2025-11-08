const draftedConsultants = new Map();
let drafters = [];
let currentPrivilegedUserIndex = 0;
let movingForward = true;
let isSecondTurn = false;
let isInitialTurn = true;
let isDraftStarted = false;
let originalDraftOrder = [];
let turnOwnerUserIdAtDisconnect = null;
const disconnectedSMs = new Map();

function reset() {

  drafters.splice(0, drafters.length);
  draftedConsultants.clear();
  disconnectedSMs.clear();
  originalDraftOrder.splice(0, originalDraftOrder.length);

  currentPrivilegedUserIndex = 0;
  movingForward = true;
  isSecondTurn = false;
  isInitialTurn = true;
  isDraftStarted = false;
  turnOwnerUserIdAtDisconnect = null;
  
}

module.exports = {
  draftedConsultants,
  drafters,
  currentPrivilegedUserIndex,
  movingForward,
  isSecondTurn,
  isInitialTurn,
  isDraftStarted,
  originalDraftOrder,
  turnOwnerUserIdAtDisconnect,
  disconnectedSMs,
  reset,
};