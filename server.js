const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

// ---------------------------------------------------------------------------
// THE SECRET. This is the only place this value lives. It is never sent to
// any client until the finale bar hits 100%, and even then only as part of
// the one-shot "reveal" event payload — never stored in any earlier message,
// never logged, never embedded in any client-facing file.
// Set via environment variable on Render so it never sits in committed code.
// Falls back to 'boy' only for local testing convenience.
// ---------------------------------------------------------------------------
const REVEAL_GENDER = (process.env.REVEAL_GENDER || 'boy').toLowerCase(); // 'boy' or 'girl'
const REVEAL_COLOR = REVEAL_GENDER === 'boy' ? 'blue' : 'pink';

const ROUNDS = [
  'lobby',
  'round1_diaperdash',
  'round2_pickacard',
  'round3_nursery',
  'round4_tugofwar',
  'round5_lullaby',
  'finale',
  'revealed'
];

const NURSERY_ITEMS = ['crib', 'mobile', 'rocking_chair', 'lamp', 'rug', 'bookshelf', 'teddy_bear', 'window_curtain', 'changing_table'];
const CARD2_ICONS = ['bottle', 'bib', 'sock', 'rattle'];
const CARD5_ICONS = ['stroller', 'onesie', 'pacifier', 'blanket'];

// ---------------------------------------------------------------------------
// In-memory game state. One shared session for the whole event — simple by
// design, since this only ever needs to run once, live, for one party.
// ---------------------------------------------------------------------------
let state = {
  phase: 'lobby',
  players: {}, // socketId -> { id, name, connected, cart_progress, vote, placed, mash_count, beat_hits }
  round3_order: [],
  round3_index: 0,
  round3_placements: [],
  round4_votes: { pink: 0, blue: 0 },
  round5_icons: CARD2_ICONS,
  finale_progress: 0,
  finale_target: 0, // computed when finale starts, based on player count
};

function resetRoundData() {
  Object.values(state.players).forEach(p => {
    p.cart_progress = 0;
    p.vote = null;
    p.placed = false;
  });
  state.round4_votes = { pink: 0, blue: 0 };
}

function publicPlayerList() {
  return Object.values(state.players).map(p => ({
    id: p.id,
    name: p.name,
    connected: p.connected
  }));
}

function broadcastLobby() {
  io.emit('lobby_update', {
    players: publicPlayerList(),
    canStart: Object.values(state.players).filter(p => p.connected).length >= 5
  });
}

function broadcastRoundState() {
  io.emit('round_state', buildRoundStatePayload());
}

function buildRoundStatePayload() {
  switch (state.phase) {
    case 'round1_diaperdash':
      return {
        phase: state.phase,
        carts: Object.values(state.players).map(p => ({ name: p.name, progress: p.cart_progress || 0 }))
      };
    case 'round2_pickacard':
      return { phase: state.phase, icons: CARD2_ICONS, tallies: tally('round2') };
    case 'round3_nursery':
      return {
        phase: state.phase,
        placements: state.round3_placements,
        currentPlayer: state.round3_order[state.round3_index] ? state.players[state.round3_order[state.round3_index]]?.name : null,
        currentItem: NURSERY_ITEMS[state.round3_index] || null
      };
    case 'round4_tugofwar':
      return { phase: state.phase, votes: state.round4_votes };
    case 'round5_lullaby':
      return { phase: state.phase };
    case 'finale':
      return { phase: state.phase, progress: state.finale_progress, target: state.finale_target };
    case 'revealed':
      return { phase: state.phase, color: REVEAL_COLOR };
    default:
      return { phase: state.phase };
  }
}

