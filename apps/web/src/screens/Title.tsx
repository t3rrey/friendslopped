import { useState } from 'react';
import { NAME_MAX } from '@friendslopped/shared';
import { connect, savedName, useNet } from '../net.ts';
import { Button, ChunkyText } from '../ui.tsx';

export function Title() {
  const status = useNet((s) => s.status);
  const [name, setName] = useState(savedName);
  const busy = status === 'connecting' || status === 'reconnecting';
  const ready = name.trim().length > 0;

  return (
    <div className="title-screen">
      <h1 className="logo">
        <ChunkyText text="FRIEND" className="logo-top" />
        <ChunkyText text="SLOPPED" className="logo-bottom" />
      </h1>
      <p className="logo-sub">a party games cartridge</p>
      <form
        className="title-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) connect(name.trim());
        }}
      >
        <label className="field">
          <span>Your name</span>
          <input
            autoFocus
            value={name}
            maxLength={NAME_MAX}
            placeholder="Mario? Luigi?"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button tone="red" size="lg" type="submit" sound="fanfare" disabled={!ready || busy} className="press-start">
          {busy ? 'Connecting…' : 'Press Start'}
        </Button>
      </form>
      <p className="title-foot">© 2026 FRIENDSLOPPED · Licensed by nobody</p>
    </div>
  );
}
