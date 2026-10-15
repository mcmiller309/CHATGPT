// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
afterEach(() => { cleanup(); localStorage.clear(); });
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
