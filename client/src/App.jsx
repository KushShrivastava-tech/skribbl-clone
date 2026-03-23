import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("https://your-backend-url.onrender.com");

function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");

  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState("");
  const [isHost, setIsHost] = useState(false);

  const [settings, setSettings] = useState({
    maxPlayers: 5,
    maxRounds: 3,
    drawTime: 30,
    wordCount: 3,
    hintsEnabled: true,
  });

  const [gameStarted, setGameStarted] = useState(false);
  const [drawerId, setDrawerId] = useState("");
  const [isDrawer, setIsDrawer] = useState(false);

  const [word, setWord] = useState("");
  const [hiddenWord, setHiddenWord] = useState("");
  const [wordOptions, setWordOptions] = useState([]);

  const [round, setRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(3);
  const [time, setTime] = useState(30);

  const [guess, setGuess] = useState("");
  const [messages, setMessages] = useState([]);
  const [winnerPlayers, setWinnerPlayers] = useState([]);

  const [drawing, setDrawing] = useState(false);

  const [selectedColor, setSelectedColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const [tool, setTool] = useState("pen");

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const lastPointRef = useRef({ x: 0, y: 0 });

  const colors = [
    "#000000",
    "#ef4444",
    "#22c55e",
    "#3b82f6",
    "#eab308",
    "#a855f7",
    "#f97316",
    "#ffffff",
  ];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromURL = params.get("room");
    if (roomFromURL) setRoomId(roomFromURL);
  }, []);

  const joinRoom = () => {
    if (!name.trim() || !roomId.trim()) return;
    socket.emit("join_room", { roomId, name });
    setJoined(true);
  };

  const updateRoomSettings = (newSettings) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    socket.emit("update_settings", { roomId, settings: merged });
  };

  const copyInviteLink = async () => {
    const link = `${window.location.origin}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
      alert("Room link copied!");
    } catch {
      alert(link);
    }
  };

  useEffect(() => {
    socket.on("room_data", (data) => {
      setPlayers(data.players || []);
      setHostId(data.hostId || "");
      setIsHost(socket.id === data.hostId);
      setRound(data.currentRound || 1);
      setMaxRounds(data.maxRounds || 3);

      setSettings((prev) => ({
        ...prev,
        maxPlayers: data.maxPlayers ?? prev.maxPlayers,
        maxRounds: data.maxRounds ?? prev.maxRounds,
        drawTime: data.drawTime ?? prev.drawTime,
        wordCount: data.wordCount ?? prev.wordCount,
        hintsEnabled: data.hintsEnabled ?? prev.hintsEnabled,
      }));
    });

    socket.on("room_full", () => {
      alert("Room is full");
      setJoined(false);
    });

    socket.on("game_started", ({ drawerId, round, maxRounds, room, drawTime }) => {
      setGameStarted(true);
      setDrawerId(drawerId);
      setIsDrawer(socket.id === drawerId);
      setRound(round);
      setMaxRounds(maxRounds);
      setPlayers(room.players || []);
      setTime(drawTime || room.drawTime || 30);
      setMessages([]);
      setWord("");
      setHiddenWord("");
      setWordOptions([]);
      setWinnerPlayers([]);
      clearCanvasLocal();
    });

    socket.on("word_options", (options) => {
      setWordOptions(options || []);
    });

    socket.on("your_word", (w) => {
      setWord(w);
      setWordOptions([]);
    });

    socket.on("word_selected", (hidden) => {
      setHiddenWord(hidden);
    });

    socket.on("round_changed", ({ drawerId, round, maxRounds, players, drawTime }) => {
      setDrawerId(drawerId);
      setIsDrawer(socket.id === drawerId);
      setRound(round);
      setMaxRounds(maxRounds);
      setPlayers(players || []);
      setTime(drawTime || settings.drawTime);
      setWord("");
      setHiddenWord("");
      setGuess("");
      setWordOptions([]);
      clearCanvasLocal();
    });

    socket.on("chat", ({ name, text }) => {
      setMessages((prev) => [...prev, `${name}: ${text}`]);
    });

    socket.on("correct_guess", ({ name, players, word }) => {
      setPlayers(players || []);
      setMessages((prev) => [...prev, `🏆 ${name} guessed "${word}"`]);
    });

    socket.on("draw", (data) => {
      const ctx = ctxRef.current;
      if (!ctx) return;

      ctx.beginPath();
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.size;
      ctx.lineCap = "round";
      ctx.moveTo(data.x0, data.y0);
      ctx.lineTo(data.x1, data.y1);
      ctx.stroke();
      ctx.closePath();
    });

    socket.on("canvas_state", (strokes) => {
      clearCanvasLocal();
      const ctx = ctxRef.current;
      if (!ctx) return;

      strokes.forEach((data) => {
        ctx.beginPath();
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.size;
        ctx.lineCap = "round";
        ctx.moveTo(data.x0, data.y0);
        ctx.lineTo(data.x1, data.y1);
        ctx.stroke();
        ctx.closePath();
      });
    });

    socket.on("clear_canvas", () => {
      clearCanvasLocal();
    });

    socket.on("game_over", ({ players }) => {
      setWinnerPlayers(players || []);
      setGameStarted(false);
      setIsDrawer(false);
      setDrawerId("");
      setWord("");
      setHiddenWord("");
      setWordOptions([]);
      setTime(0);
      clearCanvasLocal();
    });

    socket.on("force_next_turn", () => {
      if (isHost) {
        socket.emit("next_turn", { roomId });
      }
    });

    return () => {
      socket.off("room_data");
      socket.off("room_full");
      socket.off("game_started");
      socket.off("word_options");
      socket.off("your_word");
      socket.off("word_selected");
      socket.off("round_changed");
      socket.off("chat");
      socket.off("correct_guess");
      socket.off("draw");
      socket.off("canvas_state");
      socket.off("clear_canvas");
      socket.off("game_over");
      socket.off("force_next_turn");
    };
  }, [isHost, roomId, settings.drawTime]);

  useEffect(() => {
    if (!gameStarted || time === 0) return;

    const timer = setInterval(() => {
      setTime((t) => t - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [time, gameStarted]);

  useEffect(() => {
    if (time === 0 && isHost && gameStarted) {
      socket.emit("next_turn", { roomId });
    }
  }, [time, isHost, gameStarted, roomId]);

  useEffect(() => {
    if (!joined) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 700;
    canvas.height = 400;

    const ctx = canvas.getContext("2d");
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.strokeStyle = selectedColor;
    ctxRef.current = ctx;
  }, [joined]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    ctx.lineWidth = brushSize;
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : selectedColor;
  }, [brushSize, selectedColor, tool]);

  const startDrawing = (e) => {
    if (!isDrawer || !gameStarted || wordOptions.length > 0 || !word) return;

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    lastPointRef.current = { x, y };
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };

  const draw = (e) => {
    if (!drawing || !isDrawer || !gameStarted || wordOptions.length > 0 || !word) return;

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const prevX = lastPointRef.current.x;
    const prevY = lastPointRef.current.y;
    const drawColor = tool === "eraser" ? "#ffffff" : selectedColor;

    ctx.beginPath();
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.closePath();

    socket.emit("draw", {
      roomId,
      data: {
        x0: prevX,
        y0: prevY,
        x1: x,
        y1: y,
        color: drawColor,
        size: brushSize,
      },
    });

    lastPointRef.current = { x, y };
  };

  const stopDrawing = () => {
    setDrawing(false);
    const ctx = ctxRef.current;
    if (ctx) ctx.beginPath();
  };

  const clearCanvasLocal = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const clearCanvasForAll = () => {
    clearCanvasLocal();
    socket.emit("clear_canvas", { roomId });
  };

  const undoLastStroke = () => {
    socket.emit("undo", { roomId });
  };

  const startGame = () => {
    socket.emit("start_game", { roomId });
  };

  const selectWord = (w) => {
    socket.emit("select_word", { roomId, word: w });
    setWordOptions([]);
  };

  const sendGuess = () => {
    if (!guess.trim()) return;

    if (guess.startsWith("/")) {
      socket.emit("chat_message", {
        roomId,
        text: guess.slice(1),
        name,
      });
    } else {
      socket.emit("guess", { roomId, text: guess, name });
    }

    setGuess("");
  };

  const sortedWinners = [...winnerPlayers].sort((a, b) => b.score - a.score);
  const topWinner = sortedWinners.length > 0 ? sortedWinners[0] : null;

  return !joined ? (
    <div className="join">
      <div className="join-box">
        <h1>🎮 Skribbl Clone</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter Name"
        />
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Enter Room ID"
        />
        <button onClick={joinRoom}>Join Game</button>
      </div>
    </div>
  ) : (
    <div className="app">
      <div className="canvas-section">
        <h2>
          {gameStarted ? (isDrawer ? "🎨 You are drawing" : "🤔 Guess the word") : "Lobby"}
        </h2>

        <h3>Room: {roomId}</h3>
        <h3>Round: {round} / {maxRounds}</h3>
        <h3 style={{ color: time <= 10 ? "red" : "black" }}>
          ⏱️ {gameStarted ? `${time}s` : "--"}
        </h3>

        {!gameStarted && (
          <button onClick={copyInviteLink} className="start-btn" style={{ marginBottom: "10px" }}>
            Copy Invite Link 🔗
          </button>
        )}

        {isHost && !gameStarted && (
          <div className="settings-box">
            <h3>Room Settings</h3>

            <label>
              Max Players
              <input
                type="number"
                min="2"
                max="20"
                value={settings.maxPlayers}
                onChange={(e) => updateRoomSettings({ maxPlayers: Number(e.target.value) })}
              />
            </label>

            <label>
              Rounds
              <input
                type="number"
                min="2"
                max="10"
                value={settings.maxRounds}
                onChange={(e) => updateRoomSettings({ maxRounds: Number(e.target.value) })}
              />
            </label>

            <label>
              Draw Time
              <input
                type="number"
                min="15"
                max="240"
                value={settings.drawTime}
                onChange={(e) => updateRoomSettings({ drawTime: Number(e.target.value) })}
              />
            </label>

            <label>
              Word Count
              <input
                type="number"
                min="1"
                max="5"
                value={settings.wordCount}
                onChange={(e) => updateRoomSettings({ wordCount: Number(e.target.value) })}
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.hintsEnabled}
                onChange={(e) => updateRoomSettings({ hintsEnabled: e.target.checked })}
              />
              Hints Enabled
            </label>
          </div>
        )}

        {gameStarted && isDrawer && wordOptions.length > 0 && (
          <div className="word-options">
            <h3>Select a word:</h3>
            <div className="word-options-buttons">
              {wordOptions.map((w, i) => (
                <button key={i} onClick={() => selectWord(w)}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameStarted && isDrawer && word && (
          <p><strong>Your word:</strong> {word}</p>
        )}

        {gameStarted && !isDrawer && (
          <p>
            <strong>Word:</strong>{" "}
            {hiddenWord || "Waiting for drawer to select a word..."}
          </p>
        )}

        {gameStarted && !isDrawer && (
          <p>
            <strong>Drawer:</strong>{" "}
            {players.find((p) => p.id === drawerId)?.name || "Unknown"}
          </p>
        )}

        {!gameStarted && winnerPlayers.length === 0 && (
          <p>Waiting for host to start the game</p>
        )}

        {isDrawer && gameStarted && wordOptions.length === 0 && word && (
          <div className="tools-row">
            <div className="colors-row">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setTool("pen");
                    setSelectedColor(c);
                  }}
                  className="color-dot"
                  style={{
                    background: c,
                    border:
                      selectedColor === c && tool === "pen"
                        ? "3px solid #111827"
                        : "1px solid #cbd5e1",
                  }}
                />
              ))}
            </div>

            <label className="brush-label">
              Brush:
              <input
                type="range"
                min="2"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
            </label>

            <button onClick={() => setTool("pen")}>Pen</button>
            <button onClick={() => setTool("eraser")}>Eraser</button>
            <button onClick={undoLastStroke}>Undo</button>
          </div>
        )}

        <div className="canvas-box">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onMouseMove={draw}
          />
        </div>

        {isDrawer && gameStarted && wordOptions.length === 0 && word && (
          <button onClick={clearCanvasForAll} className="clear-btn">
            Clear Canvas
          </button>
        )}

        {winnerPlayers.length > 0 && (
          <div className="winner-box">
            <h2>🏆 Game Over</h2>

            {topWinner && (
              <h3>
                Winner: {topWinner.name} ({topWinner.score} points)
              </h3>
            )}

            <h4>Leaderboard</h4>
            {sortedWinners.map((player, index) => (
              <p key={player.id}>
                {index + 1}. {player.name} - {player.score}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar">
        <h3>👥 Players</h3>
        {players.map((player) => (
          <div className="player" key={player.id}>
            {player.name} - {player.score}
            {player.id === hostId ? " (Host)" : ""}
          </div>
        ))}

        {!gameStarted && (
          <button onClick={copyInviteLink} className="start-btn">
            Copy Invite Link 🔗
          </button>
        )}

        {isHost && !gameStarted && winnerPlayers.length === 0 && (
          <button onClick={startGame} className="start-btn">
            Start Game
          </button>
        )}

        {!isHost && !gameStarted && winnerPlayers.length === 0 && (
          <button className="start-btn" disabled>
            Only host can start
          </button>
        )}

        <div className="chat-box">
          {messages.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>

        {!isDrawer && gameStarted && (
          <div className="chat-input">
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder='Type guess... or "/hello" for chat'
            />
            <button onClick={sendGuess}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;