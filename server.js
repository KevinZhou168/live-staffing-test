const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

var id = [];

io.on('connection', (socket) => {
  id.push(socket.id);
  console.log(io.engine.clientsCount + ' users connected');
  socket.on('disconnect', () => {
    console.log(io.engine.clientsCount + ' users connected');
  });
  socket.on('chat message', (msg) => {
    io.emit('chat message', socket.id + ": " + msg);
  });
});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});