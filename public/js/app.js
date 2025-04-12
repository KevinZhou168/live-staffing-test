// Initialize the Socket.IO client
const socket = io();

// Variables to store the current user's data and draft state
let currentUser = null;
let assignedProjects = {}; // Projects assigned to the current user
let allConsultants = {}; // List of all consultants
let drafted = new Set(); // Set of consultants already drafted
let currentConsultantId = null; // ID of the currently selected consultant
let hasPrivilege = false; // Whether the current user has the privilege to pick

// DOM elements for various parts of the UI
const loginModal = document.getElementById('login-modal');
const useridInput = document.getElementById('userid-input');
const passcodeInput = document.getElementById('passcode-input');
const loginBtn = document.getElementById('login-btn');
const lobby = document.getElementById('lobby');
const userList = document.getElementById('user-list');
const startBtn = document.getElementById('start-draft');
const draftInterface = document.getElementById('draft-interface');
const status = document.getElementById('status');
const projectList = document.getElementById('project-list');
const consultantList = document.getElementById('consultants');
const projectSelect = document.getElementById('project-select');
const pickBtn = document.getElementById('pick-btn');

// Show the login modal when the app starts
loginModal.style.display = 'flex';

// Handle the login button click
loginBtn.onclick = () => {
    const id = useridInput.value.trim(); // Get the entered UserID
    const code = passcodeInput.value.trim(); // Get the entered join code
    if (id && code) {
        // Emit a 'register sm' event to the server with the UserID and join code
        socket.emit('register sm', { UserID: id, joinCode: code });
    }
};

// Handle successful registration
socket.on('registration confirmed', (user) => {
    currentUser = user; // Store the current user's data
    loginModal.style.display = 'none'; // Hide the login modal
    lobby.style.display = 'block'; // Show the lobby
});

// Update the lobby when the list of users changes
socket.on('lobby update', (users) => {
    userList.innerHTML = ''; // Clear the current user list
    users.forEach(u => {
        const li = document.createElement('li');
        li.textContent = u.name + (u.id === currentUser.id ? ' (You)' : ''); // Highlight the current user
        userList.appendChild(li);
    });
});

// Handle the start draft button click
startBtn.onclick = () => {
    socket.emit('start draft'); // Emit a 'start draft' event to the server
};

// Handle the start of the draft
socket.on('draft started', () => {
    lobby.style.display = 'none'; // Hide the lobby
    draftInterface.style.display = 'block'; // Show the draft interface
});

// Receive the projects assigned to the current user
socket.on('assigned projects', (projects) => {
    assignedProjects = projects; // Update the assigned projects
    renderProjects(); // Render the projects in the UI
});

// Receive the list of all consultants
socket.on('all consultants', (consultants) => {
    allConsultants = consultants; // Update the list of consultants
    renderConsultants(); // Render the consultants in the UI
});

// Update the draft status
socket.on('draft status update', (smProjectsMap) => {
    drafted.clear(); // Clear the set of drafted consultants
    assignedProjects = smProjectsMap[currentUser.userId] || {}; // Update the user's projects
    Object.values(smProjectsMap).forEach(projects => {
        Object.values(projects).forEach(p => {
            p.NC.forEach(nc => {
                drafted.add(nc.UserID); // Add drafted consultants to the set
            });
        });
    });
    renderProjects(); // Re-render the projects
    renderConsultants(); // Re-render the consultants
});

// Update the privilege status
socket.on('privilege update', (user) => {
    hasPrivilege = user.id === currentUser.id; // Check if the current user has the privilege
    status.textContent = hasPrivilege ? '✅ Your Turn to Pick' : `🕒 ${user.name}'s Turn`; // Update the status message
    pickBtn.disabled = !hasPrivilege; // Enable or disable the pick button
    renderConsultants(); // Re-render the consultants
});

// Render the list of projects in the UI
function renderProjects() {
    projectList.innerHTML = ''; // Clear the current project list
    projectSelect.innerHTML = ''; // Clear the project dropdown

    for (const [projectId, data] of Object.entries(assignedProjects)) {
        const div = document.createElement('div');
        const ncList = (data.NC || []).map(nc => nc.Name).join(', ') || 'None'; // List of NCs for the project
        div.innerHTML = `
            <strong>${projectId}</strong><br>
            PM: ${data.PM}<br>
            SCs: ${data.SC.join(', ')}<br>
            <strong>NCs:</strong> ${ncList}<br><br>
        `;
        projectList.appendChild(div); // Add the project to the list

        const opt = document.createElement('option');
        opt.value = projectId; // Set the project ID as the value
        opt.textContent = projectId; // Set the project ID as the text
        projectSelect.appendChild(opt); // Add the project to the dropdown
    }
}

// Render the list of consultants in the UI
function renderConsultants() {
    consultantList.innerHTML = ''; // Clear the current consultant list

    Object.values(allConsultants).forEach(c => {
        const li = document.createElement('li');
        li.textContent = `${c.Name} (${c.UserID}) - ${c.Major}, Year ${c.Year}`; // Consultant details

        if (drafted.has(c.UserID)) {
            li.classList.add('disabled'); // Mark the consultant as drafted
        } else if (hasPrivilege) {
            li.classList.remove('disabled');
            li.onclick = () => {
                currentConsultantId = c.UserID; // Set the selected consultant ID
                document.querySelectorAll('#consultants li').forEach(el => {
                    el.classList.remove('highlight'); // Remove highlight from other consultants
                });
                li.classList.add('highlight'); // Highlight the selected consultant
            };
        } else {
            li.classList.remove('highlight');
            li.onclick = null; // Disable click events for other users
        }
        consultantList.appendChild(li); // Add the consultant to the list
    });
}

// Handle the pick button click
pickBtn.onclick = () => {
    if (currentConsultantId) {
        const projectId = projectSelect.value; // Get the selected project ID
        const consultant = Object.values(allConsultants).find(c => c.UserID === currentConsultantId); // Find the selected consultant
        
        if (!consultant) return; // Exit if the consultant is not found
        
        const confirmMsg = `Are you sure you want to select ${consultant.Name} for ${projectId}?`;
        
        if (confirm(confirmMsg)) {
            // Emit a 'pick consultant' event to the server
            socket.emit('pick consultant', { consultantId: currentConsultantId, projectId });
            currentConsultantId = null; // Reset the selected consultant ID
        }
    }
};