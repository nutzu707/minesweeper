"use client";
import React, { useState, useRef, useEffect } from "react";

type Cell = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
};

type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTY_SETTINGS: Record<
  Difficulty,
  { rows: number; cols: number; mines: number }
> = {
  easy: { rows: 8, cols: 8, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 20, cols: 20, mines: 100 },
};

function getNeighbors(
  r: number,
  c: number,
  rows: number,
  cols: number
): [number, number][] {
  const neighbors: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        neighbors.push([nr, nc]);
      }
    }
  }
  return neighbors;
}

function generateBoardWithSafeZone(
  safeR: number,
  safeC: number,
  rows: number,
  cols: number,
  mines: number
): Cell[][] {
  // The safe zone is the clicked cell and its neighbors
  const safeZone = new Set<string>();
  safeZone.add(`${safeR},${safeC}`);
  getNeighbors(safeR, safeC, rows, cols).forEach(([nr, nc]) =>
    safeZone.add(`${nr},${nc}`)
  );

  const board: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
    }))
  );

  // Place mines, but not in the safe zone
  let minesPlaced = 0;
  while (minesPlaced < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
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

function generateBoard(
  rows: number,
  cols: number,
  mines: number
): Cell[][] {
  const board: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
    }))
  );

  let minesPlaced = 0;
  while (minesPlaced < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (!board[r][c].isMine) {
      board[r][c].isMine = true;
      minesPlaced++;
    }
  }

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

// Flood fill reveal: reveals all empty cells and their bordering numbers
function floodReveal(
  board: Cell[][],
  r: number,
  c: number,
  rows: number,
  cols: number
): Cell[][] {
  const newBoard = board.map((row) => row.map((cell) => ({ ...cell })));
  const stack: [number, number][] = [[r, c]];
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  while (stack.length > 0) {
    const [cr, cc] = stack.pop()!;
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

function revealCell(
  board: Cell[][],
  r: number,
  c: number,
  rows: number,
  cols: number
): Cell[][] {
  return floodReveal(board, r, c, rows, cols);
}

function checkWin(board: Cell[][], rows: number, cols: number): boolean {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r][c].isMine && !board[r][c].isRevealed) {
        return false;
      }
    }
  }
  return true;
}

function Minesweeper() {
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const { rows, cols, mines } = DIFFICULTY_SETTINGS[difficulty];

  // We use a key to force a full reset of the board when difficulty changes
  const [boardKey, setBoardKey] = useState(0);

  const [board, setBoard] = useState<Cell[][]>(() =>
    generateBoard(rows, cols, mines)
  );
  const [gameOver, setGameOver] = useState(false);
  const [win, setWin] = useState(false);
  const [firstClick, setFirstClick] = useState(true);

  // Timer state
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start/stop timer effect
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setTimer((t) => t + 1);
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

  // When difficulty changes, reset everything
  React.useEffect(() => {
    setBoard(generateBoard(rows, cols, mines));
    setGameOver(false);
    setWin(false);
    setFirstClick(true);
    setBoardKey((k) => k + 1);
    setTimer(0);
    setTimerActive(false);
  }, [difficulty, rows, cols, mines]);

  // Stop timer on win or game over
  useEffect(() => {
    if (gameOver || win) {
      setTimerActive(false);
    }
  }, [gameOver, win]);

  const handleCellClick = (r: number, c: number) => {
    if (gameOver || win) return;
    if (board[r][c].isFlagged) return;

    if (firstClick) {
      // On first click, generate a new board with a safe zone and reveal
      const newBoard = generateBoardWithSafeZone(r, c, rows, cols, mines);
      const revealedBoard = floodReveal(newBoard, r, c, rows, cols);
      setBoard(revealedBoard);
      setFirstClick(false);
      setTimer(0);
      setTimerActive(true);
      if (checkWin(revealedBoard, rows, cols)) {
        setWin(true);
      }
      return;
    }

    if (board[r][c].isMine) {
      // Reveal all mines
      const newBoard = board.map((row) =>
        row.map((cell) =>
          cell.isMine ? { ...cell, isRevealed: true } : cell
        )
      );
      setBoard(newBoard);
      setGameOver(true);
    } else {
      const newBoard = revealCell(board, r, c, rows, cols);
      setBoard(newBoard);
      if (checkWin(newBoard, rows, cols)) {
        setWin(true);
      }
    }
  };

  const handleRightClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    r: number,
    c: number
  ) => {
    e.preventDefault();
    if (gameOver || win) return;
    if (board[r][c].isRevealed) return;
    const newBoard = board.map((row, rowIdx) =>
      row.map((cell, colIdx) =>
        rowIdx === r && colIdx === c
          ? { ...cell, isFlagged: !cell.isFlagged }
          : cell
      )
    );
    setBoard(newBoard);
  };

  const handleReset = () => {
    setBoard(generateBoard(rows, cols, mines));
    setGameOver(false);
    setWin(false);
    setFirstClick(true);
    setBoardKey((k) => k + 1);
    setTimer(0);
    setTimerActive(false);
  };

  const handleDifficultyChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setDifficulty(e.target.value as Difficulty);
  };

  return (
    <div className="flex flex-col items-center mt-8">
      <h2 className="text-2xl font-bold mb-2">Minesweeper</h2>
      <div className="mb-2 flex flex-row gap-2 items-center">
        <label htmlFor="difficulty" className="font-mono">
          Difficulty:
        </label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={handleDifficultyChange}
          className="px-2 py-1 rounded border border-gray-300 bg-gray-100"
        >
          <option value="easy">Easy (8x8, 10 bombs)</option>
          <option value="medium">Medium (16x16, 40 bombs)</option>
          <option value="hard">Hard (20x20, 100 bombs)</option>
        </select>
      </div>
      <div className="mb-2 flex flex-row gap-4 items-center">
        {gameOver && <span className="text-red-600 font-bold">Game Over!</span>}
        {win && <span className="text-green-600 font-bold">You Win!</span>}
        <span className="font-mono text-gray-700">
          Time: {timer}s
        </span>
      </div>
      <button
        className="mb-4 px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
        onClick={handleReset}
      >
        Reset
      </button>
      <div
        key={boardKey}
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
              disabled={cell.isRevealed || gameOver || win}
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
    </div>
  );
}

export default Minesweeper;
