const Room = require("../models/Room");

class GameManager {
  constructor() {
    this.rooms = {};
  }

  createRoom(roomId) {
    const room = new Room(roomId);
    this.rooms[roomId] = room;
    return room;
  }

  getRoom(roomId) {
    return this.rooms[roomId];
  }

  nextTurn(room) {
    room.currentDrawerIndex =
      (room.currentDrawerIndex + 1) % room.players.length;

    return room.players[room.currentDrawerIndex];
  }
}

module.exports = new GameManager();