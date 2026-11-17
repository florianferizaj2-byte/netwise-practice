export const todayMotivationLines = [
  '每练一道，就前进一点',
  '把不会的，慢慢变成会的',
  '读懂一题，就多一分把握',
  '慢一点，也是在向前',
  '先学会，再学快',
  '做对一道，也值得高兴',
  '别急，难题可以慢慢拆',
  '今天学懂一点就很好',
  '先做一道，找回节奏',
  '再看一遍，就熟悉一点',
  '不赶进度，先搞懂它',
  '先把这一题弄明白',
  '碎片时间，也能攒出进步',
  '从一道熟悉的题开始',
  '走得慢，也算数',
  '多想半步，就懂得更深',
  '错过一题，学到一招',
  '每次回头看，都有收获',
  '练过的题，会给你底气',
  '今天的努力，明天用得上',
  '一点点来，慢慢就会了',
  '状态一般，也能学一点',
  '记住一个方法，就不白练',
  '给自己一点时间',
] as const;

export function pickTodayMotivation(random = Math.random) {
  const index = Math.floor(random() * todayMotivationLines.length);
  return todayMotivationLines[index] ?? todayMotivationLines[0];
}

// Choose once per app runtime, not when home refreshes or mounts again.
export const startupMotivation = pickTodayMotivation();
