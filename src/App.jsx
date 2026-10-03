import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'kids-football-manager-v1';
const HALF_OPTIONS = [20, 25, 30, 40, 45];

const FORMATIONS = {
  5: {
    label: '5-a-side',
    positions: ['GK', 'DEF', 'MID', 'MID', 'ST'],
  },
  7: {
    label: '7-a-side',
    positions: ['GK', 'DEF', 'DEF', 'CM', 'LW', 'RW', 'ST'],
  },
  9: {
    label: '9-a-side',
    positions: ['GK', 'DEF', 'DEF', 'MID', 'MID', 'WING', 'WING', 'ST', 'ST'],
  },
  11: {
    label: '11-a-side',
    positions: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ST', 'ST'],
  },
};

const PLAYER_SEED = [
  { name: 'Ava', preferredPositions: ['GK', 'DEF'] },
  { name: 'Leo', preferredPositions: ['DEF', 'MID'] },
  { name: 'Mia', preferredPositions: ['MID', 'WING'] },
  { name: 'Noah', preferredPositions: ['ST', 'WING'] },
  { name: 'Olivia', preferredPositions: ['DEF', 'CM'] },
  { name: 'Ethan', preferredPositions: ['MID', 'ST'] },
  { name: 'Luna', preferredPositions: ['WING', 'ST'] },
  { name: 'Max', preferredPositions: ['MID', 'CM'] },
  { name: 'Ruby', preferredPositions: ['DEF', 'GK'] },
  { name: 'Jack', preferredPositions: ['MID', 'ST'] },
  { name: 'Zoe', preferredPositions: ['WING', 'DEF'] },
  { name: 'Sam', preferredPositions: ['CM', 'MID'] },
];

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createPlayer = (playerData) => ({
  id: createId(),
  name: playerData.name,
  preferredPositions: playerData.preferredPositions || [],
  currentPosition: 'Bench',
  secondsPlayed: 0,
  positionStats: {},
  positionHistory: [],
  isOnField: false,
});

const formatClock = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const makeDefaultPlayers = () => PLAYER_SEED.map((player) => createPlayer(player));

const clonePositionMap = (positionsMap) => {
  const next = {};
  Object.keys(positionsMap || {}).forEach((key) => {
    next[key] = positionsMap[key];
  });
  return next;
};

const assignPlayersToPitch = (players, format) => {
  const positions = FORMATIONS[format].positions;
  const nextPitch = {};

  players.forEach((player, index) => {
    const position = positions[index] || null;

    if (position) {
      nextPitch[position] = player.id;
      player.currentPosition = position;
      player.isOnField = true;
      if (!player.positionHistory.includes(position)) {
        player.positionHistory.push(position);
      }
      player.positionStats[position] = player.positionStats[position] || 0;
    } else {
      player.currentPosition = 'Bench';
      player.isOnField = false;
    }
  });

  return nextPitch;
};

const createMatchState = () => {
  const players = makeDefaultPlayers();
  const positionsMap = assignPlayersToPitch(players, 7);

  return {
    matchName: 'Match 1',
    format: 7,
    halfLength: 25,
    goalkeeperMode: 'fixed',
    currentHalf: 1,
    seconds: 0,
    isRunning: false,
    positionsMap,
    players,
    events: [],
  };
};

const loadSavedMatch = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createMatchState();
    return JSON.parse(raw);
  } catch {
    return createMatchState();
  }
};

const getMinutesInMatch = (matchState) => matchState.halfLength * 2 * 60;

const getSubSuggestion = (players, positionsMap) => {
  const onFieldIds = Object.values(positionsMap).filter(Boolean);
  const bench = players.filter((player) => !onFieldIds.includes(player.id));

  if (!bench.length || !onFieldIds.length) return null;

  const weakestOnField = [...players]
    .filter((player) => onFieldIds.includes(player.id))
    .sort((a, b) => a.secondsPlayed - b.secondsPlayed)[0];

  const bestIncoming = [...bench].sort((a, b) => {
    const aIsPreferred = weakestOnField
      ? a.preferredPositions.includes(weakestOnField.currentPosition)
      : false;
    const bIsPreferred = weakestOnField
      ? b.preferredPositions.includes(weakestOnField.currentPosition)
      : false;

    return Number(bIsPreferred) - Number(aIsPreferred) || a.secondsPlayed - b.secondsPlayed;
  })[0];

  if (!weakestOnField || !bestIncoming) return null;

  return {
    playerOutId: weakestOnField.id,
    playerInId: bestIncoming.id,
  };
};

