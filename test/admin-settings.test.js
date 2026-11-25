import { describe, it, expect } from 'vitest';
import { readAdmin, writeAdmin } from '../src/app/admin-settings.js';
import { combineCards } from '../src/app/study-cards.js';
import { COMBINED_CARDS } from '../src/config/study-cards.js';
import { renderKriFlagBar } from '../src/widgets/kri-summary.js';

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
    const pairs = COMBINED_CARDS.map((c) => c.cards);
    const order = ['a', 'kri0004', 'kri0003', 'kri0002', 'kri0001', 'kri0005', 'kri0008', 'kri0009', 'kri0010', 'kri0011'].map(card);
    expect(ids(combineCards(order, pairs))).toEqual([['a'], ['kri0004', 'kri0003'], ['kri0001', 'kri0002'], ['kri0005'], ['kri0008', 'kri0009'], ['kri0010', 'kri0011']]);
    const without = order.filter((c) => c.spec.id !== 'kri0003');
    expect(ids(combineCards(without, pairs)).slice(0, 3)).toEqual([['a'], ['kri0004'], ['kri0001', 'kri0002']]);
  });

  it('Combine similar KRI cards, an Admin demo setting: a KRI\'s flag bar has a segment for each flag with sites, as wide as its count, whose hover gives its count of all sites; the line under it gives each flag\'s share and count, No flag only when some site has none', () => {
    const el = { innerHTML: '' };
    const key = () => [...el.innerHTML.matchAll(/<li data-flag="(\w+)">.*?<\/i>(.*?) <span class="v">(.*?)<\/span><\/li>/g)].map((m) => `${m[2]} ${m[3]}`);
    renderKriFlagBar(el, { siteRows: [{ Flag: 0 }, { Flag: -1 }, { Flag: 0 }] });
    const segments = [...el.innerHTML.matchAll(/data-flag="(\w+)" data-count="(\d+)" style="flex-grow: (\d+)" data-tip="([^"]*)"/g)];
    expect(segments.map((m) => [m[1], Number(m[2]), Number(m[3])])).toEqual([['amber', 1, 1], ['green', 2, 2]]);
    expect(segments.map((m) => m[4].replace(/&lt;\/?b&gt;/g, ''))).toEqual(['Amber: 1 of 3 sites (33.3%)', 'Green: 2 of 3 sites (66.7%)']);
    expect(key()).toEqual(['Red 0.0% (0)', 'Amber 33.3% (1)', 'Green 66.7% (2)']);
    renderKriFlagBar(el, { siteRows: [{ Flag: 2 }, { Flag: null }, { Flag: 0 }, { Flag: 0 }] });
    expect(key()).toEqual(['Red 25.0% (1)', 'Amber 0.0% (0)', 'Green 50.0% (2)', 'No flag 25.0% (1)']);
  });
});
