class Room {
  constructor(id) {
    this.id = id;
    this.players = [];
    this.currentDrawerIndex = 0;
    this.word = "";
  }
}
module.exports = Room;