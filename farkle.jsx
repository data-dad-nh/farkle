import { useState, useEffect, useRef, useCallback } from "react";
import { Users, Copy, Bot, Crown, RotateCw, Check, Plus, LogOut, Trophy, ScrollText, Dices } from "lucide-react";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const COLORS = {
  feltDark: "#142A20",
  felt: "#1F3D2E",
  feltLight: "#2A4F3B",
  feltLine: "#3B6A50",
  ivory: "#F2ECDD",
  ivoryDim: "#E4DCC6",
  ink: "#24241E",
  inkSoft: "#5B5A4E",
  brass: "#C9A227",
  brassBright: "#E0BC4A",
  brassDim: "#8A731C",
  maroon: "#8C2F2F",
  maroonBright: "#B44040",
};

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap');";

const FONT_DISPLAY = "'Fraunces', Georgia, serif";
const FONT_BODY = "'Inter', system-ui, -apple-system, sans-serif";
const FONT_MONO = "'IBM Plex Mono', 'Courier New', monospace";

// ---------------------------------------------------------------------------
// Pure Farkle game-logic helpers
// ---------------------------------------------------------------------------
const FACES = [1, 2, 3, 4, 5, 6];
const TARGET_SCORE = 10000;
const BOARD_MINIMUM = 500;

const PIP_LAYOUTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function rollDice(n) {
  return Array.from({ length: n }, rollDie);
}

function tally(values) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  values.forEach((v) => (c[v] += 1));
  return c;
}

function isStraightCounts(c) {
  return FACES.every((f) => c[f] === 1);
}

function isThreePairCounts(c) {
  const pairFaces = FACES.filter((f) => c[f] === 2);
  return pairFaces.length === 3 && FACES.every((f) => c[f] === 0 || c[f] === 2);
}

function isTwoTripletCounts(c) {
  const tripFaces = FACES.filter((f) => c[f] === 3);
  return tripFaces.length === 2 && FACES.every((f) => c[f] === 0 || c[f] === 3);
}

// Score a specific subset of dice the player has chosen to bank.
// Returns { valid, score }. Invalid means the selection includes
// dice that don't belong to any scoring group (can't be banked as-is).
function computeScore(values) {
  const n = values.length;
  if (n === 0) return { valid: false, score: 0 };
  const c = tally(values);

  if (n === 6) {
    if (isStraightCounts(c)) return { valid: true, score: 1500 };
    if (isThreePairCounts(c)) return { valid: true, score: 1500 };
    if (isTwoTripletCounts(c)) return { valid: true, score: 2500 };
  }

  let score = 0;
  const rem = { ...c };
  for (const f of FACES) {
    if (rem[f] >= 3) {
      const base = f === 1 ? 1000 : f * 100;
      const extra = rem[f] - 3;
      score += base * Math.pow(2, extra);
      rem[f] = 0;
    }
  }
  score += rem[1] * 100;
  score += rem[5] * 50;
  rem[1] = 0;
  rem[5] = 0;

  const leftover = rem[2] > 0 || rem[3] > 0 || rem[4] > 0 || rem[6] > 0;
  if (leftover) return { valid: false, score: 0 };
  return { valid: true, score };
}

// Does this freshly-rolled set of dice contain ANY scoring possibility at all?
function isFarkleRoll(values) {
  const c = tally(values);
  if (c[1] > 0 || c[5] > 0) return false;
  for (const f of [2, 3, 4, 6]) if (c[f] >= 3) return false;
  if (values.length === 6 && isThreePairCounts(c)) return false;
  return true;
}

// Bot / auto-select strategy: take every scoring die available.
function autoSelectIndices(values) {
  const c = tally(values);
  if (values.length === 6 && (isStraightCounts(c) || isThreePairCounts(c) || isTwoTripletCounts(c))) {
    return values.map((_, i) => i);
  }
  const tripletFaces = new Set(FACES.filter((f) => c[f] >= 3));
  const indices = [];
  values.forEach((v, i) => {
    if (tripletFaces.has(v) || v === 1 || v === 5) indices.push(i);
  });
  return indices;
}

