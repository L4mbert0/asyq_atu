export type AsyqLayoutId =
  "line" | "triangle" | "diamond" | "ring" | "pyramid" | "chaos";

export type LayoutPoint = { x: number; y: number };

const CENTER = { x: 480, y: 480 } as const;

function centeredRow(count: number, y: number, spacing: number) {
  return Array.from({ length: count }, (_, index) => ({
    x: CENTER.x + (index - (count - 1) / 2) * spacing,
    y,
  }));
}

const line = centeredRow(7, CENTER.y, 60);

const triangle = [1, 2, 3].flatMap((count, row) =>
  centeredRow(count, CENTER.y + (row - 1) * 58, 58),
);

const diamond = [1, 2, 3, 2, 1].flatMap((count, row) =>
  centeredRow(count, CENTER.y + (row - 2) * 50, 52),
);

const ring = Array.from({ length: 12 }, (_, index) => {
  const angle = -Math.PI / 2 + (index / 12) * Math.PI * 2;
  return {
    x: CENTER.x + Math.cos(angle) * 108,
    y: CENTER.y + Math.sin(angle) * 108,
  };
});

const pyramid = [1, 2, 3, 4, 5].flatMap((count, row) =>
  centeredRow(count, CENTER.y + (row - 2) * 46, 46),
);

const chaosPreview = [
  { x: 405, y: 397 },
  { x: 486, y: 380 },
  { x: 555, y: 411 },
  { x: 438, y: 444 },
  { x: 522, y: 456 },
  { x: 377, y: 478 },
  { x: 475, y: 500 },
  { x: 580, y: 486 },
  { x: 415, y: 542 },
  { x: 539, y: 535 },
  { x: 366, y: 572 },
  { x: 475, y: 584 },
  { x: 588, y: 570 },
];

export const ASYQ_LAYOUTS = [
  { id: "line", name: "Линия", points: line },
  { id: "triangle", name: "Треугольник", points: triangle },
  { id: "diamond", name: "Ромб", points: diamond },
  { id: "ring", name: "Круг", points: ring },
  { id: "pyramid", name: "Пирамида", points: pyramid },
  { id: "chaos", name: "Хаос", points: chaosPreview },
] as const satisfies ReadonlyArray<{
  id: AsyqLayoutId;
  name: string;
  points: readonly LayoutPoint[];
}>;

export function getAsyqLayout(id: AsyqLayoutId) {
  return ASYQ_LAYOUTS.find((layout) => layout.id === id) ?? ASYQ_LAYOUTS[0];
}

export function createAsyqLayoutPoints(
  id: AsyqLayoutId,
  random: () => number = Math.random,
) {
  if (id !== "chaos") return [...getAsyqLayout(id).points];

  const points: LayoutPoint[] = [];
  const minimumDistance = 48;
  const maximumRadius = 155;
  let attempts = 0;

  while (points.length < 13 && attempts < 1000) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * maximumRadius;
    const candidate = {
      x: CENTER.x + Math.cos(angle) * radius,
      y: CENTER.y + Math.sin(angle) * radius,
    };

    if (
      points.every(
        (point) =>
          Math.hypot(point.x - candidate.x, point.y - candidate.y) >=
          minimumDistance,
      )
    ) {
      points.push(candidate);
    }
  }

  return points.length === 13 ? points : [...chaosPreview];
}
