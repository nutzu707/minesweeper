"use client";
import { useState } from "react";
import Minesweeper from "./components/minesweeper";
import MultiplayerMinesweeper from "./components/multiplayer-minesweeper";

export default function Home() {
  const [gameMode, setGameMode] = useState<"single" | "multiplayer">("single");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-8">Minesweeper</h1>
        
        {/* Game Mode Seletor */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex space-x-2">
              <button
                onClick={() => setGameMode("single")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  gameMode === "single"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Single Player
              </button>
              <button
                onClick={() => setGameMode("multiplayer")}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  gameMode === "multiplayer"
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Multiplayer PvP
              </button>
            </div>
          </div>
        </div>

        {gameMode === "single" ? <Minesweeper /> : <MultiplayerMinesweeper />}
      </div>
    </main>
  );
}
