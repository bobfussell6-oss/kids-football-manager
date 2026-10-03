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

const clonePositionMap = (positionsMap) => {
  const next = {};
  Object.keys(positionsMap || {}).forEach((key) => {
    next[key] = positionsMap[key];
  });
  return next;
};

const makeDefaultPlayers = () =>
  PLAYER_SEED.map((player) => createPlayer(player));

const assignPlayersToPitch = (players, format) => {
  const positions = FORMATIONS[format].positions;
  const nextPitch = {};
  players.forEach((player, index) => {
    const position = positions[index] || null;
    if (position) {
      nextPitch[position] = player.id;
      player.currentPosition = position;
      player.isOnField = true;
      player.positionStats[position] = player.positionStats[position] || 0;
      if (!player.positionHistory.includes(position)) {
        player.positionHistory.push(position);
      }
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
    lastSavedAt: new Date().toISOString(),
  };
};

const loadSavedMatch = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createMatchState();
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    return createMatchState();
  }
};

const formatClock = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getMinutesInMatch = (matchState) => matchState.halfLength * 2 * 60;

const getSubSuggestion = (players, positionsMap, format) => {
  const onFieldIds = Object.values(positionsMap).filter(Boolean);
  const benchPlayers = players.filter((player) => !onFieldIds.includes(player.id));
  if (!benchPlayers.length) {
    return null;
  }

  const weakestOnField = [...players]
    .filter((player) => onFieldIds.includes(player.id))
    .sort((a, b) => a.secondsPlayed - b.secondsPlayed)[0];

  const bestIncoming = [...benchPlayers].sort((a, b) => {
    const aPref = a.preferredPositions.includes(weakestOnField?.currentPosition || '') ? 1 : 0;
    const bPref = b.preferredPositions.includes(weakestOnField?.currentPosition || '') ? 1 : 0;
    return b.secondsPlayed - a.secondsPlayed + (bPref - aPref);
  })[0];

  if (!weakestOnField || !bestIncoming) {
    return null;
  }

  return {
    playerOutId: weakestOnField.id,
    playerInId: bestIncoming.id,
  };
};

