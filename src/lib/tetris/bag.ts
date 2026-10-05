import { PIECE_TYPES } from "./constants";
import type { PieceType } from "./types";

/** 0 이상 1 미만 난수를 돌려주는 함수 타입 (테스트에서 주입 가능) */
export type Rng = () => number;

/**
 * 7-bag 랜덤: 7종이 한 번씩 담긴 가방을 섞어 돌려준다.
 * Fisher-Yates 셔플로 공정하게 섞는다.
 */
export function createBag(rng: Rng = Math.random): PieceType[] {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/**
 * 큐에 블록이 최소 minCount 개가 되도록 가방에서 보충한다.
 * 반환: 보충된 큐와 남은 가방.
 */
export function refillQueue(
  queue: PieceType[],
  bag: PieceType[],
  minCount: number,
  rng: Rng = Math.random,
): { queue: PieceType[]; bag: PieceType[] } {
  const nextQueue = [...queue];
  let nextBag = [...bag];
  while (nextQueue.length < minCount) {
    if (nextBag.length === 0) {
      nextBag = createBag(rng);
    }
    nextQueue.push(nextBag.shift()!);
  }
  return { queue: nextQueue, bag: nextBag };
}
