# Bhabhi Thulla

Bhabhi Thulla is a full-stack, real-time multiplayer card game built with React, TypeScript, Vite, Tailwind CSS, Framer Motion, Node.js, Express, Socket.IO, Zustand, and SQLite.

## Features

- Private rooms with shareable room code and link
- Guest player profiles plus secure Google sign-in through Firebase Authentication
- Permanent profiles with unique usernames, XP, levels, ranks, coins, statistics, achievements, preferences, and match history
- Persistent friends, live presence, requests, recent players, privacy controls, blocking, and private game invitations
- Real-time Socket.IO gameplay, chat, emoji reactions, spectators, timers, and room list
- Opt-in WebRTC voice chat for human multiplayer seats with self-mute, deafen, per-player volume/mute, speaking indicators, device controls, push-to-talk, and reconnect support
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
room:closed     # terminal room cleanup notification
room:reclaimSeat # take back a seat temporarily handed to a bot
gameError       # rejected action or room error
```

The browser stores `sessionId` and `roomCode` in localStorage so a refresh can reconnect the same player to the same seat. Disconnected players remain seated and can return; a quitting player can also hand their seat to a bot so the game continues.

Rooms follow a bounded lifecycle. Completed matches remain open for 12 seconds so players can see the result, then the server removes the room and its live SQLite snapshot. Rooms with no connected human players disappear from discovery immediately and are deleted after a five-minute reconnect grace period. Active tournament stages are retained so the host can advance to the next stage.

Players who choose **Replace me with bot** remain at the table as spectators and can reclaim that exact seat until the match finishes. The server preserves the seat's hand, score, and turn order while validating that only its original owner can take it back.

## Friends And Presence

Registered players can search public usernames or player IDs, exchange friend requests, see live activity, invite available friends, join friends in public lobbies, and reconnect with registered opponents from completed matches. Guests can open the social UI but are invited to create a free profile before storing permanent relationships.

Friendship state, blocks, request cooldowns, list limits, room eligibility, and invitation expiry are enforced by the Socket.IO server. Clients never supply their own account identity, and private room codes are revealed only when an authorised invitation is accepted. Presence follows every connected device and reports online, lobby, private room, match, tournament, away, or offline state according to each player's activity privacy setting.

The initial limits are 250 friends, 50 pending outgoing requests, a one-minute repeated-request cooldown, and a two-minute game invitation lifetime. These values live in `FRIEND_LIMITS` in `apps/server/src/db.ts`.

## Live Voice Chat

Voice is opt-in and available only to seated human players in online multiplayer rooms. Bots, bot-only games, offline tournaments, and spectators never join voice or receive voice controls. Audio uses a peer-to-peer WebRTC mesh; Socket.IO carries validated SDP and ICE signalling only. The application server never receives, records, stores, transcribes, or analyses conversation audio.

Players can mute their microphone without closing the connection, locally mute or adjust another human player's volume, mute all remote audio, see speaking/muted/disconnected states, choose input and supported output devices, enable browser noise processing, and use push-to-talk. Denied microphone permission or a voice connection failure never prevents card play.

### STUN and TURN

Public STUN alone is not enough for players behind restrictive carrier or corporate NAT. Configure a TURN service in the backend environment:

```bash
VOICE_STUN_URLS=stun:stun.l.google.com:19302
VOICE_TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp
VOICE_TURN_REST_SECRET=a_long_random_secret_shared_with_coturn
VOICE_TURN_CREDENTIAL_TTL_SECONDS=3600
```

`VOICE_TURN_REST_SECRET` is preferred. The backend uses coturn REST authentication to create short-lived HMAC credentials tied to the joining player, so no long-lived TURN password appears in client source. `VOICE_TURN_USERNAME` and `VOICE_TURN_CREDENTIAL` are available only for local/private installations that cannot use temporary credentials.

Production microphone capture requires HTTPS. `http://localhost` is allowed by browsers for local development. Do not test from a phone using a plain LAN HTTP URL; use a trusted HTTPS tunnel or the deployed site.

### Voice testing

1. Create a normal private or public room, then join it from two browser profiles or two devices.
2. Start voice from each device by pressing **Join Voice** and accepting the privacy prompt and browser permission.
3. Confirm each human seat shows a voice icon and speaking glow. Bots must show neither.
4. Test self-mute, Mute All, individual mute and volume, device selectors, and push-to-talk.
5. Refresh one player and confirm game reconnection completes before voice reconnects.
6. Repeat with one device on Wi-Fi and one on mobile data to verify TURN relay operation.
7. Deny permission and unplug a microphone to confirm the game remains playable and the voice status explains the problem.

If audio is silent, check the browser's site microphone permission, operating-system input permission, selected input/output device, Mute All state, and TURN environment values. Some mobile browsers require another tap on the voice control before autoplaying remote audio.

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

