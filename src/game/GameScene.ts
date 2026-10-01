import Phaser from "phaser";
import boardTextureUrl from "../assets/game/board-texture.png";
import cornerOrnamentUrl from "../assets/game/corner-ornament.png";
import { planAiShot } from "./ai";
import {
  createAsyqLayoutPoints,
  type AsyqLayoutId,
  type LayoutPoint,
} from "./layouts";
import {
  getAsyqTextureKey,
  getSaqaTextureKey,
  PIECE_THEMES,
  type PieceStyle,
} from "./themes";

type Point = { x: number; y: number };

export type Player = 0 | 1;
export type GameMode = "players" | "computer";
export type SpeedLevel = "easy" | "medium" | "hard";
export type RoundCount = 1 | 2 | 3 | "infinite";
export type GameStatus =
  | "ready"
  | "direction"
  | "power"
  | "striking"
  | "moving"
  | "resolving"
  | "roundover"
  | "gameover";

export type GameSnapshot = {
  status: GameStatus;
  power: number;
  activePlayer: Player;
  scores: [number, number];
  remaining: number;
  roundNumber: number;
  roundCount: RoundCount;
  roundWins: [number, number];
  gameMode: GameMode;
  speedLevel: SpeedLevel;
  layoutId: AsyqLayoutId;
  asyqStyle: PieceStyle;
  saqaStyle: PieceStyle;
};

type SnapshotListener = (snapshot: GameSnapshot) => void;

const WIDTH = 960;
const HEIGHT = 960;
const BOARD_CENTER = { x: WIDTH / 2, y: HEIGHT / 2 } as const;
const BOARD_EDGE_INSET = 18;
const CORNER_ORNAMENT = { inset: 18, width: 190, height: 181 } as const;
const ARENA = { ...BOARD_CENTER, radius: 290 } as const;
const CENTER_GUIDE_RADIUS = 82;
const SAQA_CENTER_OFFSET = ARENA.radius + 42;
const ASYQ_DISPLAY_SIZE = { width: 42, height: 34 };
const SAQA_DISPLAY_SIZE = { width: 50, height: 40 };
const POWER_BAR_GAP = 18;
const POWER_BAR_HEIGHT = 10;
const POWER_BAR_MAX_WIDTH = SAQA_DISPLAY_SIZE.width * 4;

function getSaqaStart(player: Player) {
  const verticalDirection = player === 0 ? 1 : -1;
  return {
    x: BOARD_CENTER.x,
    y: BOARD_CENTER.y + verticalDirection * SAQA_CENTER_OFFSET,
  };
}

export default class GameScene extends Phaser.Scene {
  private readonly onSnapshot: SnapshotListener;
  private saqa!: Phaser.Physics.Matter.Image;
  private asyqs: Phaser.Physics.Matter.Image[] = [];
  private currentLayoutPoints: LayoutPoint[] = [];
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private status: GameStatus = "ready";
  private activePlayer: Player = 0;
  private scores: [number, number] = [0, 0];
  private roundNumber = 1;
  private roundCount: RoundCount = 1;
  private roundWins: [number, number] = [0, 0];
  private gameMode: GameMode = "computer";
  private speedLevel: SpeedLevel = "medium";
  private layoutId: AsyqLayoutId = "line";
  private asyqStyle: PieceStyle;
  private saqaStyle: PieceStyle;
  private shotDirection: Point = { x: 0, y: -1 };
  private directionStartedAt = 0;
  private powerStartedAt = 0;
  private currentPower = 0;
  private displayedPower = -1;
  private stillFrames = 0;

  constructor(
    onSnapshot: SnapshotListener,
    styles: { asyqStyle: PieceStyle; saqaStyle: PieceStyle } = {
      asyqStyle: "classic",
      saqaStyle: "classic",
    },
  ) {
    super("game");
    this.onSnapshot = onSnapshot;
    this.asyqStyle = styles.asyqStyle;
    this.saqaStyle = styles.saqaStyle;
  }

  preload() {
    PIECE_THEMES.forEach((theme) => {
      theme.asyqs.forEach((url, variant) => {
        this.load.image(getAsyqTextureKey(theme.id, variant), url);
      });
      this.load.image(getSaqaTextureKey(theme.id), theme.saqa);
    });
    this.load.image("board-texture", boardTextureUrl);
    this.load.image("corner-ornament", cornerOrnamentUrl);
  }

