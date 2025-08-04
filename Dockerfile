FROM node:18-slim

# Create and set working directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy only what’s needed
COPY public ./public
COPY server ./server
COPY db.js .
COPY server.js .

# Serve static frontend + backend
EXPOSE 3000

CMD ["node", "server.js"]
