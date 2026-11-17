import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAdvanceSlide,
  getLessonProgressPercentage,
  getSlideAccessState,
} from './onlineLessonModel.ts';

test('slides já liberados podem ser revistos sem nova espera', () => {
  const state = getSlideAccessState({
    currentSlide: 4,
    unlockedSlideCount: 10,
    elapsedSeconds: 0,
    minimumSeconds: 30,
    completed: false,
  });

  assert.equal(state, 'reviewed');
  assert.equal(canAdvanceSlide(state), true);
});

test('o último slide alcançado só libera após o tempo mínimo', () => {
  const waiting = getSlideAccessState({
    currentSlide: 10,
    unlockedSlideCount: 10,
    elapsedSeconds: 29,
    minimumSeconds: 30,
    completed: false,
  });
  const ready = getSlideAccessState({
    currentSlide: 10,
    unlockedSlideCount: 10,
    elapsedSeconds: 30,
    minimumSeconds: 30,
    completed: false,
  });

  assert.equal(waiting, 'waiting');
  assert.equal(canAdvanceSlide(waiting), false);
  assert.equal(ready, 'ready');
  assert.equal(canAdvanceSlide(ready), true);
});

test('o progresso usa o histórico liberado e não a posição de revisão', () => {
  assert.equal(getLessonProgressPercentage(10, 20), 50);
  assert.equal(getLessonProgressPercentage(30, 20), 100);
  assert.equal(getLessonProgressPercentage(0, 0), 0);
});
