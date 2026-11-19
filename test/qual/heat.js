// @ts-check
// Fixed table rows and their heat bins, worked out by hand for 23.04 (#23). Shares no code with src/.
//
// Each column's range [min, max] over a set of rows is split into four equal steps. A value's position is
// t = (v - min) / (max - min): hot1 for t <= 0.25, hot2 for t <= 0.5, hot3 for t <= 0.75, hot4 above. No value below
// sits within 0.01 of a step. Counts are [Numerator, Denominator]; Rate = Numerator / Denominator.

export const METRICS = ['M1', 'M2'];

/** @typedef {{ label: string, M1: [number, number], M2: [number, number] }} Counts */

/** @type {Array<Counts & { group: string }>} */
export const STUDIES = [
  { label: 'S1', group: 'A', M1: [4, 40], M2: [1, 10] },
  { label: 'S2', group: 'A', M1: [14, 90], M2: [3, 10] },
  { label: 'S3', group: 'B', M1: [10, 200], M2: [0, 12] },
  { label: 'S4', group: 'C', M1: [36, 130], M2: [8, 20] },
  { label: 'S5', group: 'C', M1: [26, 150], M2: [5, 10] },
];

/** Each group's counts: its studies' counts summed. */
/** @type {Counts[]} */
export const GROUPS = [
  { label: 'A', M1: [18, 130], M2: [4, 20] },
  { label: 'B', M1: [10, 200], M2: [0, 12] },
  { label: 'C', M1: [62, 280], M2: [13, 30] },
];

/** @type {Counts} */
export const TOTAL = { label: 'Portfolio total', M1: [90, 610], M2: [17, 62] };

/**
 * The bins of S1–S5 among the five study rows, in STUDIES order.
 * M1 num  [4, 36]:          t = 0, .3125, .1875, 1, .6875
 * M1 den  [40, 200]:        t = 0, .3125, 1, .5625, .6875
 * M1 rate [.05, .276923]:   .1, .155556, .05, .276923, .173333 -> t = .2203, .4652, 0, 1, .5435
 * M2 num  [0, 8]:           t = .125, .375, 0, 1, .625
 * M2 den  [10, 20]:         t = 0, 0, .2, 1, 0
 * M2 rate [0, .5]:          .1, .3, 0, .4, .5 -> t = .2, .6, 0, .8, 1
 */
export const STUDY_BINS = {
  num: { M1: ['hot1', 'hot2', 'hot1', 'hot4', 'hot3'], M2: ['hot1', 'hot2', 'hot1', 'hot4', 'hot3'] },
  den: { M1: ['hot1', 'hot2', 'hot4', 'hot3', 'hot3'], M2: ['hot1', 'hot1', 'hot1', 'hot4', 'hot1'] },
  rate: { M1: ['hot1', 'hot2', 'hot1', 'hot4', 'hot3'], M2: ['hot1', 'hot3', 'hot1', 'hot4', 'hot4'] },
};

/**
 * The bins of A, B and C among the three group rows, in GROUPS order.
 * M1 num  [10, 62]:         t = .1538, 0, 1
 * M1 den  [130, 280]:       t = 0, .4667, 1
 * M1 rate [.05, .221429]:   .138462, .05, .221429 -> t = .5160, 0, 1
 * M2 num  [0, 13]:          t = .3077, 0, 1
 * M2 den  [12, 30]:         t = .4444, 0, 1
 * M2 rate [0, .433333]:     .2, 0, .433333 -> t = .4615, 0, 1
 */
export const GROUP_BINS = {
  num: { M1: ['hot1', 'hot1', 'hot4'], M2: ['hot2', 'hot1', 'hot4'] },
  den: { M1: ['hot1', 'hot2', 'hot4'], M2: ['hot2', 'hot1', 'hot4'] },
  rate: { M1: ['hot3', 'hot1', 'hot4'], M2: ['hot2', 'hot1', 'hot4'] },
};

/**
 * The total's bins: none under Numerator or Denominator; under Rate, among the top-level rows.
 * Ungrouped, among the study rows: M1 .147541 in [.05, .276923], t = .4298; M2 .274194 in [0, .5], t = .5484.
 * Grouped, among the group rows: M1 .147541 in [.05, .221429], t = .5690; M2 .274194 in [0, .433333], t = .6328.
 */
export const TOTAL_BINS = {
  ungrouped: { num: { M1: '', M2: '' }, den: { M1: '', M2: '' }, rate: { M1: 'hot2', M2: 'hot3' } },
  grouped: { num: { M1: '', M2: '' }, den: { M1: '', M2: '' }, rate: { M1: 'hot3', M2: 'hot3' } },
};
