// script.js

document.addEventListener("DOMContentLoaded", function () {
    const messageForm = document.getElementById("messageForm");
    const usernameInput = document.getElementById("usernameInput");
    const messageInput = document.getElementById("messageInput");
    const displayText = document.getElementById("displayText");
  
    // Establish connection with the server
    const socket = io();
  
    // Listen for messages from the server
    socket.on('message', function(data) {
      displayText.textContent = `${data.username}: ${data.message}`;
    });
  
    messageForm.addEventListener("submit", function (e) {
      e.preventDefault(); // Prevent form submission
  
      const username = usernameInput.value;
      const message = messageInput.value;
  
      // Send the message to the server
      if (username && message) {
        socket.emit('message', { username, message });
      }
  
      // Clear input fields
      usernameInput.value = "";
      messageInput.value = "";
    });
  });
  