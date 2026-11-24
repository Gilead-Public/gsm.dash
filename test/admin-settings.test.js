import { describe, it, expect } from 'vitest';
import { readAdmin, writeAdmin } from '../src/app/admin-settings.js';
import { combineCards } from '../src/app/study-cards.js';
import { COMBINED_CARDS } from '../src/config/study-cards.js';

describe('the Admin panel\'s settings in the address (#46)', () => {
  const defaults = { theme: 'auto', perrow: '4', cfgpanel: 'popover', legend: 'off', combine: 'off' };

  it('46.01: reads each setting, its default when missing or unknown (#46)', () => {
    expect(readAdmin(new URLSearchParams(''))).toEqual(defaults);
    expect(readAdmin(new URLSearchParams('theme=dark&perrow=3&cfgpanel=side&legend=on&combine=on'))).toEqual({ theme: 'dark', perrow: '3', cfgpanel: 'side', legend: 'on', combine: 'on' });
    expect(readAdmin(new URLSearchParams('theme=pink&perrow=6&cfgpanel=left&legend=1'))).toEqual(defaults);
  });

  it('46.01: rewrites only its own settings, leaving every other param as it was (#46)', () => {
    const params = new URLSearchParams('group=phase&collapse=P1&filter.study=STUDY001&theme=light&hide=a&hide=b');
    writeAdmin(params, { ...defaults, perrow: '5', legend: 'on' });
    expect([...params]).toEqual([['group', 'phase'], ['collapse', 'P1'], ['filter.study', 'STUDY001'], ['hide', 'a'], ['hide', 'b'], ['perrow', '5'], ['legend', 'on']]);
    writeAdmin(params, defaults);
    expect(params.toString()).toBe('group=phase&collapse=P1&filter.study=STUDY001&hide=a&hide=b');
  });

  it('Combine similar KRI cards, an Admin demo setting, combines each configured pair whose cards both show, at the first one\'s place with its top card first, and leaves every other card alone', () => {
    const card = (id) => ({ spec: { id } });
    const ids = (items) => items.map((group) => group.map((c) => c.spec.id));
    const order = ['a', 'kri0004', 'kri0003', 'kri0002', 'kri0001', 'kri0005', 'kri0008', 'kri0009', 'kri0010', 'kri0011'].map(card);
    expect(ids(combineCards(order, COMBINED_CARDS))).toEqual([['a'], ['kri0004', 'kri0003'], ['kri0001', 'kri0002'], ['kri0005'], ['kri0008', 'kri0009'], ['kri0010', 'kri0011']]);
    const without = order.filter((c) => c.spec.id !== 'kri0003');
    expect(ids(combineCards(without, COMBINED_CARDS)).slice(0, 3)).toEqual([['a'], ['kri0004'], ['kri0001', 'kri0002']]);
  });
});