// ---------------------------------------------------------------------------
// Storage helpers (online rooms)
// ---------------------------------------------------------------------------
async function loadRoom(code) {
  const res = await window.storage.get("farkle:" + code, true);
  if (!res) throw new Error("not found");
  return JSON.parse(res.value);
}

async function saveRoom(game) {
  await window.storage.set("farkle:" + game.code, JSON.stringify(game), true);
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------
function Die({ value, selected, onClick, clickable, dimmed, size }) {
  const s = size || 56;
  const pipSet = new Set(PIP_LAYOUTS[value] || []);
  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className="rounded-xl shrink-0 transition-transform"
      style={{
        width: s,
        height: s,
        background: dimmed ? COLORS.feltLine : COLORS.ivory,
        border: selected ? `3px solid ${COLORS.brass}` : `2px solid ${COLORS.ink}22`,
        boxShadow: selected ? `0 0 0 3px ${COLORS.brass}33, 0 4px 10px rgba(0,0,0,0.35)` : "0 4px 10px rgba(0,0,0,0.35)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        padding: s * 0.14,
        gap: 2,
        cursor: clickable ? "pointer" : "default",
        transform: selected ? "translateY(-4px)" : "none",
        opacity: dimmed ? 0.55 : 1,
      }}
      aria-label={"die showing " + value}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          style={{
            borderRadius: "50%",
            width: "100%",
            height: "100%",
            background: pipSet.has(i) ? (dimmed ? COLORS.ivoryDim : COLORS.ink) : "transparent",
            justifySelf: "center",
            alignSelf: "center",
            aspectRatio: "1 / 1",
          }}
        />
      ))}
    </button>
  );
}

