// Initialize the Socket.IO client
const socket = io();

// Variables to store the current user's data and draft state
let currentUser = null;
let assignedProjects = {}; // Projects assigned to the current user
let allConsultants = {}; // List of all consultants
let pmList = {}; // List of all PMs
let scList = {}; // List of all SCs
let drafted = new Set(); // Set of consultants already drafted
let currentConsultantId = null; // ID of the currently selected consultant
let hasPrivilege = false; // Whether the current user has the privilege to pick
let currentSemester = null;

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
const deferBtn = document.getElementById('defer-btn'); // Add reference to defer button
const leaveLobbyBtn = document.getElementById('leave-lobby');
const leaveDraftBtn = document.getElementById('leave-draft');
const endDraftBtn = document.getElementById("end-draft");

// Show the login modal when the app starts
loginModal.style.display = 'flex';

// Handle the login button click or pressing "Enter"
const validateAndSubmitLogin = () => {
    const id = useridInput.value.trim(); // Get the entered UserID
    const code = passcodeInput.value.trim(); // Get the entered join code

    // Clear any previous validation messages
    document.querySelectorAll('.error-message').forEach(el => el.remove());

    // check for valid sm and semester; check after null checks
    let isValid = true;

    // Validate UserID input
    if (!id) {
        const error = document.createElement('small');
        error.textContent = '*required';
        error.className = 'error-message';
        useridInput.insertAdjacentElement('afterend', error); // Add the error message directly below the input
        isValid = false;
    }

    // Validate Join Code input
    if (!code) {
        const error = document.createElement('small');
        error.textContent = '*required';
        error.className = 'error-message';
        passcodeInput.insertAdjacentElement('afterend', error); // Add the error message directly below the input
        isValid = false;
    }

    // Validate SM & semester before allowing login
    if (isValid) {
        fetch(`/api/login-validation?sm_id=${id}&project_semester=${code}`)
            .then(res => {
                console.log("Received response", res.status);
                if (!res.ok) throw new Error("SM ID not found for this semester");
                return res.json(); // even if empty
            })
            .then(() => {
                console.log("Emitting register sm...");
                currentSemester = code;
                socket.emit('register sm', { UserID: id, joinCode: code });
            })
            .catch(err => {
                alert("Login failed: " + err.message);
            });
    }
};

// Attach event listener to the login button
loginBtn.onclick = validateAndSubmitLogin;

// Allow pressing "Enter" to submit the form
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && loginModal.style.display === 'flex') {
        validateAndSubmitLogin();
    }
});

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
    socket.emit('start draft', { project_semester: currentSemester }); // Emit a 'start draft' event to the server
};

// Add handler for registration rejection
socket.on('registration rejected', (message) => {
    alert('Registration error: ' + message);
});

socket.on('endDraft', (message) => {
    console.log('Received endDraft event from server:', message);
    alert(message); 

    pickBtn.disabled = true;
    deferBtn.disabled = true;
    startBtn.disabled = true; 

     document.querySelectorAll('#consultants li').forEach(li => {
        li.onclick = null; // Disable clicking consultants
    });


});


// Handle the start of the draft
socket.on('draft started', () => {
    // Only show the draft interface if the user is already logged in
    if (currentUser) {
        lobby.style.display = 'none'; // Hide the lobby
        draftInterface.style.display = 'block'; // Show the draft interface
    }
    // If not logged in, do nothing - stay on login page
});

// Add handler for draft rejoined event
socket.on('draft rejoined', () => {
    lobby.style.display = 'none';
    draftInterface.style.display = 'block';
});

// Receive the pm data
socket.on('all pm', (allPM) => {
    pmList = allPM; // Update the assigned projects
});

// Receive the sc data
socket.on('all sc', (allSC) => {
    scList = allSC; // Update the assigned projects
});

// Receive the projects assigned to the current user
socket.on('assigned projects', (projects) => {
    assignedProjects = projects; // Update the assigned projects
    renderProjects(); // Render the projects in the UI
});

