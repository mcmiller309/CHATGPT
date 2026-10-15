import { describe, it, expect } from 'vitest';
import { simulationController, triggerGift, defaultMappings, loadMappings, type LightingState } from './controller';
const state: LightingState = { color: 'Purple', effect: 'steady' };
describe('simulation controller', () => {
  it('applies gift mappings and respects edited assignments', () => {
    expect(triggerGift(state, defaultMappings, 'Rose')).toEqual({ color: 'Red', effect: 'steady' });
    expect(triggerGift(state, { ...defaultMappings, Rose: 'Blackout' }, 'Rose').effect).toBe('blackout');
  });
  it('keeps the selected color during effects and restores it with a color command', () => {
    for (const action of ['Flash', 'Pulse', 'Blackout'] as const) {
      const next = simulationController.execute(state, action);
      expect(next.color).toBe('Purple');
      expect(simulationController.execute(next, 'Blue')).toEqual({ color: 'Blue', effect: 'steady' });
    }
    expect(state.effect).toBe('steady');
  });
  it('recovers invalid stored mappings and preserves valid assignments', () => {
    expect(loadMappings('broken')).toEqual(defaultMappings);
    expect(loadMappings('null')).toEqual(defaultMappings);
    expect(loadMappings('{"Rose":"Blackout","Lion":"unknown"}')).toEqual({ ...defaultMappings, Rose: 'Blackout' });
  });
});