function ScorePad({ players, currentIndex, myId, phase, winnerId }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: COLORS.ivory, border: `1px solid ${COLORS.brassDim}55` }}
    >
      <div
        className="flex items-center gap-2 mb-2 pb-2"
        style={{ borderBottom: `1px solid ${COLORS.brassDim}55`, color: COLORS.inkSoft, fontFamily: FONT_MONO }}
      >
        <ScrollText size={14} />
        <span className="text-xs tracking-wide uppercase">Scorepad</span>
      </div>
      <div className="flex flex-col gap-1">
        {players.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded px-2 py-1.5"
            style={{
              background: i === currentIndex && phase === "playing" ? COLORS.brass + "22" : "transparent",
              fontFamily: FONT_BODY,
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {phase === "finished" && p.id === winnerId && <Crown size={14} color={COLORS.brassDim} />}
              {p.isComputer && <Bot size={13} color={COLORS.inkSoft} />}
              <span
                className="truncate text-sm"
                style={{ color: COLORS.ink, fontWeight: p.id === myId ? 700 : 500 }}
              >
                {p.name}
                {p.id === myId ? " (you)" : ""}
              </span>
              {!p.onBoard && phase === "playing" && (
                <span style={{ fontSize: 10, color: COLORS.maroon, fontFamily: FONT_MONO }}>needs 500</span>
              )}
            </div>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: COLORS.ink }}>
              {p.score.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogPanel({ log }) {
  return (
    <div
      className="rounded-lg p-3 overflow-y-auto"
      style={{ background: COLORS.feltDark, border: `1px solid ${COLORS.feltLine}`, maxHeight: 140 }}
    >
      <div className="flex flex-col-reverse gap-1">
        {log.slice(0, 8).map((line, i) => (
          <div key={i} style={{ fontFamily: FONT_MONO, fontSize: 12, color: COLORS.ivoryDim, opacity: i === 0 ? 1 : 0.6 }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function BigButton({ children, onClick, disabled, variant, icon }) {
  const bg =
    variant === "primary" ? COLORS.brass : variant === "danger" ? COLORS.maroon : COLORS.feltLight;
  const color = variant === "primary" ? COLORS.ink : COLORS.ivory;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-3 flex items-center justify-center gap-2 transition-opacity"
      style={{
        background: bg,
        color,
        fontFamily: FONT_BODY,
        fontWeight: 700,
        fontSize: 15,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        border: variant === "primary" ? `1px solid ${COLORS.brassBright}` : `1px solid ${COLORS.feltLine}`,
        minHeight: 48,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function FarkleApp() {
  const [screen, setScreen] = useState("home"); // home | lobby | playing | finished
  const [homeView, setHomeView] = useState("menu"); // menu | solo | create | join
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [botCount, setBotCount] = useState(1);
  const [myId] = useState(() => uid());
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [localSelected, setLocalSelected] = useState([]);
  const [rolling, setRolling] = useState(false);
  const [copied, setCopied] = useState(false);

  const botRunning = useRef(false);
  const pollRef = useRef(null);

  // keep local selection in sync with fresh rolls
  useEffect(() => {
    if (game && game.activeDice) {
      setLocalSelected(new Array(game.activeDice.length).fill(false));
    }
  }, [game && game.rollId]);

  const isOnline = game && game.mode === "online";
  const isHost = game && game.hostId === myId;
  const currentPlayer = game && game.players[game.currentPlayerIndex];
  const isMyTurn = game && currentPlayer && currentPlayer.id === myId && !currentPlayer.isComputer;

  // -------------------------------------------------------------------
  // Persistence wrapper: update local state, and if online, push to storage
  // -------------------------------------------------------------------
  const push = useCallback(async (nextGame) => {
    setGame(nextGame);
    if (nextGame.mode === "online") {
      try {
        await saveRoom(nextGame);
      } catch (e) {
        setError("Connection hiccup saving your move — it may not have reached other players.");
      }
    }
  }, []);

  // -------------------------------------------------------------------
  // Polling for online games
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!isOnline || !game || !game.code) return;
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await loadRoom(game.code);
        setGame((prev) => {
          if (!prev) return fresh;
          if (fresh.updatedAt > prev.updatedAt) return fresh;
          return prev;
        });
      } catch (e) {
        // transient — ignore
      }
    }, 1500);
    return () => clearInterval(pollRef.current);
  }, [isOnline, game && game.code]);

  useEffect(() => {
    if (game) {
      if (game.phase === "lobby") setScreen("lobby");
      else if (game.phase === "playing") setScreen("playing");
      else if (game.phase === "finished") setScreen("finished");
    }
  }, [game && game.phase]);

  // -------------------------------------------------------------------
  // Setup flows
  // -------------------------------------------------------------------
  function startSoloGame() {
    const me = { id: myId, name: nameInput.trim() || "You", isComputer: false, score: 0, onBoard: false };
    const bots = Array.from({ length: botCount }, (_, i) => ({
      id: uid(),
      name: "Bot " + (i + 1),
      isComputer: true,
      score: 0,
      onBoard: false,
    }));
    const newGame = {
      mode: "solo",
      code: null,
      hostId: myId,
      targetScore: TARGET_SCORE,
      players: [me, ...bots],
      currentPlayerIndex: 0,
      poolCount: 6,
      activeDice: [],
      turnState: "awaiting_roll",
      turnScore: 0,
      rollId: 0,
      log: ["Game started. " + me.name + " rolls first."],
      finalRoundActive: false,
      finalRoundRemaining: 0,
      winnerId: null,
      phase: "playing",
      updatedAt: Date.now(),
    };
    setGame(newGame);
    setScreen("playing");
  }

  async function createRoom() {
    setBusy(true);
    setError("");
    const name = nameInput.trim() || "Host";
    const code = genRoomCode();
    const me = { id: myId, name, isComputer: false, score: 0, onBoard: false };
    const newGame = {
      mode: "online",
      code,
      hostId: myId,
      targetScore: TARGET_SCORE,
      players: [me],
      currentPlayerIndex: 0,
      poolCount: 6,
      activeDice: [],
      turnState: "awaiting_roll",
      turnScore: 0,
      rollId: 0,
      log: [name + " created the room."],
      finalRoundActive: false,
      finalRoundRemaining: 0,
      winnerId: null,
      phase: "lobby",
      updatedAt: Date.now(),
    };
    try {
      await push(newGame);
      setScreen("lobby");
    } catch (e) {
      setError("Couldn't create the room. Try again.");
    }
    setBusy(false);
  }

  async function joinRoom() {
    setBusy(true);
    setError("");
    const code = codeInput.trim().toUpperCase();
    const name = nameInput.trim() || "Player";
    try {
      const room = await loadRoom(code);
      if (room.phase !== "lobby") {
        setError("That game has already started.");
        setBusy(false);
        return;
      }
      if (room.players.some((p) => p.id === myId)) {
        setGame(room);
        setScreen("lobby");
        setBusy(false);
        return;
      }
      const me = { id: myId, name, isComputer: false, score: 0, onBoard: false };
      const updated = { ...room, players: [...room.players, me], updatedAt: Date.now() };
      await push(updated);
      setScreen("lobby");
    } catch (e) {
      setError("No room found with that code.");
    }
    setBusy(false);
  }

  function addBotToLobby() {
    if (!game) return;
    const n = game.players.filter((p) => p.isComputer).length + 1;
    const bot = { id: uid(), name: "Bot " + n, isComputer: true, score: 0, onBoard: false };
    push({ ...game, players: [...game.players, bot], updatedAt: Date.now() });
  }

  function startOnlineGame() {
    if (!game || game.players.length < 2) return;
    push({
      ...game,
      phase: "playing",
      log: ["Game started. " + game.players[0].name + " rolls first.", ...game.log],
      updatedAt: Date.now(),
    });
  }

  function leaveToHome() {
    clearInterval(pollRef.current);
    setGame(null);
    setScreen("home");
    setHomeView("menu");
    setNameInput("");
    setCodeInput("");
    setError("");
  }

  // -------------------------------------------------------------------
  // Turn logic (shared by human clicks and bot automation)
  // -------------------------------------------------------------------
  function withLog(g, line) {
    return { ...g, log: [line, ...g.log].slice(0, 20) };
  }

  // decrementFinalRound should be true only when the round that's ending was
  // itself already part of the final round (not the turn that just triggered it).
  function advanceTurn(g, decrementFinalRound) {
    let next = { ...g, poolCount: 6, activeDice: [], turnState: "awaiting_roll", turnScore: 0 };
    if (next.finalRoundActive && decrementFinalRound) {
      next.finalRoundRemaining -= 1;
      if (next.finalRoundRemaining <= 0) {
        const winner = next.players.reduce((a, b) => (b.score > a.score ? b : a));
        next.phase = "finished";
        next.winnerId = winner.id;
        next = withLog(next, winner.name + " wins with " + winner.score.toLocaleString() + " points!");
        return next;
      }
    }
    next.currentPlayerIndex = (next.currentPlayerIndex + 1) % next.players.length;
    next.rollId = (next.rollId || 0) + 1;
    return next;
  }

  function doRoll(g) {
    const dice = rollDice(g.poolCount);
    setRolling(true);
    setTimeout(() => setRolling(false), 420);
    if (isFarkleRoll(dice)) {
      let next = withLog(g, currentPlayerNameOf(g) + " rolled " + dice.join(", ") + " — Farkle! Lost " + g.turnScore + " pts.");
      next = advanceTurn(next, g.finalRoundActive);
      return next;
    }
    let next = { ...g, activeDice: dice, turnState: "awaiting_selection", rollId: (g.rollId || 0) + 1 };
    next = withLog(next, currentPlayerNameOf(g) + " rolled " + dice.join(", ") + ".");
    return next;
  }

  function currentPlayerNameOf(g) {
    return g.players[g.currentPlayerIndex].name;
  }

  function doBank(g, selectedIdx) {
    const values = selectedIdx.map((i) => g.activeDice[i]);
    const { valid, score } = computeScore(values);
    if (!valid || score <= 0) return g;
    const remaining = g.activeDice.filter((_, i) => !selectedIdx.includes(i));
    let poolCount = remaining.length;
    let next = { ...g, turnScore: g.turnScore + score, activeDice: [], turnState: "awaiting_roll" };
    if (poolCount === 0) {
      poolCount = 6;
      next = withLog(next, "Hot dice! All six back in play.");
    }
    next.poolCount = poolCount;
    next = withLog(next, currentPlayerNameOf(g) + " banks " + score + " pts (turn total " + (g.turnScore + score) + ").");
    return next;
  }

  function doEndTurn(g) {
    const player = g.players[g.currentPlayerIndex];
    if (g.turnScore <= 0) return g;
    if (!player.onBoard && g.turnScore < BOARD_MINIMUM) return g;
    const newScore = player.score + g.turnScore;
    const players = g.players.map((p, i) =>
      i === g.currentPlayerIndex ? { ...p, score: newScore, onBoard: true } : p
    );
    let next = { ...g, players };
    next = withLog(next, player.name + " ends turn with " + newScore.toLocaleString() + " total.");
    const wasFinalRoundActive = g.finalRoundActive;
    if (newScore >= g.targetScore && !wasFinalRoundActive) {
      next.finalRoundActive = true;
      next.finalRoundRemaining = players.length - 1;
      next = withLog(next, player.name + " passed " + g.targetScore.toLocaleString() + " — final round for everyone else!");
    }
    next = advanceTurn(next, wasFinalRoundActive);
    return next;
  }

  // -------------------------------------------------------------------
  // Human interaction handlers
  // -------------------------------------------------------------------
  function handleRollClick() {
    if (!game || busy) return;
    if (!isMyTurn) return;
    if (game.turnState !== "awaiting_roll") return;
    push(doRoll(game));
  }

  function handleToggleDie(i) {
    if (!game || game.turnState !== "awaiting_selection") return;
    if (!isMyTurn) return;
    setLocalSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function handleBankSelected() {
    if (!game) return;
    const idx = localSelected.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) return;
    push(doBank(game, idx));
  }

  function handleEndTurn() {
    if (!game) return;
    push(doEndTurn(game));
  }

  const selectedValues = game && game.activeDice ? localSelected.map((v, i) => (v ? game.activeDice[i] : null)).filter((v) => v !== null) : [];
  const selectionResult = computeScore(selectedValues);

  // -------------------------------------------------------------------
  // Bot automation
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!game || game.phase !== "playing") return;
    const cp = game.players[game.currentPlayerIndex];
    if (!cp || !cp.isComputer) return;
    const iRunBots = game.mode === "solo" || isHost;
    if (!iRunBots) return;
    if (botRunning.current) return;
    botRunning.current = true;
    runBotTurn(game).finally(() => {
      botRunning.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game && game.currentPlayerIndex, game && game.phase, game && game.turnState]);

  async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runBotTurn(startGame) {
    let g = startGame;
    await wait(700);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await wait(500);
      g = doRoll(g);
      await push(g);
      if (g.turnState === "awaiting_roll") {
        // farkled — turn already advanced
        return;
      }
      await wait(700);
      const idx = autoSelectIndices(g.activeDice);
      g = doBank(g, idx);
      await push(g);

      const player = g.players[g.currentPlayerIndex];
      const wouldWin = player.score + g.turnScore >= g.targetScore;
      const canBank = player.onBoard || g.turnScore >= BOARD_MINIMUM;
      let shouldContinue;
      if (wouldWin && canBank) {
        shouldContinue = false;
      } else if (g.poolCount >= 4) {
        shouldContinue = true;
      } else if (g.poolCount === 3) {
        shouldContinue = g.turnScore < 500 || !canBank;
      } else if (g.poolCount === 2) {
        shouldContinue = g.turnScore < 300 || !canBank;
      } else {
        shouldContinue = !canBank;
      }
      if (!canBank) shouldContinue = true;

      if (!shouldContinue) {
        await wait(600);
        g = doEndTurn(g);
        await push(g);
        return;
      }
    }
  }

  // -------------------------------------------------------------------
  // Render: HOME
  // -------------------------------------------------------------------
  function renderHome() {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center py-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Dices size={28} color={COLORS.brass} />
            <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 34, color: COLORS.ivory }}>Farkle</h1>
          </div>
          <p style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 13 }}>
            Six dice, a scorepad, and nerve. First to 10,000 wins.
          </p>
        </div>

        {homeView === "menu" && (
          <div className="flex flex-col gap-3">
            <BigButton variant="primary" icon={<Bot size={18} />} onClick={() => setHomeView("solo")}>
              Play vs Computer
            </BigButton>
            <BigButton icon={<Plus size={18} />} onClick={() => setHomeView("create")}>
              Create Online Room
            </BigButton>
            <BigButton icon={<Users size={18} />} onClick={() => setHomeView("join")}>
              Join Online Room
            </BigButton>
          </div>
        )}

        {homeView === "solo" && (
          <div className="flex flex-col gap-3">
            <label style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 13 }}>Your name</label>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="You"
              maxLength={16}
              className="rounded-lg px-3 py-2"
              style={{ background: COLORS.ivory, color: COLORS.ink, fontFamily: FONT_BODY, border: "none" }}
            />
            <label style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 13 }}>Number of computer opponents</label>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setBotCount(n)}
                  className="flex-1 rounded-lg py-2"
                  style={{
                    background: botCount === n ? COLORS.brass : COLORS.feltLight,
                    color: botCount === n ? COLORS.ink : COLORS.ivory,
                    fontFamily: FONT_BODY,
                    fontWeight: 700,
                    border: `1px solid ${COLORS.feltLine}`,
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <BigButton variant="primary" onClick={startSoloGame}>
              Start Game
            </BigButton>
            <button onClick={() => setHomeView("menu")} style={{ color: COLORS.ivoryDim, fontFamily: FONT_BODY, fontSize: 13 }}>
              Back
            </button>
          </div>
        )}

        {homeView === "create" && (
          <div className="flex flex-col gap-3">
            <label style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 13 }}>Your name</label>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Host"
              maxLength={16}
              className="rounded-lg px-3 py-2"
              style={{ background: COLORS.ivory, color: COLORS.ink, fontFamily: FONT_BODY, border: "none" }}
            />
            {error && <div style={{ color: COLORS.maroonBright, fontFamily: FONT_BODY, fontSize: 13 }}>{error}</div>}
            <BigButton variant="primary" disabled={busy} onClick={createRoom}>
              {busy ? "Creating…" : "Create Room"}
            </BigButton>
            <button onClick={() => setHomeView("menu")} style={{ color: COLORS.ivoryDim, fontFamily: FONT_BODY, fontSize: 13 }}>
              Back
            </button>
          </div>
        )}

        {homeView === "join" && (
          <div className="flex flex-col gap-3">
            <label style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 13 }}>Your name</label>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Player"
              maxLength={16}
              className="rounded-lg px-3 py-2"
              style={{ background: COLORS.ivory, color: COLORS.ink, fontFamily: FONT_BODY, border: "none" }}
            />
            <label style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 13 }}>Room code</label>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={4}
              className="rounded-lg px-3 py-2 tracking-widest uppercase"
              style={{ background: COLORS.ivory, color: COLORS.ink, fontFamily: FONT_MONO, border: "none", letterSpacing: 4 }}
            />
            {error && <div style={{ color: COLORS.maroonBright, fontFamily: FONT_BODY, fontSize: 13 }}>{error}</div>}
            <BigButton variant="primary" disabled={busy || codeInput.length < 4} onClick={joinRoom}>
              {busy ? "Joining…" : "Join Room"}
            </BigButton>
            <button onClick={() => setHomeView("menu")} style={{ color: COLORS.ivoryDim, fontFamily: FONT_BODY, fontSize: 13 }}>
              Back
            </button>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render: LOBBY
  // -------------------------------------------------------------------
  function renderLobby() {
    if (!game) return null;
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <div style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 13 }}>Room code</div>
          <div className="flex items-center justify-center gap-2">
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 40, letterSpacing: 6, color: COLORS.brass, fontWeight: 700 }}>
              {game.code}
            </span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(game.code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch (e) {}
              }}
              style={{ color: COLORS.ivoryDim }}
              aria-label="copy room code"
            >
              <Copy size={18} />
            </button>
          </div>
          {copied && <div style={{ color: COLORS.brassBright, fontFamily: FONT_BODY, fontSize: 12 }}>Copied!</div>}
          <div style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 12, marginTop: 4 }}>
            Share this code with friends so they can join.
          </div>
        </div>

        <ScorePad players={game.players} currentIndex={-1} myId={myId} phase="lobby" winnerId={null} />

        {isHost ? (
          <div className="flex flex-col gap-2">
            <BigButton icon={<Bot size={16} />} onClick={addBotToLobby}>
              Add Computer Player
            </BigButton>
            <BigButton variant="primary" disabled={game.players.length < 2} onClick={startOnlineGame}>
              Start Game
            </BigButton>
            {game.players.length < 2 && (
              <div style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 12, textAlign: "center" }}>
                Waiting for at least one more player (or add a computer).
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontFamily: FONT_BODY, color: COLORS.ivoryDim, fontSize: 14, textAlign: "center" }}>
            Waiting for the host to start the game…
          </div>
        )}

        <button onClick={leaveToHome} className="flex items-center justify-center gap-1" style={{ color: COLORS.ivoryDim, fontFamily: FONT_BODY, fontSize: 13 }}>
          <LogOut size={14} /> Leave room
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render: PLAYING
  // -------------------------------------------------------------------
  function renderPlaying() {
    if (!game) return null;
    const cp = game.players[game.currentPlayerIndex];
    const myTurnActive = isMyTurn;
    const showDiceAsRolled = game.turnState === "awaiting_selection";
    const diceToShow = showDiceAsRolled ? game.activeDice : Array.from({ length: game.poolCount });

    const canEndTurn =
      game.turnState === "awaiting_roll" &&
      game.turnScore > 0 &&
      (cp.onBoard || game.turnScore >= BOARD_MINIMUM) &&
      myTurnActive;

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: COLORS.ivoryDim }}>
            {game.code ? "Room " + game.code : "Solo game"} · Target {game.targetScore.toLocaleString()}
            {game.finalRoundActive && (
              <span style={{ color: COLORS.maroonBright, fontWeight: 700 }}> · Final round!</span>
            )}
          </div>
          <button onClick={leaveToHome} style={{ color: COLORS.ivoryDim }} aria-label="quit game">
            <LogOut size={16} />
          </button>
        </div>

        <div
          className="text-center py-1.5 rounded-lg"
          style={{
            background: myTurnActive ? COLORS.brass + "22" : "transparent",
            fontFamily: FONT_BODY,
            fontWeight: 700,
            color: myTurnActive ? COLORS.brassBright : COLORS.ivoryDim,
            fontSize: 14,
          }}
        >
          {cp.isComputer
            ? cp.name + " is thinking…"
            : myTurnActive
            ? "Your turn"
            : "Waiting for " + cp.name + "…"}
        </div>

        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: COLORS.felt, border: `1px solid ${COLORS.feltLine}` }}
        >
          <div className={"flex flex-wrap gap-2 justify-center " + (rolling ? "dice-clatter" : "")}>
            {diceToShow.map((v, i) =>
              showDiceAsRolled ? (
                <Die key={i} value={v} selected={!!localSelected[i]} clickable={myTurnActive} onClick={() => handleToggleDie(i)} />
              ) : (
                <Die key={i} value={1} dimmed clickable={false} />
              )
            )}
          </div>

          {showDiceAsRolled && (
            <div className="text-center" style={{ fontFamily: FONT_MONO, fontSize: 13, color: COLORS.ivoryDim }}>
              {selectionResult.valid && selectionResult.score > 0
                ? "Selected: " + selectionResult.score + " pts"
                : selectedValues.length > 0
                ? "Not a valid scoring combination"
                : "Tap the dice you want to bank"}
            </div>
          )}

          <div className="flex items-center justify-center gap-3" style={{ fontFamily: FONT_MONO, color: COLORS.brassBright }}>
            <span style={{ fontSize: 13, color: COLORS.ivoryDim }}>Turn score</span>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{game.turnScore}</span>
          </div>

          <div className="flex flex-col gap-2">
            {game.turnState === "awaiting_roll" && (
              <BigButton
                variant="primary"
                icon={<RotateCw size={18} />}
                disabled={!myTurnActive}
                onClick={handleRollClick}
              >
                Roll {game.poolCount} {game.poolCount === 1 ? "die" : "dice"}
              </BigButton>
            )}
            {game.turnState === "awaiting_selection" && (
              <BigButton
                variant="primary"
                icon={<Check size={18} />}
                disabled={!myTurnActive || !(selectionResult.valid && selectionResult.score > 0)}
                onClick={handleBankSelected}
              >
                Bank Selected
              </BigButton>
            )}
            {game.turnState === "awaiting_roll" && (
              <BigButton disabled={!canEndTurn} onClick={handleEndTurn}>
                Bank {game.turnScore} &amp; End Turn
              </BigButton>
            )}
            {!cp.onBoard && game.turnState === "awaiting_roll" && myTurnActive && (
              <div className="text-center" style={{ fontFamily: FONT_BODY, fontSize: 11, color: COLORS.ivoryDim }}>
                You need 500+ in a single turn to get on the board.
              </div>
            )}
          </div>
        </div>

        <ScorePad players={game.players} currentIndex={game.currentPlayerIndex} myId={myId} phase="playing" winnerId={null} />
        <LogPanel log={game.log} />
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render: FINISHED
  // -------------------------------------------------------------------
  function renderFinished() {
    if (!game) return null;
    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center py-3">
          <Trophy size={40} color={COLORS.brass} className="mx-auto mb-2" />
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: COLORS.ivory }}>
            {game.players.find((p) => p.id === game.winnerId)?.name} wins!
          </div>
        </div>
        <ScorePad players={sorted} currentIndex={-1} myId={myId} phase="finished" winnerId={game.winnerId} />
        <LogPanel log={game.log} />
        <BigButton variant="primary" onClick={leaveToHome}>
          Play Again
        </BigButton>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.feltDark }}>
      <style>{`
        ${FONT_IMPORT}
        @keyframes clatter {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(-6deg) translateY(-2px); }
          50% { transform: rotate(5deg) translateY(1px); }
          75% { transform: rotate(-3deg); }
          100% { transform: rotate(0deg); }
        }
        .dice-clatter button { animation: clatter 0.42s ease; }
        input:focus { outline: 2px solid ${COLORS.brass}; }
        button:focus-visible { outline: 2px solid ${COLORS.brass}; outline-offset: 2px; }
      `}</style>
      <div className="max-w-md mx-auto px-4 py-6">
        {error && screen !== "home" && (
          <div
            className="rounded-lg px-3 py-2 mb-3 text-center"
            style={{ background: COLORS.maroon + "33", color: COLORS.maroonBright, fontFamily: FONT_BODY, fontSize: 12 }}
          >
            {error}
          </div>
        )}
        {screen === "home" && renderHome()}
        {screen === "lobby" && renderLobby()}
        {screen === "playing" && renderPlaying()}
        {screen === "finished" && renderFinished()}
      </div>
    </div>
  );
}
