# Minesweeper with Multiplayer PvP

A classic Minesweeper game with both single-player and multiplayer PvP modes built with Next.js, React, TypeScript, and Socket.IO.

## Features

### Single Player Mode
- Classic Minesweeper gameplay
- Three difficulty levels: Easy (8x8), Medium (16x16), Hard (20x20)
- Timer and game statistics
- Safe first click (never hit a mine on first click)

### Multiplayer PvP Mode
- Real-time multiplayer gameplay using Socket.IO
- Create or join game rooms
- Share room links with friends
- Same board seed for both players (deterministic gameplay)
- Race to complete the board first
- Real-time game state synchronization
- Player ready system and game start coordination

## Getting Started

### Prerequisites
- Node.js (version 18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd minesweeper
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. In a separate terminal, start the Socket.IO server:
```bash
npm run server
```

5. Open your browser and navigate to `http://localhost:3000`

## How to Play Multiplayer

### Creating a Game
1. Select "Multiplayer PvP" mode
2. Enter your name
3. Choose difficulty level
4. Click "Create Room"
5. Share the room link with your friend (click "Copy Link")
6. Click "I'm Ready" when you're prepared to start
7. Once both players are ready, click "Start Game"

### Joining a Game
1. Select "Multiplayer PvP" mode
2. Click "Join Existing Room"
3. Enter your name and the room ID (from the shared link)
4. Click "Join Room"
5. Click "I'm Ready" when you're prepared to start
6. Once both players are ready, the host can click "Start Game"

### Gameplay
- Both players see the same board (deterministic seed)
- First player to complete the board wins
- If a player hits a mine, the other player wins
- Right-click to place/remove flags
- Real-time updates show the last move made by either player

## Technical Details

### Architecture
- **Frontend**: Next.js 15 with React 19, TypeScript, and Tailwind CSS
- **Backend**: Express.js with Socket.IO for real-time communication
- **Game Logic**: Deterministic board generation using seeds
- **State Management**: React hooks with Socket.IO event handling

### Key Components
- `Minesweeper`: Single-player game component
- `MultiplayerMinesweeper`: Multiplayer game component with Socket.IO integration
- `server/index.js`: Socket.IO server handling game rooms and state synchronization

### Socket.IO Events
- `createRoom`: Create a new game room
- `joinRoom`: Join an existing room
- `playerReady`: Mark player as ready
- `startGame`: Start the game when both players are ready
- `cellClick`: Handle cell reveals
- `cellFlag`: Handle flag placement
- `boardUpdate`: Broadcast board state changes
- `gameOver`/`gameWon`: Handle game end conditions

## Development

### Available Scripts
- `npm run dev`: Start Next.js development server
- `npm run server`: Start Socket.IO server
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint

### Project Structure
```
minesweeper/
├── app/
│   ├── components/
│   │   ├── minesweeper.tsx          # Single-player component
│   │   └── multiplayer-minesweeper.tsx  # Multiplayer component
│   ├── page.tsx                     # Main page with mode selector
│   └── ...
├── server/
│   └── index.js                     # Socket.IO server
├── package.json
└── README.md
```

## Deployment

To deploy this application, you'll need to:

1. Deploy the Next.js frontend to a hosting service (Vercel, Netlify, etc.)
2. Deploy the Socket.IO server to a Node.js hosting service (Railway, Heroku, etc.)
3. Update the Socket.IO connection URL in `multiplayer-minesweeper.tsx` to point to your deployed server
4. Configure CORS settings in the server to allow connections from your frontend domain

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is open source and available under the [MIT License](LICENSE).
