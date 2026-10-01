import classicAsyq1Url from "../assets/game/asyq-1.png";
import classicAsyq2Url from "../assets/game/asyq-2.png";
import classicAsyq3Url from "../assets/game/asyq-3.png";
import classicAsyq4Url from "../assets/game/asyq-4.png";
import classicSaqaUrl from "../assets/game/saqa.png";
import blackGoldAsyq1Url from "../assets/game/styles/black-gold/asyq-1.png";
import blackGoldAsyq2Url from "../assets/game/styles/black-gold/asyq-2.png";
import blackGoldAsyq3Url from "../assets/game/styles/black-gold/asyq-3.png";
import blackGoldAsyq4Url from "../assets/game/styles/black-gold/asyq-4.png";
import blackGoldSaqaUrl from "../assets/game/styles/black-gold/saqa.png";
import kazakhAsyq1Url from "../assets/game/styles/kazakh/asyq-1.png";
import kazakhAsyq2Url from "../assets/game/styles/kazakh/asyq-2.png";
import kazakhAsyq3Url from "../assets/game/styles/kazakh/asyq-3.png";
import kazakhAsyq4Url from "../assets/game/styles/kazakh/asyq-4.png";
import kazakhSaqaUrl from "../assets/game/styles/kazakh/saqa.png";

export type PieceStyle = "classic" | "kazakh" | "black-gold";

export type PieceTheme = {
  id: PieceStyle;
  name: string;
  asyqs: readonly [string, string, string, string];
  saqa: string;
};

export const PIECE_THEMES: readonly PieceTheme[] = [
  {
    id: "classic",
    name: "Классика",
    asyqs: [
      classicAsyq1Url,
      classicAsyq2Url,
      classicAsyq3Url,
      classicAsyq4Url,
    ],
    saqa: classicSaqaUrl,
  },
  {
    id: "kazakh",
    name: "Казахские краски",
    asyqs: [
      kazakhAsyq1Url,
      kazakhAsyq2Url,
      kazakhAsyq3Url,
      kazakhAsyq4Url,
    ],
    saqa: kazakhSaqaUrl,
  },
  {
    id: "black-gold",
    name: "Чёрно-золотой",
    asyqs: [
      blackGoldAsyq1Url,
      blackGoldAsyq2Url,
      blackGoldAsyq3Url,
      blackGoldAsyq4Url,
    ],
    saqa: blackGoldSaqaUrl,
  },
] as const;

export function isPieceStyle(value: unknown): value is PieceStyle {
  return PIECE_THEMES.some((theme) => theme.id === value);
}

export function getPieceTheme(style: PieceStyle) {
  return PIECE_THEMES.find((theme) => theme.id === style) ?? PIECE_THEMES[0];
}

export function getAsyqTextureKey(style: PieceStyle, variant: number) {
  return `asyq-${style}-${variant}`;
}

export function getSaqaTextureKey(style: PieceStyle) {
  return `saqa-${style}`;
}
