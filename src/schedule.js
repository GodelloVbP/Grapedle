/** Map a puzzle number to a grape id. Out-of-range numbers are clamped / wrapped, never throw. */
export function scheduleIndex(n, length) {
  if (!(n >= 1)) return 0;
  return (Math.floor(n) - 1) % length;
}
export function answerIdFor(n, schedule) {
  return schedule.days[scheduleIndex(n, schedule.days.length)];
}
