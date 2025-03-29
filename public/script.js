// script.js

document.addEventListener("DOMContentLoaded", function () {
    const messageForm = document.getElementById("messageForm");
    const usernameInput = document.getElementById("usernameInput");
    const messageInput = document.getElementById("messageInput");
    const displayText = document.getElementById("displayText");
  
    messageForm.addEventListener("submit", function (e) {
      e.preventDefault(); // Prevent form submission
  
      const username = usernameInput.value;
      const message = messageInput.value;
  
      // Update display text
      if (username && message) {
        displayText.textContent = `${username}: ${message}`;
      } else {
        displayText.textContent = "Please enter both a username and a message!";
      }
  
      // Clear input fields
      usernameInput.value = "";
      messageInput.value = "";
    });
  });
  