export default function App() {
  const [match, setMatch] = useState(() => loadSavedMatch());
  const [playerName, setPlayerName] = useState('');
  const [newPlayerPreferred, setNewPlayerPreferred] = useState('MID');
  const [subOutId, setSubOutId] = useState('');
  const [subInId, setSubInId] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');

  const currentPositions = useMemo(
    () => FORMATIONS[match.format].positions,
    [match.format]
  );

  useEffect(() => {
    if (!match.isRunning) return undefined;

    const interval = setInterval(() => {
      setMatch((previous) => {
        const nextSeconds = previous.seconds + 1;
        const totalMinutes = getMinutesInMatch(previous);

        if (nextSeconds >= totalMinutes) {
          return {
            ...previous,
            seconds: totalMinutes,
            isRunning: false,
            currentHalf: 2,
            events: [
              ...previous.events,
              {
                id: createId(),
                type: 'match-end',
                time: totalMinutes,
                summary: 'Full time',
              },
            ],
          };
        }

        const nextHalf = nextSeconds >= previous.halfLength * 60 ? 2 : 1;

        const updatedPlayers = previous.players.map((player) => {
          const isOnField = Object.values(previous.positionsMap).includes(player.id);
          if (!isOnField) return player;

          const currentPosition = player.currentPosition;
          const nextPositionStats = {
            ...player.positionStats,
            [currentPosition]: (player.positionStats[currentPosition] || 0) + 1,
          };

          return {
            ...player,
            secondsPlayed: player.secondsPlayed + 1,
            positionStats: nextPositionStats,
          };
        });

        return {
          ...previous,
          seconds: nextSeconds,
          currentHalf: nextHalf,
          players: updatedPlayers,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [match.isRunning]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(match));
  }, [match]);

  const suggestion = useMemo(
    () => getSubSuggestion(match.players, match.positionsMap, match.format),
    [match.players, match.positionsMap, match.format]
  );

  const onFieldPlayers = useMemo(
    () =>
      match.players.filter((player) => Object.values(match.positionsMap).includes(player.id)),
    [match.players, match.positionsMap]
  );

  const handleFormatChange = (nextFormat) => {
    setMatch((previous) => {
      const players = previous.players.map((player) => ({
        ...player,
        currentPosition: 'Bench',
        isOnField: false,
      }));

      const nextPitch = assignPlayersToPitch(players, nextFormat);

      return {
        ...previous,
        format: nextFormat,
        positionsMap: nextPitch,
        players,
        events: [
          ...previous.events,
          {
            id: createId(),
            type: 'format-change',
            time: previous.seconds,
            summary: `Format changed to ${FORMATIONS[nextFormat].label}`,
          },
        ],
      };
    });
  };

  const handleAddPlayer = () => {
    if (!playerName.trim()) return;

    setMatch((previous) => {
      const newPlayer = createPlayer({
        name: playerName.trim(),
        preferredPositions: [newPlayerPreferred],
      });

      const updatedPlayers = [...previous.players, newPlayer];
      const nextPitch = clonePositionMap(previous.positionsMap);

      const firstEmptyPosition = currentPositions.find(
        (position) => !Object.values(nextPitch).includes(newPlayer.id)
      );

      if (firstEmptyPosition && Object.keys(nextPitch).length < currentPositions.length) {
        nextPitch[firstEmptyPosition] = newPlayer.id;
        newPlayer.currentPosition = firstEmptyPosition;
        newPlayer.isOnField = true;
        newPlayer.positionStats[firstEmptyPosition] = 0;
        if (!newPlayer.positionHistory.includes(firstEmptyPosition)) {
          newPlayer.positionHistory.push(firstEmptyPosition);
        }
      }

      return {
        ...previous,
        players: updatedPlayers,
        positionsMap: nextPitch,
        events: [
          ...previous.events,
          {
            id: createId(),
            type: 'player-added',
            time: previous.seconds,
            summary: `${newPlayer.name} added to squad`,
          },
        ],
      };
    });

    setPlayerName('');
  };

  const handleMovePlayer = (playerId, newPosition) => {
    setMatch((previous) => {
      const previousMap = clonePositionMap(previous.positionsMap);
      const currentKey = Object.keys(previousMap).find((key) => previousMap[key] === playerId);

      if (currentKey) {
        delete previousMap[currentKey];
      }

      previousMap[newPosition] = playerId;

      const players = previous.players.map((player) => {
        if (player.id !== playerId) return player;

        const positionStats = { ...player.positionStats };
        positionStats[newPosition] = positionStats[newPosition] || 0;

        return {
          ...player,
          currentPosition: newPosition,
          isOnField: true,
          positionStats,
          positionHistory: player.positionHistory.includes(newPosition)
            ? player.positionHistory
            : [...player.positionHistory, newPosition],
        };
      });

      return {
        ...previous,
        players,
        positionsMap: previousMap,
        events: [
          ...previous.events,
          {
            id: createId(),
            type: 'position-change',
            time: previous.seconds,
            summary: `${players.find((player) => player.id === playerId)?.name || 'Player'} moved to ${newPosition}`,
          },
        ],
      };
    });
  };

  const handleSubstitute = () => {
    if (!subOutId || !subInId || subOutId === subInId) return;

    setMatch((previous) => {
      const positionsMap = clonePositionMap(previous.positionsMap);
      const outPosition = Object.keys(positionsMap).find((key) => positionsMap[key] === subOutId);
      const inPlayer = previous.players.find((player) => player.id === subInId);

      if (!outPosition || !inPlayer) return previous;

      const outPlayer = previous.players.find((player) => player.id === subOutId);

      delete positionsMap[outPosition];
      positionsMap[outPosition] = inPlayer.id;

      const players = previous.players.map((player) => {
        if (player.id === subOutId) {
          return {
            ...player,
            currentPosition: 'Bench',
            isOnField: false,
          };
        }

        if (player.id === subInId) {
          const nextStats = {
            ...player.positionStats,
            [outPosition]: player.positionStats[outPosition] || 0,
          };

          return {
            ...player,
            currentPosition: outPosition,
            isOnField: true,
            positionStats: nextStats,
            positionHistory: player.positionHistory.includes(outPosition)
              ? player.positionHistory
              : [...player.positionHistory, outPosition],
          };
        }

        return player;
      });

      return {
        ...previous,
        players,
        positionsMap,
        events: [
          ...previous.events,
          {
            id: createId(),
            type: 'substitution',
            time: previous.seconds,
            summary: `${outPlayer?.name || 'Player out'} replaced by ${inPlayer.name} at ${outPosition}`,
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
    const freshMatch = createMatchState();
    setMatch(freshMatch);
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
          <button className="secondary" onClick={handleReset}>Reset match</button>
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
          <select
            value={match.format}
            onChange={(event) => handleFormatChange(Number(event.target.value))}
          >
            {Object.entries(FORMATIONS).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
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
              <option key={minutes} value={minutes}>{minutes} mins</option>
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
            <select value={newPlayerPreferred} onChange={(event) => setNewPlayerPreferred(event.target.value)}>
              {['GK', 'DEF', 'MID', 'CM', 'WING', 'LW', 'RW', 'ST'].map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
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
                  <button
                    className="inline"
                    onClick={() => setSelectedPosition(player.currentPosition)}
                  >
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
            {currentPositions.map((position) => {
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
                      {currentPositions.map((pos) => (
                        <option key={pos} value={pos}>{pos}</option>
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
                    <option key={player.id} value={player.id}>{player.name}</option>
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
                      <option key={player.id} value={player.id}>{player.name}</option>
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
                <button className="secondary" onClick={handleSuggestedSub}>Use suggestion</button>
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