The backend validates every move, controls the deck, enforces follow-suit, resolves Thulla pickups, and records round summaries. A first timeout auto-plays the lowest legal card. Repeated inactivity enables temporary server-side bot control while preserving the player's identity, hand, seat, score, and reconnect rights.

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

Without Firebase variables, the complete guest flow remains available and Google sign-in reports that configuration is required.

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
VITE_FIREBASE_API_KEY=your_public_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your_public_web_app_id
VITE_FIREBASE_MESSAGING_SENDER_ID=your_public_sender_id
FIREBASE_PROJECT_ID=your-project-id
VOICE_STUN_URLS=stun:stun.l.google.com:19302
VOICE_TURN_URLS=turn:turn.example.com:3478?transport=udp
VOICE_TURN_REST_SECRET=your_server_only_turn_secret
VOICE_TURN_CREDENTIAL_TTL_SECONDS=3600
```

The default local config still works if `SQLITE_PATH` is omitted.

## Google Authentication

1. Create or select a project in the [Firebase console](https://console.firebase.google.com/).
2. Open **Authentication > Sign-in method** and enable the Google provider.
3. Add a Web app in **Project settings > General** and copy its public configuration values into the `VITE_FIREBASE_*` variables. These values identify the Firebase project and are safe for browser use.
4. Add `localhost` and the production Vercel domain to **Authentication > Settings > Authorized domains**. Local development uses `http://localhost:5173`; production uses `https://bhabhi-thulla-alpha.vercel.app`.
5. Set the backend-only `FIREBASE_PROJECT_ID`. Token verification uses Firebase's public signing certificates, so no long-lived service-account private key is required.
6. Restart the client and server after changing environment variables.

The browser completes the official Firebase Google popup flow. It sends the resulting Firebase ID token over HTTPS to the API. The API verifies the token with Firebase Admin before reading or changing a profile. The server never stores raw Google OAuth access tokens.

### Guest upgrade

Guest identity and progress use `bhabhi-thulla-player-auth` in localStorage. **Save progress with Google** asks for confirmation, signs the player in, and merges eligible local stats, coins, achievements, and preferences once. The `guest_merges` database table makes the transfer idempotent so refreshing or retrying cannot duplicate rewards.

### Profile database migrations

Database migrations run automatically when the API starts. The SQLite schema includes `users`, `player_stats`, `player_preferences`, `achievements`, `user_achievements`, `match_history`, and `guest_merges`. To run against a new local database:

```bash
SQLITE_PATH=./data/bhabhi-thulla.sqlite pnpm --filter @getaway-cards/server start
```

For production account persistence, the backend must use durable SQLite storage or PostgreSQL. Render's `/tmp` filesystem is suitable only for demonstrations and is erased when the instance restarts.

### Authentication testing

1. Remove `bhabhi-thulla-player-auth` from browser storage to test first entry.
2. Choose **Play as Guest**, refresh, and confirm the same name/avatar return.
3. Choose **Save progress with Google**, complete the official OAuth screen, and confirm the merged profile appears.
4. Log out, sign in on another browser, and confirm the same username, statistics, and customisation return.
5. Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before deployment.

## Deployment

Live deployment:

- Game: https://bhabhi-thulla-alpha.vercel.app
- API health: https://bhabhi-thulla-api.onrender.com/health
- Source: https://github.com/h-babar/bhabhi-thulla

Frontend on Vercel:

1. Deploy the repository root.
2. Use the included `vercel.json`.
3. Set `VITE_API_URL` to the deployed backend URL.
4. Set all public `VITE_FIREBASE_*` values from the Firebase Web app.

Backend on Render:

1. Use the included `render.yaml`.
2. Set `CLIENT_ORIGIN` to the Vercel frontend URL.
3. The included free-service blueprint stores SQLite at `/tmp/bhabhi-thulla.sqlite`. Free instances lose local data when they restart or spin down.
4. For durable production history, upgrade the service, attach a persistent disk, and set `SQLITE_PATH=/var/data/bhabhi-thulla.sqlite`.
5. Set the backend-only `FIREBASE_PROJECT_ID` value.
6. Set `VOICE_TURN_URLS` and `VOICE_TURN_REST_SECRET` for reliable cross-network voice. Keep the secret backend-only.

Backend on Railway:

1. Use the included `railway.json`.
2. Set `CLIENT_ORIGIN`, `PORT`, `SQLITE_PATH`, and `SEED_DEMO`.
3. Use a persistent volume for SQLite in production.

## Custom Card Artwork

The UI currently renders polished CSS card faces through `apps/client/src/components/CardView.tsx`. To add custom artwork later, replace or extend that component and keep the shared `Card` shape unchanged.
