// @ts-expect-error -- Phaser bundles Matter internally without publishing this module's types.
import Matter from "phaser/src/physics/matter-js/CustomMain.js";

export type AiPoint = { x: number; y: number };

export type AiShot = {
  direction: AiPoint;
  power: number;
  decisionDelay: number;
};

type RandomSource = () => number;
type Candidate = { angle: number; power: number };
type SimulationResult = Candidate & {
  knocked: number;
  progress: number;
  score: number;
};
const BOARD_CENTER = { x: 480, y: 480 } as const;
const ARENA_RADIUS = 290;
const KNOCKOUT_RADIUS = ARENA_RADIUS + 10;
const BOARD_MIN = 18;
const BOARD_MAX = 942;
const SAQA_RADIUS = 26;
const ASYQ_RADIUS = 20;
// Safety guard only: normal shots stop naturally around 220-300 steps.
// The planner never ranks a shot early just to meet a thinking-time budget.
const MAX_SIMULATION_SAFETY_STEPS = 420;
const resultCache = new Map<string, SimulationResult[]>();

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function normalize(vector: AiPoint) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function rotate(vector: AiPoint, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

function angleDistance(first: number, second: number) {
  return Math.abs(
    Math.atan2(Math.sin(first - second), Math.cos(first - second)),
  );
}

function addCandidate(
  candidates: Candidate[],
  seen: Set<string>,
  candidate: Candidate,
) {
  const normalized = {
    angle: candidate.angle,
    power: clamp(candidate.power, 0.2, 1),
  };
  const key = `${normalized.angle.toFixed(4)}:${normalized.power.toFixed(3)}`;
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(normalized);
}

function simulateShot(
  origin: AiPoint,
  pieces: AiPoint[],
  candidate: Candidate,
): SimulationResult {
  const engine = Matter.Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 0;
  const saqa = Matter.Bodies.circle(origin.x, origin.y, SAQA_RADIUS, {
    friction: 0.04,
    frictionAir: 0.02,
    restitution: 0.76,
  });
  Matter.Body.setMass(saqa, 3.2);
  const targets = pieces.map((piece) => {
    const body = Matter.Bodies.circle(piece.x, piece.y, ASYQ_RADIUS, {
      friction: 0.045,
      frictionAir: 0.025,
      restitution: 0.82,
    });
    Matter.Body.setMass(body, 0.75);
    return body;
  });
  const wallOptions = { isStatic: true, friction: 0, frictionStatic: 0 };
  const boundsSize = BOARD_MAX - BOARD_MIN;
  const wallThickness = 44;
  const walls = [
    Matter.Bodies.rectangle(
      BOARD_MIN - wallThickness / 2,
      (BOARD_MIN + BOARD_MAX) / 2,
      wallThickness,
      boundsSize + wallThickness * 2,
      wallOptions,
    ),
    Matter.Bodies.rectangle(
      BOARD_MAX + wallThickness / 2,
      (BOARD_MIN + BOARD_MAX) / 2,
      wallThickness,
      boundsSize + wallThickness * 2,
      wallOptions,
    ),
    Matter.Bodies.rectangle(
      (BOARD_MIN + BOARD_MAX) / 2,
      BOARD_MIN - wallThickness / 2,
      boundsSize,
      wallThickness,
      wallOptions,
    ),
    Matter.Bodies.rectangle(
      (BOARD_MIN + BOARD_MAX) / 2,
      BOARD_MAX + wallThickness / 2,
      boundsSize,
      wallThickness,
      wallOptions,
    ),
  ];
  Matter.Composite.add(engine.world, [saqa, ...targets, ...walls]);

  const startDistances = targets.map((target) =>
    Math.hypot(
      target.position.x - BOARD_CENTER.x,
      target.position.y - BOARD_CENTER.y,
    ),
  );
  const knockedTargets = new Set<(typeof targets)[number]>();
  const speed = 6 + candidate.power * 12;
  Matter.Body.setVelocity(saqa, {
    x: Math.cos(candidate.angle) * speed,
    y: Math.sin(candidate.angle) * speed,
  });
  Matter.Body.setAngle(saqa, origin.y < BOARD_CENTER.y ? Math.PI : 0);
  Matter.Body.setAngularVelocity(
    saqa,
    (Math.cos(candidate.angle) - Math.sin(candidate.angle)) * 0.24,
  );

  let stillFrames = 0;
  for (
    let step = 0;
    step < MAX_SIMULATION_SAFETY_STEPS && stillFrames < 18;
    step += 1
  ) {
    Matter.Engine.update(engine, 1000 / 60);

    targets.forEach((target) => {
      if (
        !knockedTargets.has(target) &&
        Math.hypot(
          target.position.x - BOARD_CENTER.x,
          target.position.y - BOARD_CENTER.y,
        ) > KNOCKOUT_RADIUS
      ) {
        knockedTargets.add(target);
        Matter.Composite.remove(engine.world, target);
      }
    });

    const moving = [saqa, ...targets].some(
      (body) =>
        !knockedTargets.has(body) &&
        Math.hypot(body.velocity.x, body.velocity.y) >= 0.08,
    );
    stillFrames = moving ? 0 : stillFrames + 1;
  }

  const knocked = knockedTargets.size;
  const progress = targets.reduce((total, target, index) => {
    if (knockedTargets.has(target)) return total + KNOCKOUT_RADIUS;
    const distance = Math.hypot(
      target.position.x - BOARD_CENTER.x,
      target.position.y - BOARD_CENTER.y,
    );
    return total + Math.max(0, distance - startDistances[index]);
  }, 0);
  Matter.Engine.clear(engine);
  Matter.Composite.clear(engine.world, false, true);

  return {
    ...candidate,
    knocked,
    progress,
    score: knocked * 100_000 + progress,
  };
}

function geometricCandidates(origin: AiPoint, pieces: AiPoint[]) {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const forward = normalize({
    x: BOARD_CENTER.x - origin.x,
    y: BOARD_CENTER.y - origin.y,
  });

  const targetPieces =
    pieces.length <= 8
      ? pieces
      : [...pieces]
          .sort(
            (first, second) =>
              Math.hypot(second.x - BOARD_CENTER.x, second.y - BOARD_CENTER.y) -
              Math.hypot(first.x - BOARD_CENTER.x, first.y - BOARD_CENTER.y),
          )
          .slice(0, 8);

  targetPieces.forEach((piece) => {
    const radialVector = {
      x: piece.x - BOARD_CENTER.x,
      y: piece.y - BOARD_CENTER.y,
    };
    const outward =
      Math.hypot(radialVector.x, radialVector.y) < 1
        ? forward
        : normalize(radialVector);

    [-0.18, 0, 0.18].forEach((offset) => {
      const exitDirection = rotate(outward, offset);
      const ghost = {
        x: piece.x - exitDirection.x * (SAQA_RADIUS + ASYQ_RADIUS),
        y: piece.y - exitDirection.y * (SAQA_RADIUS + ASYQ_RADIUS),
      };
      const angle = Math.atan2(ghost.y - origin.y, ghost.x - origin.x);
      addCandidate(candidates, seen, { angle, power: 0.78 });
    });

    const directAngle = Math.atan2(piece.y - origin.y, piece.x - origin.x);
    addCandidate(candidates, seen, { angle: directAngle, power: 0.82 });
  });

  return { candidates, seen };
}

function generateCandidates(origin: AiPoint, pieces: AiPoint[]) {
  const { candidates, seen } = geometricCandidates(origin, pieces);
  const centerAngle = Math.atan2(
    BOARD_CENTER.y - origin.y,
    BOARD_CENTER.x - origin.x,
  );
  const angleCount = 7;

  for (let index = 0; index < angleCount; index += 1) {
    const ratio = index / (angleCount - 1);
    const angle = centerAngle + (ratio * 2 - 1) * (Math.PI * 0.385);
    addCandidate(candidates, seen, { angle, power: 0.85 });
  }

  return candidates;
}

function rankCandidates(origin: AiPoint, pieces: AiPoint[]) {
  const cacheKey = `${origin.y < BOARD_CENTER.y ? "top" : "bottom"}:${pieces
    .map((piece) => `${Math.round(piece.x)},${Math.round(piece.y)}`)
    .sort()
    .join(";")}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return cached;

  const results = generateCandidates(origin, pieces)
    .map((candidate) => simulateShot(origin, pieces, candidate))
    .sort((first, second) => second.score - first.score);

  if (resultCache.size >= 96) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey !== undefined) resultCache.delete(oldestKey);
  }
  resultCache.set(cacheKey, results);
  return results;
}

function addExecutionError(
  candidate: Candidate,
  maxAngleError: number,
  maxPowerError: number,
  random: RandomSource,
) {
  return {
    angle: candidate.angle + (random() * 2 - 1) * maxAngleError,
    power: clamp(candidate.power + (random() * 2 - 1) * maxPowerError, 0.2, 1),
  };
}

export function planAiShot(
  origin: AiPoint,
  pieces: AiPoint[],
  random: RandomSource = Math.random,
): AiShot {
  if (pieces.length === 0) {
    return {
      direction: normalize({
        x: BOARD_CENTER.x - origin.x,
        y: BOARD_CENTER.y - origin.y,
      }),
      power: 0.7,
      decisionDelay: 400,
    };
  }

  const results = rankCandidates(origin, pieces);
  const seeksPair = random() < 0.35;
  const singleKnockouts = results.filter((result) => result.knocked === 1);
  const pool =
    seeksPair || singleKnockouts.length === 0
      ? results.slice(0, Math.min(3, results.length))
      : singleKnockouts.slice(0, Math.min(5, singleKnockouts.length));
  const chosen: Candidate = addExecutionError(
    pool[Math.floor(random() * pool.length)] ?? results[0],
    random() < 0.05 ? 0.06 : 0.012,
    0.03,
    random,
  );

  const centerAngle = Math.atan2(
    BOARD_CENTER.y - origin.y,
    BOARD_CENTER.x - origin.x,
  );
  const safeAngle =
    angleDistance(chosen.angle, centerAngle) <= Math.PI * 0.39
      ? chosen.angle
      : centerAngle;

  return {
    direction: { x: Math.cos(safeAngle), y: Math.sin(safeAngle) },
    power: chosen.power,
    decisionDelay: 1000 + random() * 500,
  };
}

export function evaluateAiShot(
  origin: AiPoint,
  pieces: AiPoint[],
  shot: Pick<AiShot, "direction" | "power">,
) {
  return simulateShot(origin, pieces, {
    angle: Math.atan2(shot.direction.y, shot.direction.x),
    power: shot.power,
  });
}
