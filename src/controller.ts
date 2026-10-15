export const colors = { Red: '#ff4466', Blue: '#4285ff', Purple: '#a879ff', Green: '#45dfa7', 'Warm white': '#ffda9c' } as const;
export type Color = keyof typeof colors;
export const actions = [...Object.keys(colors), 'Flash', 'Pulse', 'Blackout'] as Action[];
export type Action = Color | 'Flash' | 'Pulse' | 'Blackout';
export type LightingState = { color: Color; effect: 'steady' | 'flash' | 'pulse' | 'blackout' };
export interface LightingController { execute(state: LightingState, action: Action): LightingState }
// Pure simulation adapter. Future authenticated localhost API calls belong in a separate adapter.
export const simulationController: LightingController = {
  execute(state, action) {
    if (action in colors) return { color: action as Color, effect: 'steady' };
    return { ...state, effect: action.toLowerCase() as LightingState['effect'] };
  },
};
export const gifts = ['Rose', 'Finger Heart', 'Galaxy', 'Lion'] as const;
export type Gift = typeof gifts[number];
export type Mappings = Record<Gift, Action>;
export const defaultMappings: Mappings = { Rose: 'Red', 'Finger Heart': 'Pulse', Galaxy: 'Purple', Lion: 'Flash' };
export function loadMappings(raw: string | null): Mappings {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (!parsed || typeof parsed !== 'object') return { ...defaultMappings };
    return Object.fromEntries(gifts.map(gift => {
      const value = (parsed as Record<string, unknown>)[gift];
      return [gift, actions.includes(value as Action) ? value : defaultMappings[gift]];
    })) as Mappings;
  } catch { return { ...defaultMappings }; }
}
export function triggerGift(state: LightingState, mappings: Mappings, gift: Gift) {
  return simulationController.execute(state, mappings[gift]);
}
