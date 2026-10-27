// Digital Sticky Note Wall - server.js
// Relays notes submitted from the iPad ("/submit") to every connected
// LED display ("/display") in real time using Socket.io.

const express = require("express");
const http = require("http");
const os = require("os");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // fine for a local event/cafe setup
  maxHttpBufferSize: 5e6 // 5MB - handwriting images are bigger than plain text
});

const PORT = process.env.PORT || 3000;

// Serve the static frontend files (submit.html, display.html, css/js)
app.use(express.static(path.join(__dirname, "public")));

// Clean routes: /submit and /display instead of the .html filenames
app.get("/", (req, res) => {
  res.redirect("/submit");
});

app.get("/submit", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "submit.html"));
});
app.get("/display", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "display.html"));
});

// Find the machine's LAN IP so we can print a real, clickable address
// instead of a placeholder (mirrors the car-sync server's startup log).
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

// Keep the last N notes in memory so a display that connects/refreshes
// late still sees the current wall instead of a blank screen.
const MAX_HISTORY = 60;
let noteHistory = [];

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // When a display page first connects, send it the current wall state
  socket.emit("history", noteHistory);

  // A new note arrives from an iPad ("/submit" page) - either a
  // handwritten drawing (note.image, a PNG data URL) or, for backward
  // compatibility, typed text (note.text).
  socket.on("new_note", (note) => {
    const cleanText = String(note.text || "").trim().slice(0, 280);
    const image = typeof note.image === "string" && note.image.startsWith("data:image/")
      ? note.image
      : null;

    if (!cleanText && !image) return;

    const payload = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      text: cleanText,
      image: image,
      color: note.color || "yellow",
      createdAt: Date.now()
    };

    noteHistory.push(payload);
    if (noteHistory.length > MAX_HISTORY) {
      noteHistory.shift();
    }

    // Broadcast to every connected client (all displays + other tablets)
    io.emit("new_note", payload);
  });

  // Optional: allow clearing the wall (e.g. from an admin control)
  socket.on("clear_wall", () => {
    noteHistory = [];
    io.emit("wall_cleared");
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  const ip = getLocalIp();
  console.log(`\n=== Sticky Wall Server running ===`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${ip}:${PORT}\n`);
  console.log(`Open /submit on the iPad, /display on the machine wired to the LED screen.\n`);
});
