const words = require("../utils/words");

const rooms = {};

function createRoom(roomId, hostId, hostName) {
  rooms[roomId] = {
    id: roomId,
    hostId,
    players: [{ id: hostId, name: hostName, score: 0 }],
    gameStarted: false,

    // room settings
    maxPlayers: 5,
    maxRounds: 3,
    drawTime: 30,
    wordCount: 3,
    hintsEnabled: true,

    // game state
    currentDrawerIndex: 0,
    currentRound: 1,
    currentWord: "",
    wordOptions: [],
    strokes: [],
    hintInterval: null,
    roundTimeout: null,
  };
}

function getPublicRoomData(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    players: room.players,
    gameStarted: room.gameStarted,
    currentDrawerIndex: room.currentDrawerIndex,
    currentRound: room.currentRound,
    maxRounds: room.maxRounds,
    maxPlayers: room.maxPlayers,
    drawTime: room.drawTime,
    wordCount: room.wordCount,
    hintsEnabled: room.hintsEnabled,
  };
}

function getUniqueWords(count) {
  const options = [];
  const safeCount = Math.max(1, Math.min(count, words.length));

  while (options.length < safeCount) {
    const w = words[Math.floor(Math.random() * words.length)];
    if (!options.includes(w)) {
      options.push(w);
    }
  }

  return options;
}

function clearRoomTimers(room) {
  if (room.hintInterval) {
    clearInterval(room.hintInterval);
    room.hintInterval = null;
  }

  if (room.roundTimeout) {
    clearTimeout(room.roundTimeout);
    room.roundTimeout = null;
  }
}

function emitHint(io, roomId, room, revealCount) {
  const word = room.currentWord;
  if (!word) return;

  const hidden = word
    .split("")
    .map((char, index) => {
      if (char === " ") return " ";
      return index < revealCount ? char : "_";
    })
    .join(" ");

  io.to(roomId).emit("word_selected", hidden);
}

function startHintSystem(io, roomId, room) {
  clearRoomTimers(room);

  const word = room.currentWord;
  if (!word) return;

  if (!room.hintsEnabled) {
    const fullyHidden = word
      .split("")
      .map((char) => (char === " " ? " " : "_"))
      .join(" ");
    io.to(roomId).emit("word_selected", fullyHidden);
  } else {
    let revealCount = 0;

    const fullyHidden = word
      .split("")
      .map((char) => (char === " " ? " " : "_"))
      .join(" ");
    io.to(roomId).emit("word_selected", fullyHidden);

    const maxReveals = Math.max(1, Math.floor(word.replaceAll(" ", "").length / 2));
    const intervalMs = Math.max(4000, Math.floor((room.drawTime * 1000) / (maxReveals + 1)));

    room.hintInterval = setInterval(() => {
      revealCount++;

      if (revealCount > maxReveals) {
        clearInterval(room.hintInterval);
        room.hintInterval = null;
        return;
      }

      emitHint(io, roomId, room, revealCount);
    }, intervalMs);
  }

  room.roundTimeout = setTimeout(() => {
    const currentRoom = rooms[roomId];
    if (!currentRoom || !currentRoom.gameStarted) return;

    io.to(currentRoom.hostId).emit("force_next_turn");
  }, room.drawTime * 1000);
}

