# Digital Sticky Note Wall

Real-time feedback wall: people write notes on an iPad/tablet, and they
instantly appear as sticky notes on a big screen/LED TV for everyone to see.

## How it works

- `server.js` — a small Node.js server (Express + Socket.io) that relays
  every new note to all connected screens instantly.
- `public/submit.html` — the page opened on the iPad. Person writes with
  their finger or Apple Pencil on a canvas, picks a sticky color, taps
  submit. What they write is captured as an image (their actual
  handwriting), not typed text.
- `public/display.html` — the page opened on whatever drives the LED
  screen (Raspberry Pi, mini PC, laptop with HDMI out). Shows all notes as
  a live sticky-note wall.

## Running it locally (test on your laptop first)

1. Install Node.js (v18+) if you don't have it: https://nodejs.org
2. In this folder, install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open two browser tabs/windows:
   - `http://localhost:3000/submit.html` — pretend this is the iPad
   - `http://localhost:3000/display.html` — pretend this is the LED screen
5. Type a note and submit — it should pop up on the display tab instantly.

## Running it on your actual iPad + a screen

1. Run `npm start` on a laptop, mini PC, or Raspberry Pi that stays on and
   is connected to the SAME WiFi network as the iPad.
2. Find that machine's local IP address:
   - Mac: System Settings → Network → Wi-Fi → shows something like
     `192.168.1.42`
   - Windows: `ipconfig` in Command Prompt, look for "IPv4 Address"
   - Raspberry Pi: `hostname -I`
3. On the iPad's Safari, open:
   `http://<that-ip>:3000/submit.html`
   Then use "Add to Home Screen" so it opens full screen without browser
   bars. You can also turn on Guided Access (Settings → Accessibility →
   Guided Access) to lock the iPad into just this page.
4. On the device connected to the LED screen (via HDMI), open a browser in
   full-screen/kiosk mode pointed at:
   `http://<that-ip>:3000/display.html`
   - Chrome kiosk mode: `chrome --kiosk http://<that-ip>:3000/display.html`
5. That's it — any note submitted on the iPad shows up on the LED screen
   within a fraction of a second.

## Notes / things to tweak later

- Notes are kept in memory only (last 60), so restarting the server clears
  the wall. Swap in a database (e.g. SQLite or Firebase) if you want the
  wall to persist across restarts. Note: since notes now carry a small
  handwriting image each, 60 of them takes noticeably more memory than
  60 lines of text — lower MAX_HISTORY in server.js if that matters.
- No moderation/profanity filter is included — add one if this is public
  facing at a real event (harder to moderate handwriting automatically
  than typed text, worth keeping in mind).
- To go from local-network-only to something that works from anywhere
  (e.g. multiple cafe branches), deploy `server.js` to a host like Render
  or Railway and point both pages at that public URL instead of the local
  IP.
- Pencil pressure sensitivity is on by default (thicker strokes = harder
  press). Tweak the `2 + pressure * 4` line in submit.html if you want a
  thinner/thicker feel.
