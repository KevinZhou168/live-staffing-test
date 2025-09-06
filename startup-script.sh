#!/bin/bash

# Update and install necessary packages
sudo apt-get update
sudo apt-get install -y curl git build-essential

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 to manage the Node.js application
sudo npm install -g pm2

# Clone the application repository (replace with your repository URL)
git clone https://github.com/your-username/your-repo.git /home/app

# Navigate to the application directory
cd /home/app

# Install application dependencies
npm install

# Set environment variables (replace with your actual values)
export PORT=3000
export PG_USER="your_pg_user"
export PG_PASSWORD="your_pg_password"
export PG_HOST="your_pg_host"
export PG_PORT="your_pg_port"
export PG_DB="your_pg_db"
export SHEET_HISTORY_URL="your_google_sheet_url"
export FRONTEND_ORIGIN="your_frontend_origin"

# Start the application using PM2
pm2 start server.js --name "live-staffing-app"

# Ensure PM2 restarts the app on reboot
pm2 startup
pm2 save