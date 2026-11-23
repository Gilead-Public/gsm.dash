import { describe, it, expect } from 'vitest';
import { readAdmin, writeAdmin } from '../src/app/admin-settings.js';

describe('the Admin panel\'s settings in the address (#46)', () => {
  const defaults = { theme: 'auto', perrow: '4', cfgpanel: 'popover', legend: 'off' };

  it('46.01: reads each setting, its default when missing or unknown (#46)', () => {
    expect(readAdmin(new URLSearchParams(''))).toEqual(defaults);
    expect(readAdmin(new URLSearchParams('theme=dark&perrow=2&cfgpanel=side&legend=on'))).toEqual({ theme: 'dark', perrow: '2', cfgpanel: 'side', legend: 'on' });
    expect(readAdmin(new URLSearchParams('theme=pink&perrow=9&cfgpanel=left&legend=1'))).toEqual(defaults);
  });

  it('46.01: rewrites only its own settings, leaving every other param as it was (#46)', () => {
    const params = new URLSearchParams('group=phase&collapse=P1&filter.study=STUDY001&theme=light&hide=a&hide=b');
    writeAdmin(params, { ...defaults, perrow: '6', legend: 'on' });
    expect([...params]).toEqual([['group', 'phase'], ['collapse', 'P1'], ['filter.study', 'STUDY001'], ['hide', 'a'], ['hide', 'b'], ['perrow', '6'], ['legend', 'on']]);
    writeAdmin(params, defaults);
    expect(params.toString()).toBe('group=phase&collapse=P1&filter.study=STUDY001&hide=a&hide=b');
  });
});
