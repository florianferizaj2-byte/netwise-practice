export type PracticeSwipe = { dx: number; dy: number; x0: number };
// Leave the screen edge to Android's back gesture and vertical motion to scroll.
export function claimPracticeSwipe({ dx, dy, x0 }: PracticeSwipe) {
  return x0 >= 24 && dx >= 24 && dx > Math.abs(dy) * 1.6;
}
export function completePracticeSwipe(gesture: PracticeSwipe) {
  return claimPracticeSwipe(gesture) && gesture.dx >= 84;
}
