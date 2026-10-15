// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { hueRequest } from './hue';
vi.mock('./hue', () => ({ hueRequest: vi.fn() }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });
describe('dashboard interactions', () => {
  it('changes simulated colors, runs blackout, and restores lighting', async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole('button', { name: 'Blue' }));
    expect(screen.getByLabelText(/Simulated studio:/).getAttribute('aria-label')).toContain('Blue, steady');
    await user.click(screen.getByRole('button', { name: 'Blackout' }));
    expect(screen.getByLabelText(/Simulated studio:/).getAttribute('aria-label')).toContain('off, blackout');
    await user.click(screen.getByRole('button', { name: 'Green' }));
    expect(screen.getByLabelText(/Simulated studio:/).getAttribute('aria-label')).toContain('Green, steady');
    expect(screen.getByRole('log').textContent).toContain('Blackout activated');
  });
  it('saves a gift assignment, triggers it, and clears activity', async () => {
    const user = userEvent.setup(); const view = render(<App/>);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lighting action for Rose' }), 'Pulse');
    await waitFor(() => expect(JSON.parse(localStorage.getItem('royalls.gift-mappings.v1')!).Rose).toBe('Pulse'));
    await user.click(screen.getByRole('button', { name: 'Send test gift' }));
    expect(screen.getByLabelText(/Simulated studio:/).getAttribute('aria-label')).toContain('pulse');
    expect(screen.getByRole('log').textContent).toContain('Test gift · Rose');
    await user.click(screen.getByRole('button', { name: 'Clear activity log' }));
    expect(screen.getByRole('log').textContent).toContain('The stage is yours.');
    view.unmount(); render(<App/>);
    expect((screen.getByRole('combobox', { name: 'Lighting action for Rose' }) as HTMLSelectElement).value).toBe('Pulse');
  });
});

describe('Hue mode safety (mock backend)', () => {
  it('defaults to simulation, requires confirmation, and routes gift commands through backend only in live mode', async () => {
    const api = vi.mocked(hueRequest);
    api.mockImplementation(async (path, _token, body) => {
      if (path === 'session') return { token: 'mock-session' };
      if (path === 'lights') return { lights: [{ id: 'desk-id', name: 'Desk Hue', actions: ['Red', 'Blackout', 'Brightness'] }] };
      if (path === 'mode') return { live: (body as { live: boolean }).live };
      return { accepted: true };
    });
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole('button', { name: 'Red' }));
    expect(api).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Check bridge & discover lights' }));
    expect(screen.getByRole('combobox', { name: 'Hue device' }).textContent).toContain('Desk Hue');
    await user.click(screen.getByRole('button', { name: 'Enable live mode' }));
    expect(api.mock.calls.filter(([path]) => path === 'mode')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Enable live mode' }));
    await user.click(screen.getByRole('button', { name: 'I confirm — enable physical control' }));
    expect(api).toHaveBeenCalledWith('mode', 'mock-session', { live: true, confirmation: 'ENABLE PHYSICAL CONTROL' });
    expect((screen.getByRole('button', { name: 'Pulse' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Send test gift' }));
    expect(api).toHaveBeenCalledWith('action', 'mock-session', { lightId: 'desk-id', action: 'Red', brightness: 80 });
    expect(screen.getByRole('log').textContent).toContain('Red accepted by Hue');
    await user.click(screen.getByRole('button', { name: 'Return to simulation' }));
    const writes = api.mock.calls.filter(([path]) => path === 'action').length;
    await user.click(screen.getByRole('button', { name: 'Blue' }));
    expect(api.mock.calls.filter(([path]) => path === 'action')).toHaveLength(writes);
  });
  it('reports discovery failure without enabling physical control', async () => {
    vi.mocked(hueRequest).mockRejectedValue(new Error('Trusted certificate required'));
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole('button', { name: 'Check bridge & discover lights' }));
    expect(screen.getByRole('status').textContent).toContain('Trusted certificate required');
    expect((screen.getByRole('button', { name: 'Enable live mode' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