function tally(roundKey) {
  const counts = {};
  Object.values(state.players).forEach(p => {
    const v = p[roundKey + '_vote'];
    if (v) counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    state.players[socket.id] = {
      id: socket.id,
      name: (name || 'Guest').slice(0, 20),
      connected: true,
      cart_progress: 0,
      mash_count: 0
    };
    socket.emit('joined', { phase: state.phase });
    broadcastLobby();
  });

  socket.on('host_start_anyway', () => {
    advancePhase('round1_diaperdash');
  });

  socket.on('host_advance', () => {
    if (state.phase === 'round3_nursery') return; // this round advances on its own via placements
    const idx = ROUNDS.indexOf(state.phase);
    if (idx >= 0 && idx < ROUNDS.length - 1) {
      advancePhase(ROUNDS[idx + 1]);
    }
  });

  socket.on('tap_cart', () => {
    const p = state.players[socket.id];
    if (p && state.phase === 'round1_diaperdash') {
      p.cart_progress = Math.min(100, (p.cart_progress || 0) + 3);
      broadcastRoundState();
    }
  });

  socket.on('vote_card', (icon) => {
    const p = state.players[socket.id];
    if (p && state.phase === 'round2_pickacard') {
      p.round2_vote = icon;
      broadcastRoundState();
    }
  });

  socket.on('vote_card5', (icon) => {
    const p = state.players[socket.id];
    if (p && state.phase === 'round5_lullaby') {
      p.round5_vote = icon;
    }
  });

  socket.on('place_item', (spot) => {
    const p = state.players[socket.id];
    if (!p || state.phase !== 'round3_nursery') return;
    const expectedId = state.round3_order[state.round3_index];
    if (socket.id !== expectedId) return; // not your turn
    state.round3_placements.push({ item: NURSERY_ITEMS[state.round3_index], spot, player: p.name });
    state.round3_index += 1;
    if (state.round3_index >= state.round3_order.length || state.round3_index >= NURSERY_ITEMS.length) {
      setTimeout(() => advancePhase('round4_tugofwar'), 1200);
    }
    broadcastRoundState();
  });

  socket.on('vote_tug', (color) => {
    const p = state.players[socket.id];
    if (p && state.phase === 'round4_tugofwar' && !p.tug_voted) {
      p.tug_voted = true;
      state.round4_votes[color] = (state.round4_votes[color] || 0) + 1;
      broadcastRoundState();
    }
  });

  socket.on('beat_tap', () => {
    const p = state.players[socket.id];
    if (p && state.phase === 'round5_lullaby') {
      p.beat_hits = (p.beat_hits || 0) + 1;
    }
  });

  socket.on('mash', () => {
    const p = state.players[socket.id];
    if (p && state.phase === 'finale' && state.finale_progress < state.finale_target) {
      p.mash_count = (p.mash_count || 0) + 1;
      state.finale_progress = Math.min(state.finale_target, state.finale_progress + 1);
      broadcastRoundState();
      if (state.finale_progress >= state.finale_target) {
        setTimeout(() => triggerReveal(), 400);
      }
    }
  });

  socket.on('disconnect', () => {
    if (state.players[socket.id]) {
      state.players[socket.id].connected = false;
      broadcastLobby();
    }
  });
});

function advancePhase(newPhase) {
  // Guard against duplicate/out-of-order transitions — e.g. the host tapping
  // "advance" right as an auto-advance timer (like round 3's) also fires.
  const currentIdx = ROUNDS.indexOf(state.phase);
  const newIdx = ROUNDS.indexOf(newPhase);
  if (newIdx <= currentIdx) return; // already here or past it — ignore

  state.phase = newPhase;

  if (newPhase === 'round1_diaperdash' || newPhase === 'round2_pickacard') {
    resetRoundData();
  }

  if (newPhase === 'round3_nursery') {
    state.round3_order = Object.values(state.players).filter(p => p.connected).map(p => p.id);
    state.round3_index = 0;
    state.round3_placements = [];
  }

  if (newPhase === 'round4_tugofwar') {
    state.round4_votes = { pink: 0, blue: 0 };
    Object.values(state.players).forEach(p => { p.tug_voted = false; });
  }

  if (newPhase === 'finale') {
    const activeCount = Math.max(1, Object.values(state.players).filter(p => p.connected).length);
    state.finale_progress = 0;
    state.finale_target = activeCount * 12; // ~12 taps per person, tunable
  }

  io.emit('phase_change', { phase: newPhase });
  broadcastRoundState();
}

function triggerReveal() {
  if (state.phase === 'revealed') return; // already revealed — never fire twice
  // The ONLY moment REVEAL_COLOR is ever transmitted to any client.
  state.phase = 'revealed';
  io.emit('phase_change', { phase: 'revealed' });
  io.emit('reveal', { color: REVEAL_COLOR });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
