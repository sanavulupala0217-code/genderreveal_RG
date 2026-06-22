# Little Delivery — Gender Reveal Game

A 5-round co-op multiplayer party game for 9 players (phones as controllers,
one shared screen on a TV). Built for: Diaper Dash → Pick a Card → Build the
Nursery → Tug of War → Lullaby Mash → The Big Delivery (reveal).

## What's in this folder
- `server.js` — the game server (Node.js + Socket.io). The reveal gender
  lives ONLY here, as an environment variable, never in any file sent to
  a browser.
- `public/index.html` — the **host screen**. Open this on the laptop/device
  that's AirPlaying to the TV.
- `public/play.html` — the **player screen**. This is what the QR code on
  the host screen links to; each of the 9 people opens this on their own
  phone.
- `package.json` — dependencies or Render to install automatically.

## Deploy steps (all free, no credit card required)

### 1. Put the code on GitHub
1. Create a free account at github.com if you don't have one.
2. Create a new repository (e.g. "gender-reveal-game"), keep it **private**
   if you want the reveal config extra-safe (not required, just tidy).
3. Upload all the files in this folder to that repo (drag-and-drop works
   fine on github.com, or use `git push` if you're comfortable with it).

### 2. Deploy on Render
1. Create a free account at render.com (no card needed).
2. Click **New → Web Service**.
3. Connect your GitHub account, select the repo you just made.
4. Render will detect it's a Node app automatically. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
5. Before deploying, add an **environment variable**:
   - Key: `REVEAL_GENDER`
   - Value: `boy`
   (This is the one place the answer lives — never put it in the code itself.)
6. Click **Create Web Service**. First deploy takes a few minutes.
7. Render gives you a live URL like `https://your-app-name.onrender.com`.
   That's your host screen — open it on whatever device AirPlays to the TV.

### 3. Set up the keep-alive ping
1. Create a free account at uptimerobot.com.
2. Add a new monitor: type **HTTP(s)**, paste your Render URL.
3. Set the check interval to **5 minutes**.
4. **On the day of the party**, make sure this monitor is active starting
   at least 30-60 minutes before you plan to play, so the server is warm
   and doesn't make everyone wait through a cold start.

### 4. The day of the event
1. Turn on your phone's mobile hotspot (Settings app).
2. Connect the host laptop/device AND all 9 phones to that hotspot —
   don't rely on venue WiFi.
3. Open your Render URL on the host device, get it AirPlaying to the TV.
4. Everyone scans the QR code (or types the short URL shown) on their own
   phone to join.
5. Once 5+ people show as connected, hit "start anyway" — or wait for all 9.
6. The game runs itself through all 5 rounds. Use the small "advance ▸"
   button in the corner of the host screen to move on from rounds 1, 2, 4,
   and 5 when you're ready (round 3 advances on its own once everyone's
   placed their item).
7. The finale and reveal trigger automatically once the group fills the bar.

## Before the actual day — please test this once
Gather a few real phones (doesn't need to be all 9) on your hotspot at
home, run through the whole flow once. This is the single most important
step for catching anything that only shows up on real devices and real
WiFi, not just on one screen during development.

## Changing things later
- **Pink/blue, round timing, button labels, icon sets:** easy — just edit
  the relevant value and redeploy (Render auto-redeploys on every GitHub
  push).
- **Adding/removing a round, changing player count assumptions:** doable,
  but re-test on real phones afterward, don't just trust that it "compiled."
- **Anything in the WebSocket/networking logic:** the riskiest thing to
  touch close to the event — budget real retest time, ideally not the
  night before.