function startRound(io, roomId, room) {
  room.currentWord = "";
  room.wordOptions = getUniqueWords(room.wordCount);
  room.strokes = [];
  clearRoomTimers(room);

  const drawer = room.players[room.currentDrawerIndex];
  if (!drawer) return;

  io.to(roomId).emit("round_changed", {
    drawerId: drawer.id,
    round: room.currentRound,
    maxRounds: room.maxRounds,
    players: room.players,
    drawTime: room.drawTime,
  });

  io.to(drawer.id).emit("word_options", room.wordOptions);
}

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_room", ({ roomId, name }) => {
      if (!roomId || !name) return;

      let room = rooms[roomId];

      if (!room) {
        createRoom(roomId, socket.id, name);
        room = rooms[roomId];
      } else {
        if (room.players.length >= room.maxPlayers) {
          socket.emit("room_full");
          return;
        }

        const alreadyExists = room.players.find((p) => p.id === socket.id);
        if (!alreadyExists) {
          room.players.push({
            id: socket.id,
            name,
            score: 0,
          });
        }
      }

      socket.join(roomId);
      io.to(roomId).emit("room_data", getPublicRoomData(room));
    });

    socket.on("update_settings", ({ roomId, settings }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (socket.id !== room.hostId) return;
      if (room.gameStarted) return;

      room.maxPlayers = Math.max(2, Math.min(20, Number(settings.maxPlayers) || 5));
      room.maxRounds = Math.max(2, Math.min(10, Number(settings.maxRounds) || 3));
      room.drawTime = Math.max(15, Math.min(240, Number(settings.drawTime) || 30));
      room.wordCount = Math.max(1, Math.min(5, Number(settings.wordCount) || 3));
      room.hintsEnabled = Boolean(settings.hintsEnabled);

      io.to(roomId).emit("room_data", getPublicRoomData(room));
    });

    socket.on("start_game", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (socket.id !== room.hostId) return;
      if (room.players.length < 2) return;

      room.gameStarted = true;
      room.currentRound = 1;
      room.currentDrawerIndex = 0;
      room.currentWord = "";
      room.strokes = [];

      const drawer = room.players[room.currentDrawerIndex];

      io.to(roomId).emit("game_started", {
        room: getPublicRoomData(room),
        drawerId: drawer.id,
        round: room.currentRound,
        maxRounds: room.maxRounds,
        drawTime: room.drawTime,
      });

      io.to(drawer.id).emit("word_options", getUniqueWords(room.wordCount));
      room.wordOptions = getUniqueWords(room.wordCount);
      io.to(drawer.id).emit("word_options", room.wordOptions);
    });

    socket.on("select_word", ({ roomId, word }) => {
      const room = rooms[roomId];
      if (!room) return;

      const drawer = room.players[room.currentDrawerIndex];
      if (!drawer) return;
      if (socket.id !== drawer.id) return;

      room.currentWord = word;
      room.wordOptions = [];

      io.to(drawer.id).emit("your_word", word);

      startHintSystem(io, roomId, room);
    });

    socket.on("next_turn", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (socket.id !== room.hostId) return;

      clearRoomTimers(room);

      room.currentDrawerIndex++;

      if (room.currentDrawerIndex >= room.players.length) {
        room.currentDrawerIndex = 0;
        room.currentRound++;
      }

      if (room.currentRound > room.maxRounds) {
        io.to(roomId).emit("game_over", {
          players: room.players,
        });

        room.gameStarted = false;
        room.currentRound = 1;
        room.currentDrawerIndex = 0;
        room.currentWord = "";
        room.wordOptions = [];
        room.strokes = [];
        clearRoomTimers(room);
        return;
      }

      startRound(io, roomId, room);
    });

    socket.on("guess", ({ roomId, text, name }) => {
      const room = rooms[roomId];
      if (!room || !room.gameStarted) return;

      const guessText = text?.trim().toLowerCase();
      const correctWord = room.currentWord?.trim().toLowerCase();

      if (!guessText) return;

      if (!correctWord) {
        io.to(roomId).emit("chat", { name, text });
        return;
      }

      if (guessText === correctWord) {
        const player = room.players.find((p) => p.name === name);
        if (player) player.score += 10;

        clearRoomTimers(room);

        io.to(roomId).emit("correct_guess", {
          name,
          players: room.players,
          word: room.currentWord,
        });

        setTimeout(() => {
          io.to(room.hostId).emit("force_next_turn");
        }, 2000);
      } else {
        io.to(roomId).emit("chat", { name, text });
      }
    });

    socket.on("chat_message", ({ roomId, text, name }) => {
      const room = rooms[roomId];
      if (!room) return;
      io.to(roomId).emit("chat", { name, text });
    });

    socket.on("draw", ({ roomId, data }) => {
      const room = rooms[roomId];
      if (!room) return;

      room.strokes.push(data);
      socket.to(roomId).emit("draw", data);
    });

    socket.on("undo", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;

      const drawer = room.players[room.currentDrawerIndex];
      if (!drawer) return;
      if (socket.id !== drawer.id) return;

      room.strokes.pop();
      io.to(roomId).emit("canvas_state", room.strokes);
    });

    socket.on("clear_canvas", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;

      room.strokes = [];
      io.to(roomId).emit("clear_canvas");
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      for (const roomId in rooms) {
        const room = rooms[roomId];
        const playerIndex = room.players.findIndex((p) => p.id === socket.id);

        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);

          if (room.players.length === 0) {
            clearRoomTimers(room);
            delete rooms[roomId];
            continue;
          }

          if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
          }

          io.to(roomId).emit("room_data", getPublicRoomData(room));
        }
      }
    });
  });
};