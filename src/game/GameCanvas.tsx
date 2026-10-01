import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import buttonTextureUrl from "../assets/game/button-texture.png";
import GameScene, {
  type GameMode,
  type GameSnapshot,
  type RoundCount,
  type SpeedLevel,
} from "./GameScene";
import { ASYQ_LAYOUTS, getAsyqLayout, type LayoutPoint } from "./layouts";
import {
  getPieceTheme,
  isPieceStyle,
  PIECE_THEMES,
  type PieceStyle,
} from "./themes";

const PLAYER_ONE_COOKIE = "asyq_player_one";
const PLAYER_TWO_COOKIE = "asyq_player_two";
const NICKNAME_MAX_LENGTH = 18;
const INFINITE_LEADERBOARD_KEY = "asyq_infinite_leaderboard";
const PVP_LEADERBOARD_KEY = "asyq_pvp_leaderboard";
const ASYQ_STYLE_COOKIE = "asyq_piece_style";
const SAQA_STYLE_COOKIE = "asyq_saqa_style";

type LeaderboardEntry = {
  name: string;
  value: number;
};

function readCookie(name: string) {
  const prefix = `${name}=`;
  const value = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);

  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function readStyleCookie(name: string): PieceStyle {
  const value = readCookie(name);
  return isPieceStyle(value) ? value : "classic";
}

function readLeaderboard(key: string): LeaderboardEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is LeaderboardEntry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as LeaderboardEntry).name === "string" &&
          typeof (entry as LeaderboardEntry).value === "number",
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

function saveLeaderboard(key: string, entries: LeaderboardEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // The game still works when private browsing blocks persistent storage.
  }
}

function sortLeaderboard(entries: LeaderboardEntry[]) {
  return [...entries]
    .sort(
      (first, second) =>
        second.value - first.value || first.name.localeCompare(second.name),
    )
    .slice(0, 5);
}

function recordBest(entries: LeaderboardEntry[], name: string, value: number) {
  const normalizedName = name.trim().toLocaleLowerCase();
  const existing = entries.find(
    (entry) => entry.name.trim().toLocaleLowerCase() === normalizedName,
  );
  if (existing && existing.value >= value) return entries;

  return sortLeaderboard([
    ...entries.filter(
      (entry) => entry.name.trim().toLocaleLowerCase() !== normalizedName,
    ),
    { name, value },
  ]);
}

function recordWin(entries: LeaderboardEntry[], name: string) {
  const normalizedName = name.trim().toLocaleLowerCase();
  const existing = entries.find(
    (entry) => entry.name.trim().toLocaleLowerCase() === normalizedName,
  );

  return sortLeaderboard([
    ...entries.filter(
      (entry) => entry.name.trim().toLocaleLowerCase() !== normalizedName,
    ),
    { name, value: (existing?.value ?? 0) + 1 },
  ]);
}

const initialSnapshot: GameSnapshot = {
  status: "ready",
  power: 0,
  activePlayer: 0,
  scores: [0, 0],
  remaining: 7,
  roundNumber: 1,
  roundCount: 1,
  roundWins: [0, 0],
  gameMode: "computer",
  speedLevel: "medium",
  layoutId: "line",
  asyqStyle: "classic",
  saqaStyle: "classic",
};

function PlayerIcon({ pair = false }: { pair?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {pair && (
        <>
          <circle cx="33" cy="15" r="6" />
          <path d="M24 36c.5-7 4.2-11 9-11 4.9 0 8.6 4 9 11Z" />
        </>
      )}
      <circle cx={pair ? 18 : 24} cy="15" r="7" />
      <path
        d={
          pair
            ? "M7 38c.5-8.5 4.7-13 11-13s10.5 4.5 11 13Z"
            : "M11 39c.7-9.2 5.7-14 13-14s12.3 4.8 13 14Z"
        }
      />
    </svg>
  );
}

function ComputerIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="7" y="8" width="34" height="25" rx="4" />
      <path d="M18 39h12M24 33v6" />
      <circle cx="18" cy="20" r="2.2" className="icon-eye" />
      <circle cx="30" cy="20" r="2.2" className="icon-eye" />
      <path d="M18 26h12" />
    </svg>
  );
}

function SpeedometerIcon({ level }: { level: SpeedLevel }) {
  const needle = {
    easy: { x: 17, y: 26 },
    medium: { x: 24, y: 18 },
    hard: { x: 33, y: 24 },
  }[level];

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 34a16 16 0 0 1 32 0" />
      <path d="M11 34h26" />
      <path d="M13 27l-3-2M18 21l-2-3M24 19v-4M30 21l2-3M35 27l3-2" />
      <path d={`M24 34L${needle.x} ${needle.y}`} className="speed-needle" />
      <circle cx="24" cy="34" r="2.7" className="speed-hub" />
    </svg>
  );
}

