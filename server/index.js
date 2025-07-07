const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
// Generate a 4-character alphanumeric room ID
function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());

// Game rooms storage
const rooms = new Map();

// Player boards storage (separate from room board)
const playerBoards = new Map(); // roomId -> { playerId -> board }

// Generate a deterministic board based on seed
function generateBoardWithSeed(seed, rows, cols, mines, safeR, safeC) {
  const safeZone = new Set();
  safeZone.add(`${safeR},${safeC}`);
  
  // Add neighbors to safe zone
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = safeR + dr;
      const nc = safeC + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        safeZone.add(`${nr},${nc}`);
      }
    }
  }

  const board = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
    }))
  );

  // Create a deterministic random number generator that doesn't modify external state
  let randomCounter = 0;
  const random = (min, max) => {
    // Use a combination of seed and counter to ensure deterministic but unique values
    const x = Math.sin(seed + randomCounter) * 10000;
    randomCounter++;
    return Math.floor((x - Math.floor(x)) * (max - min + 1)) + min;
  };

  // Place mines
  let minesPlaced = 0;
  while (minesPlaced < mines) {
    const r = random(0, rows - 1);
    const c = random(0, cols - 1);
    if (!board[r][c].isMine && !safeZone.has(`${r},${c}`)) {
      board[r][c].isMine = true;
      minesPlaced++;
    }
  }

  // Calculate adjacent mines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (
            r + dr >= 0 &&
            r + dr < rows &&
            c + dc >= 0 &&
            c + dc < cols &&
            board[r + dr][c + dc].isMine
          ) {
            count++;
          }
        }
      }
      board[r][c].adjacentMines = count;
    }
  }

  return board;
}

// Flood fill reveal function
function floodReveal(board, r, c, rows, cols) {
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  const stack = [[r, c]];
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

  while (stack.length > 0) {
    const [cr, cc] = stack.pop();
    if (
      cr < 0 ||
      cr >= rows ||
      cc < 0 ||
      cc >= cols ||
      visited[cr][cc] ||
      newBoard[cr][cc].isRevealed ||
      newBoard[cr][cc].isFlagged
    ) {
      continue;
    }
    visited[cr][cc] = true;
    newBoard[cr][cc].isRevealed = true;

    if (newBoard[cr][cc].adjacentMines === 0 && !newBoard[cr][cc].isMine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr !== 0 || dc !== 0) {
            stack.push([cr + dr, cc + dc]);
          }
        }
      }
    }
  }

  return newBoard;
}

// Check win condition
function checkWin(board, rows, cols) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r][c].isMine && !board[r][c].isRevealed) {
        return false;
      }
    }
  }
  return true;
}

