# Bhabhi Thulla

Bhabhi Thulla is a full-stack, real-time multiplayer card game built with React, TypeScript, Vite, Tailwind CSS, Framer Motion, Node.js, Express, Socket.IO, Zustand, and SQLite.

## Features

- Private rooms with shareable room code and link
- Guest username/avatar login with reconnect support
- Real-time Socket.IO gameplay, chat, emoji reactions, spectators, timers, and room list
- Server-authoritative Bhabhi Thulla rules engine for shuffling, dealing, validation, scoring, turns, timers, and results
- AI bots with Easy, Normal, and Hard strategies
- Tournament mode with nation selection, Group Stage, Quarter Final, Semi Final, Final, hidden future draws, and server-controlled advancement
- Responsive desktop, tablet, and mobile table UI with touch/drag card play
- Light/dark mode, sound toggle, escape board, game history, and round summaries
- SQLite persistence for room snapshots, events, and completed rounds
- Deployment configs for Vercel frontend and Render/Railway backend

## Real-Time Multiplayer

The Socket.IO server is authoritative. Clients send room/player actions only; the server owns deck shuffle, dealing, turn validation, legal move checks, trick resolution, scoring, timers, and game-over results.

Public client events:

```text
createRoom
joinRoom
reconnectPlayer
playerReady
startGame
playCard
leaveRoom
```

Server broadcasts:

```text
roomState       # public table state without player hands
privateHand     # only the receiving player's hand
gameError       # rejected action or room error
```

The browser stores `sessionId` and `roomCode` in localStorage so a refresh can reconnect the same player to the same seat. Disconnected players remain seated and can return; a quitting player can also hand their seat to a bot so the game continues.

## Folder Structure

```text
getaway-cards/
  apps/
    client/          React + Vite + Tailwind frontend
    server/          Express + Socket.IO backend
  packages/
    shared/          Typed rules engine, bots, deck helpers, socket contracts
  render.yaml        Render backend deployment
  railway.json       Railway backend deployment
  vercel.json        Vercel frontend deployment
```

## Game Rules

Bhabhi Thulla uses a standard 52-card deck. The server shuffles the deck and deals every card to seated players.

- The player holding the Ace of Spades leads the first trick.
- If the trick is empty, the active player may lead any card.
- Once a suit is led, every player must follow that suit if they can.
- If a player has no card in the led suit, they may throw any card. That off-suit card is called Thulla.
- If a trick has no Thulla, the highest card of the led suit clears the trick and leads the next trick.
- If a trick has any Thulla, the highest card of the led suit must pick up the whole trick as a penalty and then leads.
- Before leading a fresh trick, the active player may take every card from the next active player. That player escapes safely, the cards join the taker's hand, and the taker keeps the lead. This can be done only once before playing the lead card.
- Players with zero cards escape and are safe for the hand.
- The last player still holding cards is Bhabhi.

## Scoring

Each escaped player earns 1 escape point. The first player to reach the target escape score wins the match. The default target is 5.

The backend validates every move, controls the deck, enforces follow-suit, resolves Thulla pickups, and records round summaries. On the first timeout, the next player gives one card as Timeout Dhulla. Missing two turns in a row declares that seat Bhabhi and replaces the player with a bot so the game can continue.

## Tournament Mode

Tournament mode lets a player choose a nation and enter a four-stage path: Group Stage, Quarter Final, Semi Final, and Final. Each stage is a four-player Bhabhi table against national bot opponents.

- Winning a stage moves the player to the next stage.
- Losing any stage eliminates the player from the tournament.
- Winning the Final crowns the selected nation as champion.
- Tournament hands use a one-win target so each stage resolves quickly.
- The backend controls stage creation, bot seating, match results, advancement, and future opponent draws.

## Bot Strategy

- Easy: random legal card.
- Normal: leads from its longest suit, follows low, throws high when void.
- Hard: tries to shed short suits, avoids taking polluted Thulla tricks when possible, and throws high cards when void.

## Setup

Requires Node.js `24+` because the backend uses the built-in SQLite module.

```bash
pnpm install
cp .env.example .env
pnpm seed
pnpm dev
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Health check: `http://localhost:4000/health`

## Scripts

```bash
pnpm dev          # build shared package, then run client and server
pnpm build        # build shared, server, and client
pnpm typecheck    # typecheck every workspace package
pnpm seed         # seed demo round history into SQLite
```

## Environment

```bash
CLIENT_ORIGIN=http://localhost:5173
PORT=4000
SQLITE_PATH=./data/bhabhi-thulla.sqlite
SEED_DEMO=true
VITE_API_URL=http://localhost:4000
```

The default local config still works if `SQLITE_PATH` is omitted.

## Deployment

Frontend on Vercel:

1. Deploy the repository root.
2. Use the included `vercel.json`.
3. Set `VITE_API_URL` to the deployed backend URL.

Backend on Render:

1. Use the included `render.yaml`.
2. Set `CLIENT_ORIGIN` to the Vercel frontend URL.
3. The included free-service blueprint stores SQLite at `/tmp/bhabhi-thulla.sqlite`. Free instances lose local data when they restart or spin down.
4. For durable production history, upgrade the service, attach a persistent disk, and set `SQLITE_PATH=/var/data/bhabhi-thulla.sqlite`.

Backend on Railway:

1. Use the included `railway.json`.
2. Set `CLIENT_ORIGIN`, `PORT`, `SQLITE_PATH`, and `SEED_DEMO`.
3. Use a persistent volume for SQLite in production.

## Custom Card Artwork

The UI currently renders polished CSS card faces through `apps/client/src/components/CardView.tsx`. To add custom artwork later, replace or extend that component and keep the shared `Card` shape unchanged.