function RoundNumberIcon({ count }: { count: number }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12 9h24M12 39h24" />
      <text x="24" y="33" textAnchor="middle" className="round-number-glyph">
        {count}
      </text>
    </svg>
  );
}

function InfinityIcon() {
  return (
    <svg className="infinity-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 24c-4.8-7.2-8-10-12-10-5 0-8 4.1-8 10s3 10 8 10c4 0 7.2-2.8 12-10 4.8-7.2 8-10 12-10 5 0 8 4.1 8 10s-3 10-8 10c-4 0-7.2-2.8-12-10Z" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M38 18V8l-5 5a16 16 0 1 0 5.5 12" />
      <path d="M38 8H28" />
    </svg>
  );
}

function FormationIcon({ points }: { points: readonly LayoutPoint[] }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {points.map((point, index) => (
        <circle
          key={index}
          cx={24 + (point.x - 480) * 0.105}
          cy={24 + (point.y - 480) * 0.105}
          r="2.2"
        />
      ))}
    </svg>
  );
}

function Score({
  name,
  score,
  active,
  position,
  editable,
  iconUrl,
  onNameChange,
}: {
  name: string;
  score: number;
  active: boolean;
  position: "top" | "bottom";
  editable: boolean;
  iconUrl: string;
  onNameChange?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const commitName = () => {
    const nextName = draft.trim().replace(/\s+/g, " ");
    setEditing(false);
    setDraft(nextName || name);
    if (nextName && nextName !== name) onNameChange?.(nextName);
  };

  return (
    <div
      className={`score score--${position}${active ? " score--active" : ""}`}
    >
      {editing && editable ? (
        <input
          className="score-name score-name-input"
          type="text"
          value={draft}
          maxLength={NICKNAME_MAX_LENGTH}
          aria-label={`Ник: ${name}`}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(name);
              setEditing(false);
            }
          }}
        />
      ) : editable ? (
        <button
          className="score-name score-name--editable"
          type="button"
          aria-label={`Изменить ник ${name}`}
          title="Нажмите, чтобы изменить ник"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          {name}
        </button>
      ) : (
        <span className="score-name">{name}</span>
      )}
      <img className="asyq-icon" src={iconUrl} alt="" aria-hidden="true" />
      <strong>{score}</strong>
    </div>
  );
}

