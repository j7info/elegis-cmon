export type SlideAccessState = 'reviewed' | 'waiting' | 'ready' | 'completed';

export function getSlideAccessState({
  currentSlide,
  unlockedSlideCount,
  elapsedSeconds,
  minimumSeconds,
  completed,
}: {
  currentSlide: number;
  unlockedSlideCount: number;
  elapsedSeconds: number;
  minimumSeconds: number;
  completed: boolean;
}): SlideAccessState {
  if (completed) return 'completed';
  if (currentSlide < unlockedSlideCount) return 'reviewed';
  return elapsedSeconds >= minimumSeconds ? 'ready' : 'waiting';
}

export function canAdvanceSlide(state: SlideAccessState, advancing = false) {
  return !advancing && state !== 'waiting';
}

export function getLessonProgressPercentage(unlockedSlideCount: number, totalSlides: number) {
  if (totalSlides <= 0) return 0;
  const unlocked = Math.max(0, Math.min(unlockedSlideCount, totalSlides));
  return Math.round((unlocked / totalSlides) * 100);
}