// Receive the list of all consultants
socket.on('all consultants', (consultants) => {
    console.log("Received consultants:", consultants);
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
            p.EC.forEach(ec => {
                drafted.add(ec.UserID); // Add drafted consultants to the set
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
    deferBtn.disabled = !hasPrivilege; // Enable or disable the defer button
    renderConsultants(); // Re-render the consultants
});

// Render the list of projects in the UI
function renderProjects() {
    projectList.innerHTML = ''; // Clear the current project list
    projectSelect.innerHTML = ''; // Clear the project dropdown

    for (const [projectId, data] of Object.entries(assignedProjects)) {
        const div = document.createElement('div');
        const ncList = (data.NC || []).map(nc => nc.Name).join(', ') || 'None'; // List of NCs for the project
        const ecList = (data.EC || []).map(ec => ec.Name).join(', ') || 'None';
        const scNames = (data.SC || []).map(scId => scList[scId]?.Name || '(Unknown)').join(', ');
        div.innerHTML = `
            <strong>${assignedProjects[projectId]['Description']} (${projectId})</strong><br>
            PM: ${pmList[data.PM]['Name']}<br>
            SCs: ${scNames}<br>
            NCs: ${ncList}<br>
            ECs: ${ecList}<br><br>
        `;
        projectList.appendChild(div); // Add the project to the list

        const opt = document.createElement('option');
        opt.value = projectId; // Set the project ID as the value
        opt.textContent = `${assignedProjects[projectId]['Description']} (${projectId})`; // Set the project ID as the text
        projectSelect.appendChild(opt); // Add the project to the dropdown
    }
}

// Render the list of consultants in the UI
// function renderConsultants() {
//     consultantList.innerHTML = ''; // Clear the current consultant list

//     Object.values(allConsultants).forEach(c => {
//         const li = document.createElement('li');
//         li.textContent = `${c.Name} (${c.UserID}) - ${c.UserID}, ${c.Email}, ${c.Role}, ${c.Major}, ${c.Year}, ${c.Num_SemestersInIBC}, ${c.ConsultantScore}, ${c.TimeZone}, ${c.Availability_Mon}, ${c.Availability_Tue}, ${c.Availability_Wed}, ${c.Availability_Thu}, ${c.Availability_Fri}, ${c.Availability_Sat}, ${c.Availability_Sun}, ${c.WillingToTravel}, ${c.WeekBeforeFinalsAvailability}, ${c.IndustryInterests}, ${c.FunctionalAreaInterests}`; // Consultant details

//         if (drafted.has(c.UserID)) {
//             li.classList.add('disabled'); // Mark the consultant as drafted
//         } else if (hasPrivilege) {
//             li.classList.remove('disabled');
//             li.onclick = () => {
//                 currentConsultantId = c.UserID; // Set the selected consultant ID
//                 document.querySelectorAll('#consultants li').forEach(el => {
//                     el.classList.remove('highlight'); // Remove highlight from other consultants
//                 });
//                 li.classList.add('highlight'); // Highlight the selected consultant
//             };
//         } else {
//             li.classList.remove('highlight');
//             li.onclick = null; // Disable click events for other users
//         }
//         consultantList.appendChild(li); // Add the consultant to the list
//     });
// }

function createTimeGrid(consultant) {
    // Generate time labels (7am to 10pm in 30min intervals)
    const timeSlots = [];
    for (let hour = 7; hour < 22; hour++) {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour > 12 ? hour - 12 : hour;
        timeSlots.push(`${hour12}:00${ampm}`);
        timeSlots.push(`${hour12}:30${ampm}`);
    }
    timeSlots.push('10:00PM'); // Add the final 10 PM slot

    // Convert availability string to array of booleans, padding with zeros if needed
    const getAvailabilityArray = (bitString) => {
        const bits = bitString ? bitString.split('').map(bit => bit === '1') : [];
        return bits.concat(Array(30 - bits.length).fill(false));
    };

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const availabilities = {
        Mon: getAvailabilityArray(consultant.Availability_Mon),
        Tue: getAvailabilityArray(consultant.Availability_Tue),
        Wed: getAvailabilityArray(consultant.Availability_Wed),
        Thu: getAvailabilityArray(consultant.Availability_Thu),
        Fri: getAvailabilityArray(consultant.Availability_Fri),
        Sat: getAvailabilityArray(consultant.Availability_Sat),
        Sun: getAvailabilityArray(consultant.Availability_Sun)
    };

    return `
        <div class="availability-wrapper">
            <div class="availability-calendar">
                <div class="calendar-header">
                    <div class="time-column">Time</div>
                    ${days.map(day => `<div class="day-header">${day}</div>`).join('')}
                </div>
                <div class="calendar-grid">
                    ${timeSlots.map((time, i) => `
                        <div class="time-row">
                            <div class="time-label">${time}</div>
                            ${days.map(day => `
                                <div class="time-slot-container">
                                    <div class="time-grid-line"></div>
                                    ${i < timeSlots.length - 1 ? `
                                        <div class="time-slot ${availabilities[day][i] ? 'available' : ''}" 
                                            data-time="${time}"
                                            data-day="${day}">
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderConsultants() {
    consultantList.innerHTML = ''; // Clear the current consultant list

    Object.values(allConsultants).forEach(c => {
        const card = document.createElement('div');
        card.className = 'consultant-mini-card';
        
        card.innerHTML = `
            <div class="consultant-name">${c.Name} (${c.UserID}) - Role: ${c.Role} | Score: ${c.ConsultantScore}</div>
        `;

        if (drafted.has(c.UserID)) {
            card.classList.add('disabled');
        } else if (hasPrivilege) {
            card.classList.remove('disabled');
            card.onclick = () => {
                currentConsultantId = c.UserID;
                document.querySelectorAll('.consultant-mini-card').forEach(el => {
                    el.classList.remove('highlight');
                });
                card.classList.add('highlight');
                showConsultantDetails(c);
            };
        } else {
            card.classList.remove('highlight');
            card.onclick = null; // Disable click events for other users
        }
        
        consultantList.appendChild(card);
    });
}

function showConsultantDetails(consultant) {
    // Create or show sidebar
    let sidebar = document.getElementById('consultant-sidebar');
    if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'consultant-sidebar';
        document.body.appendChild(sidebar);
    }

    // Get the content wrapper
    const contentWrapper = document.querySelector('.content-wrapper');

    sidebar.innerHTML = `
        <div class="sidebar-header">
            <h2>${consultant.Name}</h2>
            <button class="close-sidebar">×</button>
        </div>
        <div class="sidebar-content">
            <section>
                <h3>Basic Information</h3>
                <p><strong>UserID:</strong> ${consultant.UserID}</p>
                <p><strong>Email:</strong> ${consultant.Email}</p>
                <p><strong>Role:</strong> ${consultant.Role}</p>
                <p><strong>Major:</strong> ${consultant.Major}</p>
                <p><strong>Year:</strong> ${consultant.Year}</p>
                <p><strong>IBC Experience:</strong> ${consultant.Num_SemestersInIBC} semesters</p>
                <p><strong>Score:</strong> ${consultant.ConsultantScore}</p>
            </section>

            <section>
                <h3>Availability</h3>
                ${createTimeGrid(consultant)}
                <p><strong>Time Zone:</strong> ${consultant.TimeZone}</p>
                <p><strong>Willing to Travel:</strong> ${consultant.WillingToTravel}</p>
                <p><strong>Finals Week:</strong> ${consultant.WeekBeforeFinalsAvailability}</p>
            </section>

            <section>
                <h3>Interests</h3>
                <p><strong>Industry:</strong> ${consultant.IndustryInterests}</p>
                <p><strong>Functional Areas:</strong> ${consultant.FunctionalAreaInterests}</p>
            </section>
        </div>
    `;

    sidebar.classList.add('active');
    contentWrapper.classList.add('sidebar-active');

    // Handle close button
    sidebar.querySelector('.close-sidebar').onclick = () => {
        sidebar.classList.remove('active');
        contentWrapper.classList.remove('sidebar-active');
        document.querySelectorAll('.consultant-mini-card').forEach(el => {
            el.classList.remove('highlight');
        });
        currentConsultantId = null;
    };
}

// Handle the pick button click
pickBtn.onclick = () => {
    if (currentConsultantId) {
        const projectId = projectSelect.value; // Get the selected project ID
        const consultant = Object.values(allConsultants).find(c => c.UserID === currentConsultantId); // Find the selected consultant

        if (!consultant) return; // Exit if the consultant is not found

        const confirmMsg = `Are you sure you want to select ${consultant.Name} for ${assignedProjects[projectId]['Description']} (${projectId})?`;

        if (confirm(confirmMsg)) {
            // Emit a 'pick consultant' event to the server
            socket.emit('pick consultant', { consultantId: currentConsultantId, projectId });
            currentConsultantId = null; // Reset the selected consultant ID
        }
    }
};

// Handle the defer button click
deferBtn.onclick = () => {
    if (confirm('Are you sure you want to skip your turn?')) {
        socket.emit('defer turn'); // Emit a 'defer turn' event to the server
    }
};

leaveLobbyBtn.onclick = () => {
    if (confirm('Are you sure you want to leave the lobby?')) {
        socket.emit('leave lobby');
        lobby.style.display = 'none';
        loginModal.style.display = 'flex';
    }
};

leaveDraftBtn.onclick = () => {
    if (confirm('Are you sure you want to leave the draft? You can rejoin later with the same SM ID.')) {
        socket.emit('leave lobby');
        draftInterface.style.display = 'none';
        loginModal.style.display = 'flex';
    }
};

endDraftBtn.onclick = () => {
    if (confirm('Are you sure you want to end the draft?')) {
        socket.emit('end draft');
    }

};