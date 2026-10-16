# FRIENDSLOPPED

A monorepo of N64-flavoured party games. You join with a name, pick a game cartridge, then host or join a lobby.

```
pnpm install
pnpm dev          # web on http://localhost:5173, server on :3001
pnpm bots         # bots host their own lobby and play a full game
pnpm bots ABCD 5  # 5 bots join lobby ABCD (any game) so you can test alone
GAME=tunedin MODE=teams pnpm bots   # bots play a full game of another game/mode
pnpm test         # rules engine tests
pnpm build && pnpm start   # production: one server on :3001 serves the client too
```

Each browser tab is its own player (the session lives in `sessionStorage`), so you can test with several tabs. Refreshing the page puts you back in your lobby.

## Layout

| Path | What |
| --- | --- |
| `packages/shared` | Lobby protocol shared by every game (messages, lobby state) |
| `packages/mafia` | Mafia rules engine: pure, deterministic and unit-tested |
| `packages/tunedin` | Tuned In (a Wavelength-style game) rules engine and spectrum deck |
| `apps/server` | WebSocket server: sessions, lobbies, host controls, game registry (`src/games`) |
| `apps/web` | React client with a low-poly Three.js village rendered at low resolution |

### Adding a game
1. Write the rules as a package (see `packages/mafia`).
2. Register a `GameDefinition` in `apps/server/src/games/index.ts`.
3. Register the client UI (`Settings`, `Rules`, `Game`) in `apps/web/src/games.tsx`.

Lobbies, hosting, invite codes, reconnects and the lobby browser then work for the new game as well.

## Mafia rules (the same every game)
The host sets the number of **killers**, **detectives** and **healers**. Everyone else is a villager. Modes only change phase length (Classic, Speed, Marathon).

- **Night:** Killers choose a victim. The most votes wins, and a tie goes to the earliest-seated killer's pick. Each healer protects one player, and can't protect the same player two nights in a row. Each detective privately learns whether one player is a killer.
- **Dawn:** The victim is revealed with their role, unless a healer protected them.
- **Day:** Players discuss. Voting opens when the timer ends, when everyone alive is ready, or when the host skips ahead.
- **Vote:** Voting is public. A player is eliminated only with strictly more votes than every other player *and* than skip.
- **Win:** The town wins when no killers remain. The killers win once they equal or outnumber the town.
- Dead players become ghosts. They see every role and get their own chat. A player who leaves mid-game dies with their role revealed.

## Tuned In rules
Each round shows a card with two opposites, like *Cold ↔ Hot*. A target is hidden somewhere on the dial between them. Only the **psychic** can see it. They give one clue, like "Lukewarm tea", and can swap the card once per round.

- **Party** (3+ players): everyone else drags their own needle in secret. A bullseye scores 4, close scores 3 and nearby scores 2. The psychic earns the rounded average, so good clues pay off. Everyone is psychic once (or up to 3 times). The highest score wins.
- **Teams** (4+ players): teams are dealt randomly. The psychic's team shares one needle, and anyone on the team can move it. The other team then calls whether the target is left or right of the needle, and a correct call steals 1 point (no steal after a bullseye). Teams take turns. The first team to reach the target score (default 10) at the end of a round wins, and ties play on.