  create() {
    this.add
      .image(BOARD_CENTER.x, BOARD_CENTER.y, "board-texture")
      .setDisplaySize(WIDTH, HEIGHT)
      .setDepth(-10);
    this.createBoardOrnaments();
    this.drawArena();
    this.createBounds();
    this.aimGraphics = this.add.graphics().setDepth(10);
    this.resetRound();
    this.bindInput();
  }

  update(time: number) {
    if (this.status === "direction") {
      this.updateDirectionSelector(time);
      return;
    }

    if (this.status === "power") {
      this.updatePowerSelector(time);
      return;
    }

    if (this.status !== "moving") return;

    this.findKnockedAsyqs();

    const movingPieces = [
      this.saqa,
      ...this.asyqs.filter((piece) => !piece.getData("knocked")),
    ];
    const allStill = movingPieces.every((piece) => {
      const body = piece.body;
      return (
        body !== null && Math.hypot(body.velocity.x, body.velocity.y) < 0.08
      );
    });

    this.stillFrames = allStill ? this.stillFrames + 1 : 0;
    if (this.stillFrames > 18) this.resolveTurn();
  }

  resetRound() {
    this.roundNumber = 1;
    this.roundWins = [0, 0];
    this.startRound();
  }

  setRoundCount(count: RoundCount) {
    const nextCount: RoundCount =
      count === "infinite"
        ? "infinite"
        : (Phaser.Math.Clamp(Math.round(count), 1, 3) as 1 | 2 | 3);
    if (nextCount === this.roundCount) return;
    this.roundCount = nextCount;
    this.resetRound();
  }

  setGameMode(mode: GameMode) {
    if (mode === this.gameMode) return;
    this.gameMode = mode;
    this.resetRound();
  }

  setSpeedLevel(speedLevel: SpeedLevel) {
    if (speedLevel === this.speedLevel) return;
    this.speedLevel = speedLevel;
    this.emitSnapshot();
  }

  setAsyqLayout(layoutId: AsyqLayoutId) {
    if (layoutId === this.layoutId) return;
    this.layoutId = layoutId;
    this.resetRound();
  }

  setAsyqStyle(style: PieceStyle) {
    if (style === this.asyqStyle) return;
    this.asyqStyle = style;
    this.asyqs.forEach((piece) => {
      const variant = Number(piece.getData("assetVariant")) || 0;
      this.replacePieceTexture(
        piece,
        getAsyqTextureKey(style, variant),
        ASYQ_DISPLAY_SIZE,
        20,
        { friction: 0.045, frictionAir: 0.025, bounce: 0.82, mass: 0.75 },
      );
      this.rememberBaseScale(piece);
    });
    this.emitSnapshot(this.displayedPower > 0 ? this.displayedPower : 0);
  }

  setSaqaStyle(style: PieceStyle) {
    if (style === this.saqaStyle) return;
    this.saqaStyle = style;
    if (this.saqa) {
      this.replacePieceTexture(
        this.saqa,
        getSaqaTextureKey(style),
        SAQA_DISPLAY_SIZE,
        26,
        { friction: 0.04, frictionAir: 0.02, bounce: 0.76, mass: 3.2 },
      );
      this.rememberBaseScale(this.saqa);
    }
    this.emitSnapshot(this.displayedPower > 0 ? this.displayedPower : 0);
  }

  private startRound() {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.asyqs.forEach((piece) => piece.destroy());
    this.asyqs = [];
    this.saqa?.destroy();

    this.activePlayer = ((this.roundNumber - 1) % 2) as Player;
    this.scores = [0, 0];
    this.status = "ready";
    this.shotDirection = { x: 0, y: -1 };
    this.currentPower = 0;
    this.displayedPower = -1;
    this.stillFrames = 0;
    this.aimGraphics?.clear();

    this.currentLayoutPoints = createAsyqLayoutPoints(this.layoutId);
    this.currentLayoutPoints.forEach((slot, index) => {
      this.asyqs.push(this.createAsyq(index, slot));
    });

    const saqaStart = getSaqaStart(this.activePlayer);
    this.saqa = this.rememberBaseScale(
      this.matter.add
        .image(saqaStart.x, saqaStart.y, getSaqaTextureKey(this.saqaStyle))
        .setDisplaySize(SAQA_DISPLAY_SIZE.width, SAQA_DISPLAY_SIZE.height)
        .setCircle(26)
        .setFriction(0.04)
        .setFrictionAir(0.02)
        .setBounce(0.76)
        .setMass(3.2)
        .setDepth(2)
        .setAngle(this.activePlayer === 0 ? 0 : 180),
    );
    this.configureSaqaInteraction();

    this.emitSnapshot();
    this.scheduleComputerTurn();
  }

