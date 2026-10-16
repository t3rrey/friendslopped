import { useState } from 'react';
import { NAME_MAX } from '@friendslopped/shared';
import { connect, useNet } from '../net.ts';
import { Button, ChunkyText } from '../ui.tsx';
import { CLIENT_GAMES } from '../games.tsx';

const LOCKED = ['Coming Soon', 'Coming Soon'];

export function GameSelect({ onPick }: { onPick: (gameId: string) => void }) {
  const games = useNet((s) => s.games);
  const me = useNet((s) => s.me)!;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="heading">
          <ChunkyText text="Select Game" />
        </h1>
        {editing ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) connect(name.trim());
              setEditing(false);
            }}
          >
            <input autoFocus value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
            <Button tone="b" size="sm" type="submit">
              Save
            </Button>
          </form>
        ) : (
          <button type="button" className="player-tag" onClick={() => setEditing(true)}>
            Playing as <b>{me.name}</b> ✎
          </button>
        )}
      </header>
      <div className="carts">
        {games.map((g) => {
          const client = CLIENT_GAMES[g.id];
          if (client?.theme === 'cube') {
            return (
              <button key={g.id} type="button" className="disc-case" onClick={() => onPick(g.id)}>
                <span className="disc">
                  <span className="disc-art" style={{ background: client.labelArt }} />
                  <span className="disc-name">{g.name}</span>
                  <span className="disc-hole" />
                </span>
                <span className="cart-meta">
                  {g.tagline}
                  <small>
                    {g.minPlayers}–{g.maxPlayers} players · {g.modes.length} modes
                  </small>
                </span>
              </button>
            );
          }
          return (
            <button key={g.id} type="button" className="cart" onClick={() => onPick(g.id)}>
              <span className="cart-grip" />
              <span className="cart-label" style={{ background: client?.labelArt }}>
                <span className="cart-art">{client?.icon}</span>
                <span className="cart-name">{g.name}</span>
              </span>
              <span className="cart-meta">
                {g.tagline}
                <small>
                  {g.minPlayers}–{g.maxPlayers} players · {g.modes.length} modes
                </small>
              </span>
            </button>
          );
        })}
        {LOCKED.map((label, i) => (
          <div key={i} className="cart cart-locked" aria-disabled>
            <span className="cart-grip" />
            <span className="cart-label">
              <span className="cart-art">?</span>
              <span className="cart-name">{label}</span>
            </span>
            <span className="cart-meta">Another game for the slop pile.</span>
          </div>
        ))}
      </div>
    </div>
  );
}
