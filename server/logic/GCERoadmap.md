# Migration Roadmap: Cloud Run to Compute Engine

This document outlines the step-by-step process for migrating a full-stack application with persistent WebSocket connections from Google Cloud Run to a Google Compute Engine (GCE) virtual machine. This move provides a more suitable environment for long-lasting connections, which are not ideal for Cloud Run's serverless architecture.

---

## Step 1: Prepare Your Application for GCE

The application is already containerized for Cloud Run, which is a great start. For a VM, you'll need a startup script to automate the deployment process.

### Create a Startup Script
Write a shell script (e.g., `startup-script.sh`) that will run automatically when the VM boots up. This script should perform the following tasks:

- Install Node.js and npm.
- Clone your application's code from a repository (e.g., GitHub or Google Cloud Source Repositories).
- Install Node.js dependencies: `npm install`.
- Start your application using a process manager like PM2 to keep it running continuously and restart it if it crashes.

---

## Step 2: Set Up Your Compute Engine Instance

This is the core of your migration. You'll create and configure the VM where your application will live.

### Create a New VM Instance
In the Google Cloud Console, navigate to **Compute Engine** and select **Create Instance**.

- **Name:** Choose a descriptive name (e.g., `my-app-server`).
- **Region and Zone:** Pick a location close to your users.
- **Machine type:** Select a machine type that meets your resource requirements (e.g., `e2-standard`).
- **Boot disk:** Choose a Linux distribution like Debian or Ubuntu.
- **Firewall:** Check the boxes to **Allow HTTP traffic** and **Allow HTTPS traffic**.
- **Startup script:** Under the **Management** tab, paste your startup script into the "Startup script" section.

### Configure Firewall Rules
Create a new firewall rule to allow traffic on the specific port your Node.js application listens on (e.g., `8080` or `3000`):

1. Go to **VPC network > Firewall**.
2. Create a new rule.
3. Under **Protocols and ports**, specify `tcp:[YOUR_APP_PORT]`.

---

## Step 3: Deploy and Test Your Application

With the VM and firewall rules in place, it's time to get your application running.

### Start the Instance
The VM will begin provisioning and automatically run your startup script. Monitor its progress by viewing the **serial port output** in the Google Cloud Console.

### Verify the Deployment
Once the startup script completes:

1. Find the **external IP address** of your VM.
2. Navigate to `http://[YOUR_VM_EXTERNAL_IP]:[YOUR_APP_PORT]` to confirm your application is running.

### Test WebSockets
Check that your WebSocket connections are stable and persistent, confirming that the migration was successful for your core use case.

---

## Step 4: Configure a Custom Domain and SSL

For a production-ready application, you need to use a custom domain and secure it with an SSL certificate.

### Point DNS Records
Create an A record with your domain provider that points to the **external IP address** of your Compute Engine VM.

### Set Up a Reverse Proxy (NGINX)
A reverse proxy is a best practice for managing incoming web traffic. It will listen on ports 80 and 443 and forward requests to your application's internal port.

1. SSH into your VM and install NGINX:
   ```bash
   sudo apt-get install nginx