function AppearanceSection({
  asyqStyle,
  saqaStyle,
  onAsyqStyleChange,
  onSaqaStyleChange,
}: {
  asyqStyle: PieceStyle;
  saqaStyle: PieceStyle;
  onAsyqStyleChange: (style: PieceStyle) => void;
  onSaqaStyleChange: (style: PieceStyle) => void;
}) {
  return (
    <section
      className="leaderboard-card appearance-card"
      aria-labelledby="appearance-title"
      style={{ backgroundImage: `url(${buttonTextureUrl})` }}
    >
      <header>
        <h2 id="appearance-title">Оформление</h2>
        <p>Асыки и сақа выбираются отдельно</p>
      </header>
      <div className="appearance-groups">
        <div className="appearance-row">
          <span className="appearance-label">Асыки</span>
          <div className="appearance-options" role="group" aria-label="Оформление асыков">
            {PIECE_THEMES.map((theme) => {
              const selected = theme.id === asyqStyle;
              return (
                <button
                  key={theme.id}
                  className={`appearance-choice${selected ? " is-selected" : ""}`}
                  type="button"
                  aria-label={`Асыки: ${theme.name}`}
                  aria-pressed={selected}
                  title={theme.name}
                  style={{ backgroundImage: `url(${buttonTextureUrl})` }}
                  onClick={() => onAsyqStyleChange(theme.id)}
                >
                  <span className="appearance-preview appearance-preview--asyqs" aria-hidden="true">
                    {theme.asyqs.map((url, index) => (
                      <img key={url} src={url} alt="" style={{ zIndex: index + 1 }} />
                    ))}
                  </span>
                  <span>{theme.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="appearance-row">
          <span className="appearance-label">Сақа</span>
          <div className="appearance-options" role="group" aria-label="Оформление сақа">
            {PIECE_THEMES.map((theme) => {
              const selected = theme.id === saqaStyle;
              return (
                <button
                  key={theme.id}
                  className={`appearance-choice${selected ? " is-selected" : ""}`}
                  type="button"
                  aria-label={`Сақа: ${theme.name}`}
                  aria-pressed={selected}
                  title={theme.name}
                  style={{ backgroundImage: `url(${buttonTextureUrl})` }}
                  onClick={() => onSaqaStyleChange(theme.id)}
                >
                  <span className="appearance-preview appearance-preview--saqa" aria-hidden="true">
                    <img src={theme.saqa} alt="" />
                  </span>
                  <span>{theme.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeaderboardSection({
  title,
  subtitle,
  entries,
  unit,
}: {
  title: string;
  subtitle: string;
  entries: LeaderboardEntry[];
  unit: string;
}) {
  return (
    <section
      className="leaderboard-card"
      aria-label={`${title}: ${subtitle}`}
      style={{ backgroundImage: `url(${buttonTextureUrl})` }}
    >
      <header>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>
      {entries.length === 0 ? (
        <p className="leaderboard-empty">Пока нет результатов</p>
      ) : (
        <ol className="leaderboard-list">
          {entries.map((entry) => (
            <li key={entry.name.toLocaleLowerCase()}>
              <span>{entry.name}</span>
              <strong>
                {entry.value} {unit}
              </strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function GameCanvas() {
  const gameCardRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => ({
    ...initialSnapshot,
    asyqStyle: readStyleCookie(ASYQ_STYLE_COOKIE),
    saqaStyle: readStyleCookie(SAQA_STYLE_COOKIE),
  }));
  const initialStylesRef = useRef({
    asyqStyle: snapshot.asyqStyle,
    saqaStyle: snapshot.saqaStyle,
  });
  const [playerOneName, setPlayerOneName] = useState(
    () => readCookie(PLAYER_ONE_COOKIE) || "Игрок 1",
  );
  const [playerTwoName, setPlayerTwoName] = useState(
    () => readCookie(PLAYER_TWO_COOKIE) || "Игрок 2",
  );
  const [infiniteLeaderboard, setInfiniteLeaderboard] = useState(() =>
    readLeaderboard(INFINITE_LEADERBOARD_KEY),
  );
  const [pvpLeaderboard, setPvpLeaderboard] = useState(() =>
    readLeaderboard(PVP_LEADERBOARD_KEY),
  );
  const playerNamesRef = useRef({ one: playerOneName, two: playerTwoName });
  const opponentName =
    snapshot.gameMode === "computer" ? "Компьютер" : playerTwoName;
  const playerName = playerOneName;
  const roundResult =
    snapshot.scores[0] === snapshot.scores[1]
      ? "Ничья"
      : snapshot.scores[0] > snapshot.scores[1]
        ? `Победил ${playerName}`
        : `Победил ${opponentName}`;
  const matchWinner =
    snapshot.roundWins[0] === snapshot.roundWins[1]
      ? "Ничья"
      : snapshot.roundWins[0] > snapshot.roundWins[1]
        ? `Победил ${playerName}`
        : `Победил ${opponentName}`;
  const roundIsOver = snapshot.status === "roundover";
  const matchIsOver = snapshot.status === "gameover";
  const currentLayout = getAsyqLayout(snapshot.layoutId);
  const currentLayoutIndex = ASYQ_LAYOUTS.findIndex(
    (layout) => layout.id === currentLayout.id,
  );
  const nextLayout =
    ASYQ_LAYOUTS[(currentLayoutIndex + 1) % ASYQ_LAYOUTS.length];
  const scoreIconUrl = getPieceTheme(snapshot.asyqStyle).asyqs[0];

  useEffect(() => {
    playerNamesRef.current = { one: playerOneName, two: playerTwoName };
  }, [playerOneName, playerTwoName]);

  useEffect(() => {
    if (!containerRef.current) return;

    let previousSnapshot = initialSnapshot;
    const scene = new GameScene((nextSnapshot) => {
      setSnapshot(nextSnapshot);

      if (
        nextSnapshot.gameMode === "computer" &&
        nextSnapshot.roundCount === "infinite" &&
        nextSnapshot.roundNumber > previousSnapshot.roundNumber
      ) {
        const completedRounds = nextSnapshot.roundNumber - 1;
        setInfiniteLeaderboard((entries) =>
          recordBest(entries, playerNamesRef.current.one, completedRounds),
        );
      }

      if (
        nextSnapshot.gameMode === "players" &&
        nextSnapshot.status === "gameover" &&
        previousSnapshot.status !== "gameover" &&
        nextSnapshot.roundWins[0] !== nextSnapshot.roundWins[1]
      ) {
        const winnerName =
          nextSnapshot.roundWins[0] > nextSnapshot.roundWins[1]
            ? playerNamesRef.current.one
            : playerNamesRef.current.two;
        setPvpLeaderboard((entries) => recordWin(entries, winnerName));
      }

      previousSnapshot = nextSnapshot;
    }, initialStylesRef.current);
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 960,
      height: 960,
      backgroundColor: "#293e4b",
      scene,
      physics: {
        default: "matter",
        matter: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, roundPixels: true },
      input: { activePointers: 2 },
    });

    const focusGame = () => {
      gameCardRef.current?.focus({ preventScroll: true });
      gameCardRef.current?.scrollIntoView({ block: "start" });
    };
    const focusFrame = window.requestAnimationFrame(focusGame);
    const focusTimer = window.setTimeout(focusGame, 180);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.clearTimeout(focusTimer);
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    saveLeaderboard(INFINITE_LEADERBOARD_KEY, infiniteLeaderboard);
  }, [infiniteLeaderboard]);

  useEffect(() => {
    saveLeaderboard(PVP_LEADERBOARD_KEY, pvpLeaderboard);
  }, [pvpLeaderboard]);

  useEffect(() => {
    if (!matchIsOver) return;

    const restartTimer = window.setTimeout(() => {
      sceneRef.current?.resetRound();
    }, 5000);

    return () => window.clearTimeout(restartTimer);
  }, [matchIsOver]);

  return (
    <section
      ref={gameCardRef}
      className="game-card"
      aria-label="Игровое поле Асық ату"
      tabIndex={-1}
    >
      <header className="game-header">
        <h1>Асық ату</h1>
      </header>
      <div className="game-stage">
        <div className="canvas-shell" ref={containerRef} />
        <Score
          key={`opponent-${snapshot.gameMode}`}
          name={opponentName}
          score={snapshot.scores[1]}
          active={snapshot.activePlayer === 1 && !roundIsOver && !matchIsOver}
          position="top"
          editable={snapshot.gameMode === "players"}
          iconUrl={scoreIconUrl}
          onNameChange={(name) => {
            setPlayerTwoName(name);
            writeCookie(PLAYER_TWO_COOKIE, name);
          }}
        />
        <Score
          name={playerName}
          score={snapshot.scores[0]}
          active={snapshot.activePlayer === 0 && !roundIsOver && !matchIsOver}
          position="bottom"
          editable
          iconUrl={scoreIconUrl}
          onNameChange={(name) => {
            setPlayerOneName(name);
            writeCookie(PLAYER_ONE_COOKIE, name);
          }}
        />

        <button
          className="game-reset"
          type="button"
          aria-label="Новая игра"
          title="Новая игра"
          style={{ backgroundImage: `url(${buttonTextureUrl})` }}
          onClick={() => sceneRef.current?.resetRound()}
        >
          <RestartIcon />
        </button>

        <div
          className={`round-progress${snapshot.roundCount === "infinite" ? " round-progress--infinite" : ""}`}
          aria-label={
            snapshot.roundCount === "infinite"
              ? "Бесконечный режим"
              : `Раунд ${snapshot.roundNumber} из ${snapshot.roundCount}`
          }
        >
          {snapshot.roundCount === "infinite" ? (
            <InfinityIcon />
          ) : (
            Array.from({ length: snapshot.roundCount }, (_, index) => (
              <span
                key={index}
                className={
                  index + 1 === snapshot.roundNumber ? "is-current" : ""
                }
                aria-hidden="true"
              />
            ))
          )}
        </div>

        {(roundIsOver || matchIsOver) && (
          <div
            className="game-over"
            role="status"
            style={{ backgroundImage: `url(${buttonTextureUrl})` }}
          >
            {roundIsOver ? (
              <>
                <span>
                  {snapshot.roundCount === "infinite"
                    ? "Раунд завершён"
                    : `Раунд ${snapshot.roundNumber} завершён`}
                </span>
                <strong>{roundResult}</strong>
                <p>Следующий раунд</p>
              </>
            ) : (
              <>
                <span>Матч завершён</span>
                <strong>{matchWinner}</strong>
                <p>
                  Раунды {snapshot.roundWins[0]} : {snapshot.roundWins[1]}
                </p>
                <small>Новая игра через 5 секунд</small>
              </>
            )}
          </div>
        )}
      </div>
      <div className="game-actions">
        <div className="round-control">
          <div
            className="round-selector"
            role="group"
            aria-label="Количество раундов"
            style={{ backgroundImage: `url(${buttonTextureUrl})` }}
          >
            {([1, 2, 3, "infinite"] as const).map((count) => {
              const selected = snapshot.roundCount === count;
              const label =
                count === "infinite"
                  ? "Бесконечный режим"
                  : `${count} ${count === 1 ? "раунд" : "раунда"}`;
              return (
                <button
                  key={count}
                  className={`round-choice${selected ? " is-selected" : ""}`}
                  type="button"
                  aria-label={label}
                  aria-pressed={selected}
                  title={label}
                  onClick={() =>
                    sceneRef.current?.setRoundCount(count as RoundCount)
                  }
                >
                  {count === "infinite" ? (
                    <InfinityIcon />
                  ) : (
                    <RoundNumberIcon count={count} />
                  )}
                </button>
              );
            })}
          </div>
          <span>Количество раундов</span>
        </div>
        <div className="mode-controls">
          <div className="mode-control">
            <div
              className="mode-selector"
              role="group"
              aria-label="Режим игры"
              style={{ backgroundImage: `url(${buttonTextureUrl})` }}
            >
              {(
                [
                  {
                    mode: "players",
                    label: "Два игрока",
                    icon: <PlayerIcon pair />,
                  },
                  {
                    mode: "computer",
                    label: "Игрок против компьютера",
                    icon: (
                      <>
                        <PlayerIcon />
                        <ComputerIcon />
                      </>
                    ),
                  },
                ] as const
              ).map(({ mode, label, icon }) => {
                const selected = snapshot.gameMode === mode;
                return (
                  <button
                    key={mode}
                    className={`mode-choice${selected ? " is-selected" : ""}`}
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    title={label}
                    onClick={() =>
                      sceneRef.current?.setGameMode(mode as GameMode)
                    }
                  >
                    {icon}
                  </button>
                );
              })}
            </div>
            <span>Режим игры</span>
          </div>

          <div className="speed-control">
            <div
              className="speed-selector"
              role="group"
              aria-label="Скорость прицеливания"
              style={{ backgroundImage: `url(${buttonTextureUrl})` }}
            >
              {(
                [
                  { speedLevel: "easy", label: "Лёгкая", multiplier: "0,75×" },
                  {
                    speedLevel: "medium",
                    label: "Средняя",
                    multiplier: "1,25×",
                  },
                  { speedLevel: "hard", label: "Сложная", multiplier: "1,75×" },
                ] as const
              ).map(({ speedLevel, label, multiplier }) => {
                const selected = snapshot.speedLevel === speedLevel;
                return (
                  <button
                    key={speedLevel}
                    className={`speed-choice speed-choice--${speedLevel}${selected ? " is-selected" : ""}`}
                    type="button"
                    aria-label={`${label} скорость, ${multiplier}`}
                    aria-pressed={selected}
                    title={`${label} — ${multiplier}`}
                    onClick={() => sceneRef.current?.setSpeedLevel(speedLevel)}
                  >
                    <SpeedometerIcon level={speedLevel} />
                  </button>
                );
              })}
            </div>
            <span>
              Скорость:{" "}
              {
                { easy: "0,75×", medium: "1,25×", hard: "1,75×" }[
                  snapshot.speedLevel
                ]
              }
            </span>
          </div>

          <div className="layout-control">
            <button
              className="layout-choice"
              type="button"
              aria-label={`Расстановка: ${currentLayout.name}, ${currentLayout.points.length} асыков. Следующая: ${nextLayout.name}`}
              title={`${currentLayout.name} — ${currentLayout.points.length} асыков`}
              style={{ backgroundImage: `url(${buttonTextureUrl})` }}
              onClick={() => sceneRef.current?.setAsyqLayout(nextLayout.id)}
            >
              <FormationIcon points={currentLayout.points} />
              <strong>{currentLayout.points.length}</strong>
            </button>
            <span>Расстановка</span>
          </div>
        </div>
      </div>
      <div className="leaderboards">
        <LeaderboardSection
          title="Бесконечный режим"
          subtitle="Раунды против компьютера"
          entries={infiniteLeaderboard}
          unit="раундов"
        />
        <LeaderboardSection
          title="Игра вдвоём"
          subtitle="Победы над игроками"
          entries={pvpLeaderboard}
          unit="побед"
        />
      </div>
      <AppearanceSection
        asyqStyle={snapshot.asyqStyle}
        saqaStyle={snapshot.saqaStyle}
        onAsyqStyleChange={(style) => {
          sceneRef.current?.setAsyqStyle(style);
          writeCookie(ASYQ_STYLE_COOKIE, style);
        }}
        onSaqaStyleChange={(style) => {
          sceneRef.current?.setSaqaStyle(style);
          writeCookie(SAQA_STYLE_COOKIE, style);
        }}
      />
    </section>
  );
}
