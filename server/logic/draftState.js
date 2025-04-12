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
};