  private createAsyq(index: number, slot: LayoutPoint) {
    const assetVariant = Phaser.Math.Between(0, 3);
    const texture = getAsyqTextureKey(this.asyqStyle, assetVariant);
    const piece = this.rememberBaseScale(
      this.matter.add
        .image(slot.x, slot.y, texture)
        .setDisplaySize(ASYQ_DISPLAY_SIZE.width, ASYQ_DISPLAY_SIZE.height)
        .setCircle(20)
        .setFriction(0.045)
        .setFrictionAir(0.025)
        .setBounce(0.82)
        .setMass(0.75)
        .setAngle(0),
    );
    piece.setData("slot", index);
    piece.setData("assetVariant", assetVariant);
    piece.setData("knocked", false);
    return piece;
  }

  private bindInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.status === "direction") {
        this.lockDirection();
        return;
      }

      if (this.status === "power") {
        this.performStrike();
        return;
      }

      if (this.status !== "ready") return;
      if (this.isComputerTurn()) return;
      const distance = Phaser.Math.Distance.Between(
        pointer.worldX,
        pointer.worldY,
        this.saqa.x,
        this.saqa.y,
      );
      if (distance > 52) return;

      this.tweens.killTweensOf(this.saqa);
      this.restoreBaseScale(this.saqa).setStatic(true);
      this.status = "direction";
      this.directionStartedAt = this.time.now;
      this.displayedPower = -1;
      this.emitSnapshot();
    });
  }

  private configureSaqaInteraction() {
    this.saqa.setInteractive({ useHandCursor: true });
    this.saqa.on("pointerover", () => {
      if (this.status !== "ready") return;
      this.tweens.add({
        targets: this.saqa,
        scaleX: this.getBaseScale(this.saqa, "x") * 1.12,
        scaleY: this.getBaseScale(this.saqa, "y") * 1.12,
        duration: 140,
        ease: "Sine.easeOut",
      });
    });
    this.saqa.on("pointerout", () => {
      if (this.status !== "ready") return;
      this.tweens.add({
        targets: this.saqa,
        scaleX: this.getBaseScale(this.saqa, "x"),
        scaleY: this.getBaseScale(this.saqa, "y"),
        duration: 140,
        ease: "Sine.easeOut",
      });
    });
  }

  private updateDirectionSelector(time: number) {
    const centerAngle = this.activePlayer === 0 ? -Math.PI / 2 : Math.PI / 2;
    const sweep = Math.sin(
      (time - this.directionStartedAt) * 0.0028 * this.getSelectionSpeed(),
    );
    const angle = centerAngle + sweep * Phaser.Math.DegToRad(70);
    this.shotDirection = { x: Math.cos(angle), y: Math.sin(angle) };
    this.drawDirectionSelector(angle);
  }

  private lockDirection() {
    if (this.status !== "direction") return;
    this.status = "power";
    this.powerStartedAt = this.time.now;
    this.currentPower = 0.12;
    this.displayedPower = 12;
    this.drawPowerSelector();
    this.emitSnapshot(12);
  }

  private updatePowerSelector(time: number) {
    const wave =
      (Math.sin(
        (time - this.powerStartedAt) * 0.004 * this.getSelectionSpeed() -
          Math.PI / 2,
      ) +
        1) /
      2;
    this.currentPower = 0.12 + wave * 0.88;
    this.drawPowerSelector();
    const shownPower = Math.round(this.currentPower * 100);
    if (shownPower !== this.displayedPower) {
      this.displayedPower = shownPower;
      this.emitSnapshot(shownPower);
    }
  }

  private performStrike() {
    if (this.status !== "power") return;
    this.status = "striking";
    this.aimGraphics.clear();
    const origin = { x: this.saqa.x, y: this.saqa.y };
    const windup = 28;
    const speed = 6 + this.currentPower * 12;
    const power = this.displayedPower;
    this.emitSnapshot(power);

    this.tweens.add({
      targets: this.saqa,
      x: origin.x - this.shotDirection.x * windup,
      y: origin.y - this.shotDirection.y * windup,
      scaleX: this.getBaseScale(this.saqa, "x") * 1.08,
      scaleY: this.getBaseScale(this.saqa, "y") * 1.08,
      duration: 190,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.restoreBaseScale(this.saqa).setStatic(false);
        this.saqa.setVelocity(
          this.shotDirection.x * speed,
          this.shotDirection.y * speed,
        );
        this.saqa.setAngularVelocity(
          (this.shotDirection.x - this.shotDirection.y) * 0.24,
        );
        this.status = "moving";
        this.stillFrames = 0;
        this.emitSnapshot();
      },
    });
  }

  private findKnockedAsyqs() {
    this.asyqs.forEach((piece) => {
      if (!piece.active || !piece.body || piece.getData("knocked")) return;

      const distance = Phaser.Math.Distance.Between(
        piece.x,
        piece.y,
        ARENA.x,
        ARENA.y,
      );
      if (distance <= ARENA.radius + 10) return;

      piece.setData("knocked", true);
      piece
        .setVelocity(0, 0)
        .setAngularVelocity(0)
        .setStatic(true)
        .setSensor(true);
      this.scores[this.activePlayer] += 1;
      this.animateKnockout(piece);
      this.emitSnapshot();
    });

    this.asyqs = this.asyqs.filter(
      (piece) => piece.active && !piece.getData("knocked"),
    );
  }

  private animateKnockout(piece: Phaser.Physics.Matter.Image) {
    if (this.game.renderer.type === Phaser.WEBGL) {
      piece.postFX.addBlur(1, 2, 2, 1.4, 0xffffff, 3);
    }

    this.tweens.add({
      targets: piece,
      alpha: 0,
      scaleX: this.getBaseScale(piece, "x") * 1.8,
      scaleY: this.getBaseScale(piece, "y") * 1.8,
      duration: 460,
      ease: "Cubic.easeOut",
      onComplete: () => piece.destroy(),
    });
  }

  private resolveTurn() {
    if (this.status !== "moving") return;
    this.status = "resolving";
    this.stillFrames = 0;
    this.saqa.setVelocity(0, 0).setAngularVelocity(0).setStatic(true);

    const remaining = this.asyqs.filter((piece) => piece.active);
    this.asyqs = remaining;
    remaining.forEach((piece) => {
      piece.setVelocity(0, 0).setAngularVelocity(0).setStatic(true);
      const slot = Number(piece.getData("slot"));
      this.tweens.add({
        targets: piece,
        ...this.getCurrentAsyqSlot(slot),
        angle: 0,
        duration: 360,
        delay: slot * 25,
        ease: "Sine.easeInOut",
      });
    });
    this.emitSnapshot();

    this.time.delayedCall(580, () => {
      if (remaining.length === 0) {
        this.finishRound();
        return;
      }

      remaining.forEach((piece) => piece.setStatic(false).setSensor(false));
      this.activePlayer = this.activePlayer === 0 ? 1 : 0;
      const start = getSaqaStart(this.activePlayer);
      this.saqa
        .setPosition(start.x, start.y)
        .setAngle(this.activePlayer === 0 ? 0 : 180)
        .setVisible(true)
        .setStatic(false);
      this.restoreBaseScale(this.saqa);
      this.status = "ready";
      this.currentPower = 0;
      this.displayedPower = -1;
      this.aimGraphics.clear();
      this.emitSnapshot();
      this.scheduleComputerTurn();
    });
  }

  private isComputerTurn() {
    return this.gameMode === "computer" && this.activePlayer === 1;
  }

  private scheduleComputerTurn() {
    if (!this.isComputerTurn() || this.status !== "ready") return;

    const shot = planAiShot(
      { x: this.saqa.x, y: this.saqa.y },
      this.asyqs.map((piece) => ({ x: piece.x, y: piece.y })),
    );

    this.time.delayedCall(shot.decisionDelay, () => {
      if (!this.isComputerTurn() || this.status !== "ready") return;
      this.shotDirection = shot.direction;
      this.currentPower = shot.power;
      this.displayedPower = Math.round(shot.power * 100);
      this.status = "power";
      this.drawPowerSelector();
      this.emitSnapshot(this.displayedPower);

      this.time.delayedCall(300, () => {
        if (this.status === "power" && this.isComputerTurn())
          this.performStrike();
      });
    });
  }

  private getSelectionSpeed() {
    return { easy: 0.75, medium: 1.25, hard: 1.75 }[this.speedLevel];
  }

  private getCurrentAsyqSlot(index: number) {
    return this.currentLayoutPoints[index] ?? BOARD_CENTER;
  }

  private finishRound() {
    if (this.scores[0] !== this.scores[1]) {
      const winner: Player = this.scores[0] > this.scores[1] ? 0 : 1;
      this.roundWins[winner] += 1;
    }
    this.saqa.setVisible(false);

    if (this.roundCount !== "infinite" && this.roundNumber >= this.roundCount) {
      this.status = "gameover";
      this.emitSnapshot();
      return;
    }

    this.status = "roundover";
    this.emitSnapshot();
    this.time.delayedCall(1500, () => {
      this.roundNumber += 1;
      this.startRound();
    });
  }

  private drawDirectionSelector(angle: number) {
    this.aimGraphics.clear();

    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const start = 38;
    const end = 98;
    const tipX = this.saqa.x + direction.x * end;
    const tipY = this.saqa.y + direction.y * end;
    const normal = { x: -direction.y, y: direction.x };

    this.aimGraphics.lineStyle(7, 0xffe5a2, 0.24);
    this.aimGraphics.lineBetween(
      this.saqa.x + direction.x * start,
      this.saqa.y + direction.y * start,
      tipX,
      tipY,
    );
    this.aimGraphics.lineStyle(4, 0xfff1c7, 1);
    this.aimGraphics.lineBetween(
      this.saqa.x + direction.x * start,
      this.saqa.y + direction.y * start,
      tipX,
      tipY,
    );
    this.aimGraphics.fillStyle(0xfff1c7, 0.92);
    this.aimGraphics.fillTriangle(
      tipX,
      tipY,
      tipX - direction.x * 18 + normal.x * 10,
      tipY - direction.y * 18 + normal.y * 10,
      tipX - direction.x * 18 - normal.x * 10,
      tipY - direction.y * 18 - normal.y * 10,
    );
  }

  private drawLockedDirection() {
    const angle = Math.atan2(this.shotDirection.y, this.shotDirection.x);
    this.drawDirectionSelector(angle);
  }

  private drawPowerSelector() {
    this.drawLockedDirection();

    const edgeDirection = this.activePlayer === 0 ? 1 : -1;
    const barCenterY =
      this.saqa.y +
      edgeDirection * (SAQA_DISPLAY_SIZE.height / 2 + POWER_BAR_GAP);
    const activeWidth = POWER_BAR_MAX_WIDTH * this.currentPower;
    const trackX = BOARD_CENTER.x - POWER_BAR_MAX_WIDTH / 2;
    const trackY = barCenterY - POWER_BAR_HEIGHT / 2;
    const activeX = BOARD_CENTER.x - activeWidth / 2;

    this.aimGraphics.fillStyle(0x102f3f, 0.72);
    this.aimGraphics.fillRoundedRect(
      trackX,
      trackY,
      POWER_BAR_MAX_WIDTH,
      POWER_BAR_HEIGHT,
      POWER_BAR_HEIGHT / 2,
    );
    this.aimGraphics.lineStyle(2, 0xffe5a2, 0.32);
    this.aimGraphics.strokeRoundedRect(
      trackX,
      trackY,
      POWER_BAR_MAX_WIDTH,
      POWER_BAR_HEIGHT,
      POWER_BAR_HEIGHT / 2,
    );
    this.aimGraphics.fillStyle(0xf1b84b, 0.96);
    this.aimGraphics.fillRoundedRect(
      activeX,
      trackY + 2,
      activeWidth,
      POWER_BAR_HEIGHT - 4,
      (POWER_BAR_HEIGHT - 4) / 2,
    );
    this.aimGraphics.fillStyle(0xffedb0, 1);
    this.aimGraphics.fillCircle(BOARD_CENTER.x, barCenterY, 3);
  }

  private createBounds() {
    this.matter.world.setBounds(
      BOARD_EDGE_INSET,
      BOARD_EDGE_INSET,
      WIDTH - BOARD_EDGE_INSET * 2,
      HEIGHT - BOARD_EDGE_INSET * 2,
      44,
      true,
      true,
      true,
      true,
    );
  }

  private createBoardOrnaments() {
    const corners = [
      {
        x: CORNER_ORNAMENT.inset,
        y: CORNER_ORNAMENT.inset,
        originX: 0,
        originY: 0,
        flipX: false,
        flipY: true,
      },
      {
        x: WIDTH - CORNER_ORNAMENT.inset,
        y: CORNER_ORNAMENT.inset,
        originX: 1,
        originY: 0,
        flipX: true,
        flipY: true,
      },
      {
        x: CORNER_ORNAMENT.inset,
        y: HEIGHT - CORNER_ORNAMENT.inset,
        originX: 0,
        originY: 1,
        flipX: false,
        flipY: false,
      },
      {
        x: WIDTH - CORNER_ORNAMENT.inset,
        y: HEIGHT - CORNER_ORNAMENT.inset,
        originX: 1,
        originY: 1,
        flipX: true,
        flipY: false,
      },
    ] as const;

    corners.forEach(({ x, y, originX, originY, flipX, flipY }) => {
      this.add
        .image(x, y, "corner-ornament")
        .setOrigin(originX, originY)
        .setDisplaySize(CORNER_ORNAMENT.width, CORNER_ORNAMENT.height)
        .setFlip(flipX, flipY)
        .setDepth(-8);
    });
  }

  private drawArena() {
    const graphics = this.add.graphics().setDepth(-7);
    const ornament = 0xd4b877;

    graphics.lineStyle(3, ornament, 0.88);
    graphics.strokeCircle(ARENA.x, ARENA.y, ARENA.radius);

    graphics.lineStyle(2, ornament, 0.14);
    graphics.strokeCircle(ARENA.x, ARENA.y, CENTER_GUIDE_RADIUS);

    graphics.lineStyle(3, ornament, 0.38);
    const dashLength = 11;
    const gapLength = 9;
    const startX = ARENA.x - ARENA.radius;
    const endX = ARENA.x + ARENA.radius;
    for (let x = startX; x < endX; x += dashLength + gapLength) {
      graphics.lineBetween(x, ARENA.y, Math.min(x + dashLength, endX), ARENA.y);
    }
  }

  private rememberBaseScale<T extends Phaser.Physics.Matter.Image>(piece: T) {
    piece.setData("baseScaleX", piece.scaleX);
    piece.setData("baseScaleY", piece.scaleY);
    return piece;
  }

  private replacePieceTexture(
    piece: Phaser.Physics.Matter.Image,
    texture: string,
    displaySize: { width: number; height: number },
    hitboxRadius: number,
    physics: {
      friction: number;
      frictionAir: number;
      bounce: number;
      mass: number;
    },
  ) {
    const body = piece.body;
    const matterBody = body as
      | (typeof body & {
          angularVelocity: number;
          isStatic: boolean;
          isSensor: boolean;
        })
      | null;
    const state = body
      ? {
          velocityX: body.velocity.x,
          velocityY: body.velocity.y,
          angularVelocity: matterBody?.angularVelocity ?? 0,
          isStatic: matterBody?.isStatic ?? false,
          isSensor: matterBody?.isSensor ?? false,
          angle: piece.angle,
        }
      : null;

    piece
      .setTexture(texture)
      .setDisplaySize(displaySize.width, displaySize.height)
      .setCircle(hitboxRadius)
      .setFriction(physics.friction)
      .setFrictionAir(physics.frictionAir)
      .setBounce(physics.bounce)
      .setMass(physics.mass);

    if (!state) return;
    piece.setAngle(state.angle).setSensor(state.isSensor);
    if (state.isStatic) {
      piece.setStatic(true);
    } else {
      piece
        .setVelocity(state.velocityX, state.velocityY)
        .setAngularVelocity(state.angularVelocity);
    }
  }

  private getBaseScale(piece: Phaser.Physics.Matter.Image, axis: "x" | "y") {
    return Number(piece.getData(axis === "x" ? "baseScaleX" : "baseScaleY"));
  }

  private restoreBaseScale(piece: Phaser.Physics.Matter.Image) {
    return piece.setScale(
      this.getBaseScale(piece, "x"),
      this.getBaseScale(piece, "y"),
    );
  }

  private emitSnapshot(power = 0) {
    this.onSnapshot({
      status: this.status,
      power,
      activePlayer: this.activePlayer,
      scores: [...this.scores],
      remaining:
        this.currentLayoutPoints.length - this.scores[0] - this.scores[1],
      roundNumber: this.roundNumber,
      roundCount: this.roundCount,
      roundWins: [...this.roundWins],
      gameMode: this.gameMode,
      speedLevel: this.speedLevel,
      layoutId: this.layoutId,
      asyqStyle: this.asyqStyle,
      saqaStyle: this.saqaStyle,
    });
  }
}
