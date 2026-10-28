// Digital Sticky Note Wall - server.js
// Relays notes submitted from the iPad ("/submit") to every connected
// LED display ("/display") in real time using Socket.io, AND saves every
// note permanently to disk so nothing is lost, even across restarts.

const express = require("express");
const http = require("http");
const os = require("os");
const fs = require("fs");
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

// ---------------------------------------------------------------------
// Permanent storage (new): every note is saved to this PC's disk, inside
// a "notes-archive" folder right next to server.js. This is separate
// from the live wall below - the archive keeps EVERY note forever, as a
// running memory book, not just the last few that are currently showing.
// ---------------------------------------------------------------------
const ARCHIVE_DIR = path.join(__dirname, "notes-archive");
const IMAGES_DIR = path.join(ARCHIVE_DIR, "images");
const INDEX_FILE = path.join(ARCHIVE_DIR, "index.json");

fs.mkdirSync(IMAGES_DIR, { recursive: true });

function loadArchiveIndex() {
  try {
    const raw = fs.readFileSync(INDEX_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return []; // no archive yet, or unreadable - start fresh
  }
}

function saveArchiveIndex(index) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

// Every note ever submitted, kept forever (id, color, timestamp, and
// which image file in notes-archive/images/ holds the handwriting).
let archiveIndex = loadArchiveIndex();

function archiveNote(payload) {
  try {
    let imageFile = null;
    if (payload.image) {
      const base64Data = payload.image.replace(/^data:image\/png;base64,/, "");
      imageFile = `${payload.id}.png`;
      fs.writeFileSync(path.join(IMAGES_DIR, imageFile), Buffer.from(base64Data, "base64"));
    }
    archiveIndex.push({
      id: payload.id,
      text: payload.text,
      imageFile,
      color: payload.color,
      createdAt: payload.createdAt
    });
    saveArchiveIndex(archiveIndex);
  } catch (err) {
    console.error("Failed to save note to disk:", err.message);
  }
}

// Keep the last N notes in memory so a display that connects/refreshes
// late still sees the current wall instead of a blank screen. This is
// just for the live wall - it is NOT the permanent record (see above).
const MAX_HISTORY = 60;

// On startup, rebuild the live wall from whatever was archived last, so
// restarting the server doesn't wipe what people are currently seeing.
function seedHistoryFromArchive() {
  const recent = archiveIndex.slice(-MAX_HISTORY);
  return recent.map((entry) => {
    let image = null;
    if (entry.imageFile) {
      try {
        const buf = fs.readFileSync(path.join(IMAGES_DIR, entry.imageFile));
        image = `data:image/png;base64,${buf.toString("base64")}`;
      } catch (err) {
        image = null; // image file missing/corrupted - skip it, keep going
      }
    }
    return {
      id: entry.id,
      text: entry.text || "",
      image,
      color: entry.color,
      createdAt: entry.createdAt
    };
  });
}

let noteHistory = seedHistoryFromArchive();

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

    // Save it permanently to this PC first, then update the live wall.
    archiveNote(payload);

    noteHistory.push(payload);
    if (noteHistory.length > MAX_HISTORY) {
      noteHistory.shift();
    }

    // Broadcast to every connected client (all displays + other tablets)
    io.emit("new_note", payload);
  });

  // Optional: allow clearing the wall (e.g. from an admin control).
  // This only clears what's currently showing - the permanent archive
  // on disk is untouched, so nothing is actually deleted.
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
  console.log(`Network: http://${ip}:${PORT}`);
  console.log(`Notes are being saved permanently to: ${ARCHIVE_DIR}\n`);
  console.log(`Open /submit on the iPad, /display on the machine wired to the LED screen.\n`);
});