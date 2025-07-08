"use client";
import React, { useState, useRef, useEffect } from "react";
import { io, Socket } from "socket.io-client";

type Cell = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
};

type Difficulty = "easy" | "medium" | "hard";

type Player = {
  id: string;
  name: string;
  ready: boolean;
  isAdmin: boolean;
  wantsToPlayAgain?: boolean;
};

type GameState = "waiting" | "ready" | "countdown" | "playing" | "finished" | "post_game";

type Room = {
  id: string;
  difficulty: Difficulty;
  players: Player[];
  gameState: GameState;
  board: Cell[][] | null;
  seed: number;
  firstClick: { row: number; col: number } | null;
  gameStartTime: number | null;
  winner: string | null;
};

const DIFFICULTY_SETTINGS: Record<
  Difficulty,
  { rows: number; cols: number; mines: number }
> = {
  easy: { rows: 8, cols: 8, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 20, cols: 20, mines: 100 },
};

function MultiplayerMinesweeper() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [gameMode, setGameMode] = useState<"create" | "join" | "playing">("create");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [board, setBoard] = useState<Cell[][]>([]);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [error, setError] = useState("");
  const [lastMove, setLastMove] = useState<{ row: number; col: number; playerId: string; flagged?: boolean } | null>(null);
  const [playerProgress, setPlayerProgress] = useState<Record<string, number>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const [playAgainStatus, setPlayAgainStatus] = useState<{[playerId: string]: boolean}>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const newSocket = io("http://localhost:3001");
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;
    //eslint-disable-next-line
    socket.on("roomCreated", ({ roomId, room }) => {
      setRoom(room);
      setGameMode("playing");
      setError("");
    });

    socket.on("roomJoined", ({ room }) => {
      setRoom(room);
      setGameMode("playing");
      setError("");
    });

    socket.on("playerJoined", ({ player }) => {
      setRoom(prev => prev ? { ...prev, players: [...prev.players, player] } : null);
    });

    socket.on("playerReady", ({ playerId }) => {
      setRoom(prev => prev ? {
        ...prev,
        players: prev.players.map(p => p.id === playerId ? { ...p, ready: !p.ready } : p)
      } : null);
    });

    socket.on("gameReady", () => {
      setRoom(prev => prev ? { ...prev, gameState: "ready" } : null);
    });

    socket.on("gameWaiting", () => {
      setRoom(prev => prev ? { ...prev, gameState: "waiting" } : null);
    });

    socket.on("countdownStarted", ({ countdown: initialCountdown }) => {
      setRoom(prev => prev ? { ...prev, gameState: "countdown" } : null);
      setCountdown(initialCountdown);
    });

    socket.on("countdownUpdate", ({ countdown: newCountdown }) => {
      setCountdown(newCountdown);
    });

    socket.on("gameStarted", ({ startTime, board, firstClick }) => {
      setRoom(prev => prev ? { ...prev, gameState: "playing", gameStartTime: startTime } : null);
      setBoard(board);
      setCountdown(null);
      setTimer(0);
      setTimerActive(true);
      console.log(`Game started with board and first click at (${firstClick.row}, ${firstClick.col})`);
    });

    socket.on("boardUpdate", ({ board, lastMove, progress }) => {
      setBoard(board);
      setLastMove(lastMove);
      if (progress !== undefined) {
        setPlayerProgress(prev => ({ ...prev, [socket?.id || '']: progress }));
      }
    });

    socket.on("progressUpdate", ({ progress }) => {
      setPlayerProgress(progress);
    });

    //eslint-disable-next-line
    socket.on("gameOver", ({ winner, loser, reason, winnerId, loserId }) => {
      setTimerActive(false);
      setRoom(prev => prev ? { ...prev, gameState: "post_game", winner } : null);
      
      // Show personalized message based on whether current player won or lost
      if (winnerId === socket?.id) {
        setError(`You won! ${reason}`);
      } else if (loserId === socket?.id) {
        setError(`You lost! You hit a mine!`);
      } else {
        setError(reason);
      }
    });

    socket.on("gameWon", ({ winner, winnerId, reason }) => {
      setTimerActive(false);
      setRoom(prev => prev ? { ...prev, gameState: "post_game", winner } : null);
      
      // Show personalized message based on whether current player won
      if (winnerId === socket?.id) {
        setError(`You won! ${reason}`);
      } else {
        setError(reason);
      }
    });

    socket.on("gameReset", ({ room }) => {
      setRoom(room);
      setBoard([]);
      setTimer(0);
      setTimerActive(false);
      setError("");
      setLastMove(null);
      setPlayerProgress({});
      setCountdown(null);
      setPlayAgainStatus({});
    });

    socket.on("playAgainStatus", ({ playerId, wantsToPlayAgain, allWantToPlayAgain }) => {
      setPlayAgainStatus(prev => ({
        ...prev,
        [playerId]: wantsToPlayAgain
      }));
      
      // If both players want to play again, the game will be reset
      if (allWantToPlayAgain) {
        setPlayAgainStatus({});
      }
    });

    //eslint-disable-next-line
    socket.on("movedToNewRoom", ({ roomId, room }) => {
      setRoom(room);
      setBoard([]);
      setTimer(0);
      setTimerActive(false);
      setError("You moved to a new room! Share the new code with a friend.");
      setLastMove(null);
      setPlayerProgress({});
      setCountdown(null);
    });

    socket.on("returnedToLobby", () => {
      resetGame();
    });

    socket.on("playerLeft", ({ playerId }) => {
      setRoom(prev => prev ? {
        ...prev,
        players: prev.players.filter(p => p.id !== playerId)
      } : null);
    });

    socket.on("error", ({ message }) => {
      setError(message);
    });

    return () => {
      socket.off("roomCreated");
      socket.off("roomJoined");
      socket.off("playerJoined");
      socket.off("playerReady");
      socket.off("gameReady");
      socket.off("gameWaiting");
      socket.off("countdownStarted");
      socket.off("countdownUpdate");
      socket.off("gameStarted");
      socket.off("boardUpdate");
      socket.off("progressUpdate");
      socket.off("gameOver");
      socket.off("gameWon");
      socket.off("gameReset");
      socket.off("playAgainStatus");
      socket.off("movedToNewRoom");
      socket.off("returnedToLobby");
      socket.off("playerLeft");
      socket.off("error");
    };
  }, [socket]);

  // Timer effect
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerActive]);

  const createRoom = () => {
    if (!socket || !playerName.trim()) {
      setError("Please enter your name");
      return;
    }
    socket.emit("createRoom", { difficulty, playerName: playerName.trim() });
  };

  const joinRoom = () => {
    if (!socket || !playerName.trim() || !roomId.trim()) {
      setError("Please enter your name and room ID");
      return;
    }
    socket.emit("joinRoom", { roomId: roomId.trim(), playerName: playerName.trim() });
  };

  const markReady = () => {
    if (!socket || !room) return;
    
    // Update local state immediately for better UX
    setRoom(prev => prev ? {
      ...prev,
      players: prev.players.map(p => p.id === socket?.id ? { ...p, ready: !p.ready } : p)
    } : null);
    
    socket.emit("playerReady", { roomId: room.id });
  };

  const startGame = () => {
    if (!socket || !room) return;
    socket.emit("startGame", { roomId: room.id });
  };

  const handleCellClick = (row: number, col: number) => {
    if (!socket || !room || room.gameState !== "playing") return;
    socket.emit("cellClick", { roomId: room.id, row, col });
  };

  const handleRightClick = (e: React.MouseEvent<HTMLButtonElement>, row: number, col: number) => {
    e.preventDefault();
    if (!socket || !room || room.gameState !== "playing") return;
    socket.emit("cellFlag", { roomId: room.id, row, col });
  };



  const resetGame = () => {
    setRoom(null);
    setBoard([]);
    setTimer(0);
    setTimerActive(false);
    setError("");
    setLastMove(null);
    setPlayerProgress({});
    setCountdown(null);
    setPlayAgainStatus({});
    setGameMode("create");
  };

  const playAgain = () => {
    if (!socket || !room) return;
    
    // Update local state immediately for better UX
    setPlayAgainStatus(prev => ({
      ...prev,
      [socket?.id || '']: !prev[socket?.id || '']
    }));
    
    socket.emit("playAgain", { roomId: room.id });
  };

  const returnToLobby = () => {
    if (!socket || !room) return;
    socket.emit("returnToLobby", { roomId: room.id });
  };



  if (gameMode === "create") {
    return (
      <div className="flex flex-col items-center mt-8 max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-6">Create Multiplayer Game</h2>
        
        <div className="w-full space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Your Name:</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Difficulty:</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="easy">Easy (8x8, 10 bombs)</option>
              <option value="medium">Medium (16x16, 40 bombs)</option>
              <option value="hard">Hard (20x20, 100 bombs)</option>
            </select>
          </div>

          <button
            onClick={createRoom}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Create Room
          </button>

          <div className="text-center">
            <span className="text-gray-600">or</span>
          </div>

          <button
            onClick={() => setGameMode("join")}
            className="w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Join Existing Room
          </button>

          {error && (
            <div className="text-red-600 text-center">{error}</div>
          )}
        </div>
      </div>
    );
  }

  if (gameMode === "join") {
    return (
      <div className="flex flex-col items-center mt-8 max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-6">Join Multiplayer Game</h2>
        
        <div className="w-full space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Your Name:</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Room ID:</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter room ID"
            />
          </div>

          <button
            onClick={joinRoom}
            className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Join Room
          </button>

          <button
            onClick={() => setGameMode("create")}
            className="w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Back to Create
          </button>

          {error && (
            <div className="text-red-600 text-center">{error}</div>
          )}
        </div>
      </div>
    );
  }

  if (!room) return null;

  const { rows, cols } = DIFFICULTY_SETTINGS[room.difficulty];
  const currentPlayer = room.players.find(p => p.id === socket?.id);
  //eslint-disable-next-line
  const otherPlayer = room.players.find(p => p.id !== socket?.id);

  return (
    <div className="flex flex-col items-center mt-8">
      <h2 className="text-2xl font-bold mb-2">Multiplayer Minesweeper</h2>
      
      {/* Room Info */}
      <div className="mb-4 text-center">
        <div className="text-sm text-gray-600 mb-2">
          Room Code: <span className="font-mono font-bold text-lg">{room.id}</span>
        </div>
        <div className="text-sm">
          Difficulty: {room.difficulty.charAt(0).toUpperCase() + room.difficulty.slice(1)} ({rows}x{cols})
        </div>
      </div>

      {/* Players */}
      <div className="mb-4 flex gap-8">
        {room.players.map(player => (
          <div key={player.id} className="text-center">
            <div className={`font-bold ${player.id === socket?.id ? 'text-blue-600' : 'text-gray-600'}`}>
              {player.name} {player.id === socket?.id ? '(You)' : ''} {player.isAdmin ? '👑' : ''}
            </div>
            <div className="text-sm">
              {player.ready ? '✅ Ready' : '⏳ Waiting'}
            </div>
            {room.gameState === "playing" && playerProgress[player.id] !== undefined && (
              <div className="text-xs text-gray-500 mt-1">
                Progress: {playerProgress[player.id]}%
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Game Status */}
      <div className="mb-4 text-center">
        {room.gameState === "waiting" && (
          <div className="text-yellow-600">
            {room.players.length < 2 
              ? "Waiting for players to join..." 
              : "Waiting for players to get ready..."
            }
          </div>
        )}
        {room.gameState === "ready" && (
          <div className="text-green-600">Both players ready! Click Start Game to begin the race!</div>
        )}
        {room.gameState === "countdown" && countdown !== null && (
          <div className="text-orange-600 text-2xl font-bold">
            Game starting in {countdown}...
          </div>
        )}
        {room.gameState === "playing" && (
          <div className="text-blue-600">
            Race in progress - Time: {timer}s
            <div className="text-sm text-gray-600 mt-1">
              First player to complete their board wins! Starting area is already revealed.
            </div>
          </div>
        )}
        {room.gameState === "post_game" && (
          <div className="text-purple-600 font-bold">
            Game Over! {room.winner} wins!
          </div>
        )}
        {error && (
          <div className="text-red-600">{error}</div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mb-4 flex gap-2">
        {(room.gameState === "waiting" || room.gameState === "ready") && currentPlayer && (
          <button
            onClick={markReady}
            className={`px-4 py-2 rounded hover:opacity-80 ${
              currentPlayer.ready 
                ? "bg-yellow-500 text-white" 
                : "bg-green-500 text-white"
            }`}
          >
            {currentPlayer.ready ? "Not Ready" : "I'm Ready"}
          </button>
        )}
        {room.gameState === "ready" && currentPlayer?.isAdmin && (
          <button
            onClick={startGame}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Start Game
          </button>
        )}
        {room.gameState === "ready" && !currentPlayer?.isAdmin && (
          <div className="px-4 py-2 bg-gray-300 text-gray-600 rounded">
            Waiting for admin to start...
          </div>
        )}
        {room.gameState === "post_game" && (
          <div className="space-y-4">
            {/* Play Again Status */}
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-2">Play Again Status:</div>
              {room.players.map(player => (
                <div key={player.id} className="text-sm">
                  {player.name}: {playAgainStatus[player.id] ? "✅ Wants to play again" : "⏳ Waiting..."}
                </div>
              ))}
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2 justify-center">
              <button
                onClick={playAgain}
                className={`px-4 py-2 rounded hover:opacity-80 ${
                  playAgainStatus[socket?.id || ''] 
                    ? "bg-yellow-500 text-white" 
                    : "bg-green-500 text-white"
                }`}
              >
                {playAgainStatus[socket?.id || ''] ? "Waiting for other player..." : "Play Again"}
              </button>
              <button
                onClick={returnToLobby}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Leave Lobby
              </button>
            </div>
          </div>
        )}
        {room.gameState !== "post_game" && (
          <button
            onClick={resetGame}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            New Game
          </button>
        )}
      </div>

      {/* Last Move Indicator */}
      {lastMove && room.gameState === "playing" && (
        <div className="mb-2 text-sm text-gray-600">
          Your last move: {lastMove.flagged ? 'flagged' : 'revealed'} ({lastMove.row}, {lastMove.col})
        </div>
      )}

      {/* Game Board */}
      {room.gameState === "playing" && board.length > 0 && (
        <div
          className="grid"
          style={{
            gridTemplateRows: `repeat(${rows}, 2rem)`,
            gridTemplateColumns: `repeat(${cols}, 2rem)`,
          }}
        >
          {board.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}-${c}`}
                className={`w-8 h-8 flex items-center justify-center border border-gray-400 text-sm font-mono
                  ${
                    cell.isRevealed
                      ? "bg-gray-100"
                      : "bg-gray-300 hover:bg-gray-400"
                  }
                  ${cell.isFlagged ? "text-red-500" : ""}
                `}
                onClick={() => handleCellClick(r, c)}
                onContextMenu={(e) => handleRightClick(e, r, c)}
                disabled={cell.isRevealed || room.gameState !== "playing"}
              >
                {cell.isRevealed
                  ? cell.isMine
                    ? "💣"
                    : cell.adjacentMines > 0
                    ? cell.adjacentMines
                    : ""
                  : cell.isFlagged
                  ? "🚩"
                  : ""}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default MultiplayerMinesweeper; 