// Get player progress (percentage of non-mine cells revealed)
function getPlayerProgress(board, rows, cols, mines) {
  const totalCells = rows * cols;
  const nonMineCells = totalCells - mines;
  let revealedCells = 0;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r][c].isMine && board[r][c].isRevealed) {
        revealedCells++;
      }
    }
  }
  
  return Math.round((revealedCells / nonMineCells) * 100);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new room
  socket.on('createRoom', ({ difficulty, playerName }) => {
    const roomId = generateRoomId();
    const room = {
      id: roomId,
      difficulty,
      players: [{ id: socket.id, name: playerName, ready: false, isAdmin: true }],
      gameState: 'waiting',
      seed: Math.floor(Math.random() * 1000000),
      gameStartTime: null,
      winner: null
    };
    
    rooms.set(roomId, room);
    playerBoards.set(roomId, {});
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, room });
    console.log(`Room created: ${roomId} by admin ${socket.id}`);
  });

  // Join an existing room
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    room.players.push({ id: socket.id, name: playerName, ready: false, isAdmin: false });
    socket.join(roomId);
    socket.emit('roomJoined', { room });
    socket.to(roomId).emit('playerJoined', { player: { id: socket.id, name: playerName, ready: false, isAdmin: false } });
    console.log(`Player joined room: ${roomId}`);
  });

  // Player ready
  socket.on('playerReady', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.ready = !player.ready; // Toggle ready status
      socket.to(roomId).emit('playerReady', { playerId: socket.id });
      
      // Check if all players are ready (and there are at least 2 players)
      if (room.players.length >= 2 && room.players.every(p => p.ready)) {
        room.gameState = 'ready';
        io.to(roomId).emit('gameReady');
      } else if (room.gameState === 'ready') {
        // If someone unreadied or there aren't enough players, go back to waiting
        room.gameState = 'waiting';
        io.to(roomId).emit('gameWaiting');
      }
    }
  });

  // Start game
  socket.on('startGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.players.length < 2) return;
    
    // Check if the player is the admin
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isAdmin) {
      socket.emit('error', { message: 'Only the room admin can start the game' });
      return;
    }

    // Pre-generate the board with a random first click position
    const { rows, cols, mines } = getDifficultySettings(room.difficulty);
    
    // Generate a random first click position that will be the same for both players
    let randomCounter = 0;
    const random = (min, max) => {
      const x = Math.sin(room.seed + randomCounter) * 10000;
      randomCounter++;
      return Math.floor((x - Math.floor(x)) * (max - min + 1)) + min;
    };
    
    const firstClickRow = random(0, rows - 1);
    const firstClickCol = random(0, cols - 1);
    
    console.log(`Pre-generating board for room ${roomId}: seed=${room.seed}, firstClick=(${firstClickRow},${firstClickCol})`);
    
    // Generate the board once for the room
    const roomBoard = generateBoardWithSeed(room.seed, rows, cols, mines, firstClickRow, firstClickCol);
    
    // Give each player a copy of the same board
    const playerBoardMap = playerBoards.get(roomId);
    room.players.forEach(player => {
      // Deep copy the board for each player
      const playerBoard = roomBoard.map(row => row.map(cell => ({ ...cell })));
      playerBoardMap[player.id] = playerBoard;
    });
    
    room.gameState = 'playing';
    room.gameStartTime = Date.now();
    
    // Reveal the area around the first click (flood fill)
    const revealedBoard = floodReveal(roomBoard, firstClickRow, firstClickCol, rows, cols);
    
    // Update all player boards with the revealed area
    room.players.forEach(player => {
      const playerBoard = revealedBoard.map(row => row.map(cell => ({ ...cell })));
      playerBoardMap[player.id] = playerBoard;
    });
    
    // Send countdown start to all players
    io.to(roomId).emit('countdownStarted', { 
      countdown: 5,
      firstClick: { row: firstClickRow, col: firstClickCol }
    });
    
    // Start countdown
    let countdown = 5;
    const countdownInterval = setInterval(() => {
      countdown--;
      io.to(roomId).emit('countdownUpdate', { countdown });
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        
        // Send the pre-generated board with revealed area to all players
        io.to(roomId).emit('gameStarted', { 
          startTime: Date.now(),
          board: revealedBoard,
          firstClick: { row: firstClickRow, col: firstClickCol }
        });
        
        // Calculate and send initial progress
        const initialProgress = {};
        room.players.forEach(player => {
          const pb = playerBoardMap[player.id];
          if (pb) {
            initialProgress[player.id] = getPlayerProgress(pb, rows, cols, mines);
          }
        });
        io.to(roomId).emit('progressUpdate', { progress: initialProgress });
        
        console.log(`Game started for room ${roomId} with ${rows}x${cols} board and ${mines} mines`);
        console.log(`Initial progress:`, initialProgress);
      }
    }, 1000);
  });

  // Handle cell click
  socket.on('cellClick', ({ roomId, row, col }) => {
    console.log(`Cell click: room=${roomId}, row=${row}, col=${col}, socket=${socket.id}`);
    const room = rooms.get(roomId);
    if (!room || room.gameState !== 'playing') {
      console.log(`Invalid room or game state: room=${roomId}, gameState=${room?.gameState}`);
      return;
    }

    const playerBoardMap = playerBoards.get(roomId);
    if (!playerBoardMap) {
      console.log(`No player boards found for room: ${roomId}`);
      return;
    }

    let playerBoard = playerBoardMap[socket.id];
    
    // Board should already be pre-generated, but handle edge case
    if (!playerBoard) {
      console.log(`No board found for player ${socket.id}, this shouldn't happen`);
      return;
    }

    const { rows, cols, mines } = getDifficultySettings(room.difficulty);
    const cell = playerBoard[row][col];

    if (cell.isFlagged) {
      console.log(`Cell is flagged, ignoring click`);
      return;
    }

    if (cell.isMine) {
      console.log(`Player hit mine: ${socket.id}`);
      // Game over - reveal all mines for this player
      playerBoard = playerBoard.map(boardRow =>
        boardRow.map(c => c.isMine ? { ...c, isRevealed: true } : c)
      );
      playerBoardMap[socket.id] = playerBoard;
      
      // Other player wins
      const otherPlayer = room.players.find(p => p.id !== socket.id);
      const currentPlayer = room.players.find(p => p.id === socket.id);
      room.gameState = 'finished';
      room.winner = otherPlayer?.name || 'Unknown';
      
      io.to(roomId).emit('gameOver', { 
        winner: room.winner,
        loser: currentPlayer?.name || 'Unknown',
        reason: `${currentPlayer?.name || 'Unknown'} hit a mine!`,
        winnerId: otherPlayer?.id,
        loserId: socket.id
      });
    } else {
      console.log(`Revealing cell: row=${row}, col=${col}`);
      // Reveal cell
      playerBoard = floodReveal(playerBoard, row, col, rows, cols);
      playerBoardMap[socket.id] = playerBoard;
      
      // Check for win
      if (checkWin(playerBoard, rows, cols)) {
        console.log(`Player won: ${socket.id}`);
        const currentPlayer = room.players.find(p => p.id === socket.id);
        room.gameState = 'finished';
        room.winner = currentPlayer?.name || 'Unknown';
        io.to(roomId).emit('gameWon', { 
          winner: room.winner,
          winnerId: socket.id,
          reason: `${currentPlayer?.name || 'Unknown'} completed the board first!`
        });
      } else {
        console.log(`Sending board update to player: ${socket.id}`);
        // Send updated board to the player who made the move
        const progress = getPlayerProgress(playerBoard, rows, cols, mines);
        socket.emit('boardUpdate', { 
          board: playerBoard, 
          lastMove: { row, col, playerId: socket.id },
          progress
        });
        
        // Send progress update to all players
        const allProgress = {};
        room.players.forEach(player => {
          const pb = playerBoardMap[player.id];
          if (pb) {
            allProgress[player.id] = getPlayerProgress(pb, rows, cols, mines);
          }
        });
        
        io.to(roomId).emit('progressUpdate', { progress: allProgress });
        
        // Also send initial progress after game start
        if (Object.keys(allProgress).length > 0) {
          io.to(roomId).emit('progressUpdate', { progress: allProgress });
        }
      }
    }
  });

  // Handle flag placement
  socket.on('cellFlag', ({ roomId, row, col }) => {
    const room = rooms.get(roomId);
    if (!room || room.gameState !== 'playing') return;

    const playerBoardMap = playerBoards.get(roomId);
    if (!playerBoardMap) return;

    let playerBoard = playerBoardMap[socket.id];
    if (!playerBoard) return;

    const cell = playerBoard[row][col];
    if (cell.isRevealed) return;

    cell.isFlagged = !cell.isFlagged;
    playerBoardMap[socket.id] = playerBoard;
    
    const { rows, cols, mines } = getDifficultySettings(room.difficulty);
    const progress = getPlayerProgress(playerBoard, rows, cols, mines);
    
    socket.emit('boardUpdate', { 
      board: playerBoard, 
      lastMove: { row, col, playerId: socket.id, flagged: cell.isFlagged },
      progress
    });
  });

  // Play again - check if both players want to play again
  socket.on('playAgain', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const currentPlayer = room.players.find(p => p.id === socket.id);
    if (!currentPlayer) return;

    // Mark this player as wanting to play again
    currentPlayer.wantsToPlayAgain = true;
    
    // Notify all players about the play again status
    io.to(roomId).emit('playAgainStatus', { 
      playerId: socket.id, 
      wantsToPlayAgain: true,
      allWantToPlayAgain: room.players.every(p => p.wantsToPlayAgain)
    });
    
    // Check if both players want to play again
    const allWantToPlayAgain = room.players.every(p => p.wantsToPlayAgain);
    
    if (allWantToPlayAgain) {
      // Both players want to play again - reset the room
      room.players.forEach(player => {
        player.ready = false;
        player.wantsToPlayAgain = false;
      });

      // Clear player boards
      const playerBoardMap = playerBoards.get(roomId);
      if (playerBoardMap) {
        Object.keys(playerBoardMap).forEach(playerId => {
          delete playerBoardMap[playerId];
        });
      }

      // Reset room state and generate new seed
      room.gameState = 'waiting';
      room.winner = null;
      room.gameStartTime = null;
      room.seed = Math.floor(Math.random() * 1000000); // Generate new seed for next game

      // Notify all players
      io.to(roomId).emit('gameReset', { room });
    }
    // If not both want to play again, just wait - don't create new room yet
  });

  // Handle when a player leaves after game ends (if they don't want to play again)
  socket.on('returnToLobby', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const currentPlayer = room.players.find(p => p.id === socket.id);
    if (!currentPlayer) return;

    // If this player wanted to play again but the other player left, create new room for them
    if (currentPlayer.wantsToPlayAgain && room.gameState === 'post_game') {
      const newRoomId = generateRoomId();
      const newRoom = {
        id: newRoomId,
        difficulty: room.difficulty,
        players: [{ id: socket.id, name: currentPlayer.name, ready: false, isAdmin: true }],
        gameState: 'waiting',
        seed: Math.floor(Math.random() * 1000000),
        gameStartTime: null,
        winner: null
      };
      
      rooms.set(newRoomId, newRoom);
      playerBoards.set(newRoomId, {});
      
      // Move player to new room
      socket.leave(roomId);
      socket.join(newRoomId);
      
      // Remove player from old room
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        socket.to(roomId).emit('playerLeft', { playerId: socket.id });
        
        // Clean up player boards in old room
        const oldPlayerBoardMap = playerBoards.get(roomId);
        if (oldPlayerBoardMap) {
          delete oldPlayerBoardMap[socket.id];
        }
        
        // If old room is empty, delete it
        if (room.players.length === 0) {
          rooms.delete(roomId);
          playerBoards.delete(roomId);
        }
      }
      
      // Send player to new room
      socket.emit('movedToNewRoom', { roomId: newRoomId, room: newRoom });
    } else {
      // Normal leave lobby behavior
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        socket.to(roomId).emit('playerLeft', { playerId: socket.id });
        
        // Clean up player boards
        const playerBoardMap = playerBoards.get(roomId);
        if (playerBoardMap) {
          delete playerBoardMap[socket.id];
        }
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          rooms.delete(roomId);
          playerBoards.delete(roomId);
        }
      }

      // Send player back to lobby
      socket.emit('returnedToLobby');
    }
  });



  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove player from rooms
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        socket.to(roomId).emit('playerLeft', { playerId: socket.id });
        
        // Clean up player boards
        const playerBoardMap = playerBoards.get(roomId);
        if (playerBoardMap) {
          delete playerBoardMap[socket.id];
        }
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          rooms.delete(roomId);
          playerBoards.delete(roomId);
        } else if (room.gameState === 'playing') {
          // End game if someone leaves during play
          room.gameState = 'finished';
          room.winner = room.players[0]?.name || 'Unknown';
          io.to(roomId).emit('gameOver', { 
            winner: room.winner,
            reason: 'Player disconnected'
          });
        } else if (room.gameState === 'post_game') {
          // Check if remaining player wanted to play again
          const remainingPlayer = room.players[0];
          if (remainingPlayer && remainingPlayer.wantsToPlayAgain) {
            // Create new room for the remaining player
            const newRoomId = generateRoomId();
            const newRoom = {
              id: newRoomId,
              difficulty: room.difficulty,
              players: [{ id: remainingPlayer.id, name: remainingPlayer.name, ready: false, isAdmin: true }],
              gameState: 'waiting',
              seed: Math.floor(Math.random() * 1000000),
              gameStartTime: null,
              winner: null
            };
            
            rooms.set(newRoomId, newRoom);
            playerBoards.set(newRoomId, {});
            
            // Move player to new room
            io.sockets.sockets.get(remainingPlayer.id)?.join(newRoomId);
            io.sockets.sockets.get(remainingPlayer.id)?.emit('movedToNewRoom', { roomId: newRoomId, room: newRoom });
          }
        }
        break;
      }
    }
  });
});

function getDifficultySettings(difficulty) {
  const settings = {
    easy: { rows: 8, cols: 8, mines: 10 },
    medium: { rows: 16, cols: 16, mines: 40 },
    hard: { rows: 20, cols: 20, mines: 100 }
  };
  return settings[difficulty] || settings.medium;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 