export default function App() {
  const [match, setMatch] = useState(() => loadSavedMatch());
  const [playerName, setPlayerName] = useState('');
  const [preferredPos, setPreferredPos] = useState('MID');
  const [subOutId, setSubOutId] = useState('');
  const [subInId, setSubInId] = useState('');

  const positions = FORMATIONS[match.format].positions;

  useEffect(() => {
    if (!match.isRunning) return undefined;

    const timer = setInterval(() => {
      setMatch((prev) => {
        const nextSeconds = prev.seconds + 1;
        const maxSeconds = getMinutesInMatch(prev);

        if (nextSeconds >= maxSeconds) {
          return {
            ...prev,
            seconds: maxSeconds,
            isRunning: false,
            currentHalf: 2,
            events: [
              ...prev.events,
              {
                id: createId(),
                type: 'match-end',
                time: maxSeconds,
                summary: 'Full time',
              },
            ],
          };
        }

        const nextHalf = nextSeconds >= prev.halfLength * 60 ? 2 : 1;

        const updatedPlayers = prev.players.map((player) => {
          const onField = Object.values(prev.positionsMap).includes(player.id);
          if (!onField) return player;

          return {
            ...player,
            secondsPlayed: player.secondsPlayed + 1,
            positionStats: {
              ...player.positionStats,
              [player.currentPosition]:
                (player.positionStats[player.currentPosition] || 0) + 1,
            },
          };
        });

        return {
          ...prev,
          seconds: nextSeconds,
          currentHalf: nextHalf,
          players: updatedPlayers,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [match.isRunning]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(match));
  }, [match]);

  const suggestion = useMemo(
    () => getSubSuggestion(match.players, match.positionsMap),
    [match.players, match.positionsMap]
  );

  const onFieldPlayers = useMemo(
    () => match.players.filter((player) => Object.values(match.positionsMap).includes(player.id)),
    [match.players, match.positionsMap]
  );

  const handleFormatChange = (nextFormat) => {
    setMatch((prev) => {
      const players = prev.players.map((player) => ({
        ...player,
        currentPosition: 'Bench',
        isOnField: false,
      }));

      const nextPitch = assignPlayersToPitch(players, nextFormat);

      return {
        ...prev,
        format: nextFormat,
        positionsMap: nextPitch,
        players,
        events: [
          ...prev.events,
          {
            id: createId(),
            type: 'format-change',
            time: prev.seconds,
            summary: `Format changed to ${FORMATIONS[nextFormat].label}`,
          },
        ],
      };
    });
  };

  const handleAddPlayer = () => {
    if (!playerName.trim()) return;

    setMatch((prev) => {
      const newPlayer = createPlayer({
        name: playerName.trim(),
        preferredPositions: [preferredPos],
      });

      const updatedPlayers = [...prev.players, newPlayer];
      const nextPitch = clonePositionMap(prev.positionsMap);
      const firstEmptyPosition = positions.find(
        (position) => !Object.values(nextPitch).includes(newPlayer.id)
      );

      if (firstEmptyPosition && Object.keys(nextPitch).length < positions.length) {
        nextPitch[firstEmptyPosition] = newPlayer.id;
        newPlayer.currentPosition = firstEmptyPosition;
        newPlayer.isOnField = true;
        newPlayer.positionStats[firstEmptyPosition] = 0;
        if (!newPlayer.positionHistory.includes(firstEmptyPosition)) {
          newPlayer.positionHistory.push(firstEmptyPosition);
        }
      }

      return {
        ...prev,
        players: updatedPlayers,
        positionsMap: nextPitch,
        events: [
          ...prev.events,
          {
            id: createId(),
            type: 'player-added',
            time: prev.seconds,
            summary: `${newPlayer.name} added to squad`,
          },
        ],
      };
    });

    setPlayerName('');
  };

  const handleMovePlayer = (playerId, newPosition) => {
    setMatch((prev) => {
      const previousMap = clonePositionMap(prev.positionsMap);
      const currentSlot = Object.keys(previousMap).find((key) => previousMap[key] === playerId);

      if (currentSlot) {
        delete previousMap[currentSlot];
      }

      previousMap[newPosition] = playerId;

      const players = prev.players.map((player) => {
        if (player.id !== playerId) return player;

        const nextStats = {
          ...player.positionStats,
          [newPosition]: player.positionStats[newPosition] || 0,
        };

        return {
          ...player,
          currentPosition: newPosition,
          isOnField: true,
          positionStats: nextStats,
          positionHistory: player.positionHistory.includes(newPosition)
            ? player.positionHistory
            : [...player.positionHistory, newPosition],
        };
      });

      return {
        ...prev,
        players,
        positionsMap: previousMap,
        events: [
          ...prev.events,
          {
            id: createId(),
            type: 'position-change',
            time: prev.seconds,
            summary: `${players.find((player) => player.id === playerId)?.name || 'Player'} moved to ${newPosition}`,
          },
        ],
      };
    });
  };

  const handleSubstitute = () => {
    if (!subOutId || !subInId || subOutId === subInId) return;

    setMatch((prev) => {
      const positionsMap = clonePositionMap(prev.positionsMap);
      const outPosition = Object.keys(positionsMap).find((key) => positionsMap[key] === subOutId);
      const incomingPlayer = prev.players.find((player) => player.id === subInId);

      if (!outPosition || !incomingPlayer) return prev;

      const outgoingPlayer = prev.players.find((player) => player.id === subOutId);

      delete positionsMap[outPosition];
      positionsMap[outPosition] = incomingPlayer.id;

      const players = prev.players.map((player) => {
        if (player.id === subOutId) {
          return {
            ...player,
            currentPosition: 'Bench',
            isOnField: false,
          };
        }

        if (player.id === subInId) {
          return {
            ...player,
            currentPosition: outPosition,
            isOnField: true,
            positionStats: {
              ...player.positionStats,
              [outPosition]: player.positionStats[outPosition] || 0,
            },
            positionHistory: player.positionHistory.includes(outPosition)
              ? player.positionHistory
              : [...player.positionHistory, outPosition],
          };
        }

        return player;
      });

      return {
        ...prev,
        players,
        positionsMap,
        events: [
          ...prev.events,
          {
            id: createId(),
            type: 'substitution',
            time: prev.seconds,
            summary: `${outgoingPlayer?.name || 'Player'} replaced by ${incomingPlayer.name} at ${outPosition}`,
          },
        ],
      };
    });

    setSubOutId('');
    setSubInId('');
  };

  const handleSuggestedSub = () => {
    if (!suggestion) return;
    setSubOutId(suggestion.playerOutId);
    setSubInId(suggestion.playerInId);
  };

  const handleReset = () => {
    setMatch(createMatchState());
    setSubOutId('');
    setSubInId('');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Kids football manager</p>
          <h1>Match control panel</h1>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={handleReset}>
            Reset match
          </button>
          <button onClick={() => setMatch((prev) => ({ ...prev, isRunning: !prev.isRunning }))}>
            {match.isRunning ? 'Pause match' : 'Start match'}
          </button>
        </div>
      </header>

      <div className="settings-row">
        <label>
          Match name
          <input
            value={match.matchName}
            onChange={(event) => setMatch((prev) => ({ ...prev, matchName: event.target.value }))}
          />
        </label>

        <label>
          Format
          <select value={match.format} onChange={(event) => handleFormatChange(Number(event.target.value))}>
            {Object.entries(FORMATIONS).map(([value, config]) => (
              <option key={value} value={value}>
                {config.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Half length
          <select
            value={match.halfLength}
            onChange={(event) =>
              setMatch((prev) => ({
                ...prev,
                halfLength: Number(event.target.value),
                seconds: 0,
                currentHalf: 1,
              }))
            }
          >
            {HALF_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} mins
              </option>
            ))}
          </select>
        </label>

        <label>
          Goalkeeper mode
          <select
            value={match.goalkeeperMode}
            onChange={(event) =>
              setMatch((prev) => ({ ...prev, goalkeeperMode: event.target.value }))
            }
          >
            <option value="fixed">Fixed GK</option>
            <option value="flexible">Flexible GK</option>
          </select>
        </label>
      </div>

      <div className="content-grid">
        <aside className="panel left-panel">
          <h3>Squad</h3>

          <div className="add-player">
            <input
              value={playerName}
              placeholder="Add player"
              onChange={(event) => setPlayerName(event.target.value)}
            />
            <select value={preferredPos} onChange={(event) => setPreferredPos(event.target.value)}>
              {['GK', 'DEF', 'MID', 'CM', 'WING', 'LW', 'RW', 'ST'].map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
            <button onClick={handleAddPlayer}>Add</button>
          </div>

          <div className="player-list">
            {match.players.map((player) => (
              <div key={player.id} className="player-row">
                <div>
                  <strong>{player.name}</strong>
                  <small>{player.currentPosition}</small>
                </div>
                <div className="metrics">
                  <span>{formatClock(player.secondsPlayed)} mins</span>
                  <button className="inline" onClick={() => handleMovePlayer(player.id, player.currentPosition)}>
                    Move
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="panel center-panel">
          <div className="match-header">
            <div>
              <p className="eyebrow">Live match</p>
              <h2>{match.matchName}</h2>
            </div>
            <div className="timer-box">
              <span>Half {match.currentHalf}</span>
              <strong>{formatClock(match.seconds)}</strong>
            </div>
          </div>

          <div className="pitch-grid">
            {positions.map((position) => {
              const playerId = match.positionsMap[position];
              const player = match.players.find((item) => item.id === playerId);

              return (
                <div key={position} className="pitch-slot">
                  <span className="slot-label">{position}</span>

                  <div className="slot-player">
                    {player ? (
                      <>
                        <strong>{player.name}</strong>
                        <small>{formatClock(player.secondsPlayed)} mins</small>
                      </>
                    ) : (
                      <small>Empty</small>
                    )}
                  </div>

                  {player && (
                    <select
                      value={player.currentPosition}
                      onChange={(event) => handleMovePlayer(player.id, event.target.value)}
                    >
                      {positions.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sub-panel">
            <h3>Substitution controls</h3>

            <div className="sub-row">
              <label>
                Player out
                <select value={subOutId} onChange={(event) => setSubOutId(event.target.value)}>
                  <option value="">Select</option>
                  {onFieldPlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Player in
                <select value={subInId} onChange={(event) => setSubInId(event.target.value)}>
                  <option value="">Select</option>
                  {match.players
                    .filter((player) => !Object.values(match.positionsMap).includes(player.id))
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                </select>
              </label>

              <button onClick={handleSubstitute}>Confirm sub</button>
            </div>

            {suggestion && (
              <div className="suggestion-box">
                <strong>Suggested rotation:</strong>
                <span>
                  {match.players.find((player) => player.id === suggestion.playerOutId)?.name} for{' '}
                  {match.players.find((player) => player.id === suggestion.playerInId)?.name}
                </span>
                <button className="secondary" onClick={handleSuggestedSub}>
                  Use suggestion
                </button>
              </div>
            )}
          </div>
        </main>

        <aside className="panel right-panel">
          <h3>Match dashboard</h3>

          <div className="summary-card">
            <span>Minutes played</span>
            <strong>{formatClock(match.seconds)}</strong>
          </div>

          <div className="summary-card">
            <span>Players on pitch</span>
            <strong>{onFieldPlayers.length}</strong>
          </div>

          <h4>Player stats</h4>
          <div className="stats-list">
            {match.players.map((player) => (
              <div key={player.id} className="player-stat-row">
                <div>
                  <strong>{player.name}</strong>
                  <small>{player.currentPosition}</small>
                </div>
                <span>{formatClock(player.secondsPlayed)} mins</span>
              </div>
            ))}
          </div>

          <h4>Match log</h4>
          <div className="event-list">
            {match.events.slice().reverse().map((event) => (
              <div key={event.id} className="event-item">
                <span>{formatClock(event.time)}</span>
                <strong>{event.summary}</strong>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}