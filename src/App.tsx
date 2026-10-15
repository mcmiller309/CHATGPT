import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, AudioLines, ChevronRight, CircleHelp, Crown, Gift as GiftIcon, LayoutDashboard, Lightbulb, Moon, Play, Radio, RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Zap } from 'lucide-react';
import { actions, colors, gifts, loadMappings, simulationController, type Action, type Gift, type LightingState } from './controller';
import './style.css';
import { hueRequest, type HueLight } from './hue';
const storageKey = 'royalls.gift-mappings.v1';
const emojis: Record<Gift, string> = { Rose: '🌹', 'Finger Heart': '🫰', Galaxy: '🌌', Lion: '🦁' };
function initialMappings() { try { return loadMappings(localStorage.getItem(storageKey)); } catch { return loadMappings(null); } }
export function App() {
  const [state, setState] = useState<LightingState>({ color: 'Purple', effect: 'steady' });
  const [mappings, setMappings] = useState(initialMappings);
  const [selectedGift, setSelectedGift] = useState<Gift>('Rose');
  const [brightness, setBrightness] = useState(80);
  const [logs, setLogs] = useState<{ id: number; message: string; source: string; time: string }[]>([]);
  const [storageWarning, setStorageWarning] = useState(false);
  const [help, setHelp] = useState(false);
  const sequence = useRef(0);
  const [live, setLive] = useState(false);
  const [token, setToken] = useState('');
  const [lights, setLights] = useState<HueLight[]>([]);
  const [lightId, setLightId] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const [connection, setConnection] = useState('Not connected. Simulation is available without Hue.');
  const selectedLight = lights.find(light => light.id === lightId);
  const liveRef = useRef(false);
  useEffect(() => {
    if (!live) return;
    const timer = window.setTimeout(() => { liveRef.current = false; setLive(false); setConnection('Live session expired. Reconnect before enabling physical control again.'); }, 14 * 60_000);
    return () => clearTimeout(timer);
  }, [live]);
  function log(message: string, source: string) {
    setLogs(items => [{ id: ++sequence.current, message, source, time: new Date().toLocaleTimeString([], { hour12: false }) }, ...items].slice(0, 50));
  }
  async function connect() {
    setPending(true);
    try {
      const session = await hueRequest('session');
      setToken(session.token);
      const result = await hueRequest('lights', session.token);
      setLights(result.lights); setLightId(result.lights[0]?.id ?? '');
      setConnection(`Bridge verified · ${result.lights.length} light(s) discovered. No lights changed.`);
    } catch (error) { setConnection(error instanceof Error ? error.message : 'Connection failed'); }
    finally { setPending(false); }
  }
  async function changeMode(enable: boolean) {
    if (!enable) { liveRef.current = false; setLive(false); }
    setPending(true); setConfirmLive(false);
    try {
      await hueRequest('mode', token, { live: enable, ...(enable ? { confirmation: 'ENABLE PHYSICAL CONTROL' } : {}) });
      liveRef.current = enable; setLive(enable);
      log(enable ? 'Physical control enabled' : 'Simulation enabled', 'Mode change');
    } catch (error) { setConnection(error instanceof Error ? error.message : 'Mode change failed'); }
    finally { setPending(false); }
  }
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(mappings)); setStorageWarning(false); } catch { setStorageWarning(true); } }, [mappings]);
  useEffect(() => {
    if (state.effect !== 'flash') return;
    const timer = window.setTimeout(() => setState(s => s.effect === 'flash' ? { ...s, effect: 'steady' } : s), 2400);
    return () => clearTimeout(timer);
  }, [state]);
  async function run(action: Action, source = 'Manual control', level = brightness, brightnessOnly = false) {
    if (pending) return;
    if (liveRef.current) {
      if (!selectedLight) return;
      const command = brightnessOnly ? 'Brightness' : action;
      if (!selectedLight.actions.includes(command)) { setConnection(`${command} is unsupported by this light.`); return; }
      setPending(true);
      try {
        await hueRequest('action', token, { lightId, action: command, brightness: level });
        if (!liveRef.current) return;
        setState(s => simulationController.execute(s, action));
        log(`${command} accepted by Hue · ${selectedLight.name}`, source);
      } catch (error) {
        setConnection(error instanceof Error ? error.message : 'Hue command failed');
        log('Hue command failed; no success confirmed', source);
        liveRef.current = false; setLive(false);
        void hueRequest('mode', token, { live: false }).catch(() => {});
      } finally { setPending(false); }
    } else {
      if (!brightnessOnly) setState(s => simulationController.execute(s, action));
      log(`${brightnessOnly ? `Brightness ${level}%` : action} activated`, source);
    }
  }
  const active = state.effect !== 'blackout' && brightness > 0;
  return <div className="app-shell">
    <aside className="sidebar">
      <a href="#" className="brand" aria-label="Royalls Studio home"><div className="brand-icon"><Crown size={23}/></div><span>ROYALLS<span>STUDIO</span></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation"><a className="nav-item selected" href="#dashboard"><LayoutDashboard size={18}/> Overview <span className="nav-dot"/></a><a className="nav-item" href="#controls"><SlidersHorizontal size={18}/> Light controls</a><a className="nav-item" href="#mappings"><GiftIcon size={18}/> Gift mappings</a><a className="nav-item" href="#activity"><Activity size={18}/> Activity log</a></nav>
      <div className="sidebar-bottom"><div className="safe-icon"><ShieldCheck size={19}/></div><strong>A space to experiment.</strong><p>{live ? 'Physical control is enabled.' : 'Simulation mode is on.'}<br/>{live ? 'Commands affect your selected Hue light.' : 'Your real lights stay untouched.'}</p><button className="help-button" onClick={() => setHelp(!help)}><CircleHelp size={16}/> {help ? 'Hide quick guide' : 'Quick guide'} <ArrowUpRight size={14}/></button>{help && <p>Choose a color or effect, assign gifts, then send a test gift. Flash ends after 2.4 seconds. Pulse continues until another command. Mappings save in this browser.</p>}</div>
      <div className="profile"><div className="avatar">R</div><div>Royalls Studio<small>Creator workspace</small></div><span className="version">V2.0</span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div>Workspace <ChevronRight size={14}/> <span>Lighting controller</span></div><span className="simulation-badge"><span/> {live ? 'Live mode' : 'Simulation mode'}</span></header>
    <main id="dashboard"><div className="page-heading"><div><div className="eyebrow">YOUR STUDIO. YOUR ATMOSPHERE.</div><h1>Lighting overview<span>.</span></h1><p>Turn every moment into a mood.</p></div><div className="local-status"><span/> {live ? 'Hue control enabled' : 'Local simulation'} <small>{live ? selectedLight?.name : 'Physical control disabled'}</small></div></div>
    <section className="panel hue-panel" aria-label="Philips Hue connection">
      <div className="panel-heading"><div><h2><ShieldCheck size={17}/> Philips Hue · Local bridge</h2><p role="status">{connection}</p></div><span className="simulation-badge">{live ? 'PHYSICAL CONTROL' : 'SIMULATION'}</span></div>
      <div className="hue-controls"><button className="effect-button" disabled={pending || live} onClick={connect}>Check bridge & discover lights</button><label>Hue device<select aria-label="Hue device" value={lightId} disabled={pending || live || lights.length === 0} onChange={e => setLightId(e.target.value)}><option value="">Select a light</option>{lights.map(light => <option key={light.id} value={light.id}>{light.name}</option>)}</select></label><button className="primary-button" disabled={pending || (!live && !selectedLight)} onClick={() => live ? void changeMode(false) : setConfirmLive(true)}>{live ? 'Return to simulation' : 'Enable live mode'}</button></div>
      {confirmLive && <div className="live-confirm" role="alertdialog" aria-label="Confirm physical control"><strong>Enable physical control of {selectedLight?.name}?</strong><p>Color, brightness, effects, and test gifts will change this real light. Flash may be uncomfortable for photosensitive viewers. Enabling alone sends no lighting command.</p><button className="primary-button" onClick={() => void changeMode(true)}>I confirm — enable physical control</button><button className="effect-button" onClick={() => setConfirmLive(false)}>Cancel</button></div>}
      {live && <p className="hue-warning">Preview shows the last accepted command, not measured device state. Unsupported actions are disabled. Return to simulation does not restore the light’s previous state.</p>}
    </section>
    <div className="dashboard-grid"><section className="panel studio-panel"><div className="panel-heading"><div><h2><Lightbulb size={17}/> Studio preview</h2><p>A live look at your virtual lighting setup</p></div><span className="live-tag"><span/> COMMAND PREVIEW</span></div>
      <div className={`studio-scene ${state.effect}`} style={{ '--light': colors[state.color], '--intensity': active ? brightness / 100 : 0 } as React.CSSProperties} aria-label={`${live ? 'Hue command preview' : 'Simulated studio'}: ${active ? state.color : 'off'}, ${state.effect}, brightness ${brightness}%`}>
        <div className="scene-grid"/><div className="wall-wash"/><div className="ceiling-line"/><div className="wall-panel panel-a"/><div className="wall-panel panel-b"/><div className="wall-panel panel-c"/><div className="neon-mark">R<span>ROYALLS STUDIO</span></div><div className="light-bar left-bar"/><div className="light-bar right-bar"/><div className="desk"><div className="monitor"><div/><span/></div><div className="speaker sp-left"/><div className="speaker sp-right"/><div className="desk-top"/><div className="desk-leg leg-left"/><div className="desk-leg leg-right"/></div><div className="floor-glow"/>
        <span className="scene-label"><Radio size={12}/> {live ? 'HUE COMMAND PREVIEW' : 'VIRTUAL STUDIO / 01'}</span><span className="scene-color"><span style={{ background: active ? colors[state.color] : '#555' }}/>{active ? state.color : 'Lights off'}</span>
      </div>
      <div className="light-stats">{['Key light', 'Ambient strips', 'Accent light'].map((label, i) => <div key={label}><span className="stat-light"><Lightbulb size={16}/></span><div>{label}<small><span className={active ? 'status-dot' : 'status-dot off'}/>{active ? 'On' : 'Off'} · {live ? 'Virtual preview' : 'Simulated'}</small></div><span className="light-number">0{i + 1}</span></div>)}</div>
    </section>
    <section className="panel controls-panel" id="controls"><div className="panel-heading"><div><h2><SlidersHorizontal size={17}/> Light controls</h2><p>Set the tone in a single tap</p></div><Settings2 size={17} className="muted"/></div><div className="control-body"><div className="section-label">COLOR PALETTE <span>{state.color}</span></div><div className="color-options">{Object.entries(colors).map(([name, color]) => <button key={name} className={`color-button ${state.color === name && state.effect !== 'blackout' ? 'active' : ''}`} disabled={pending || (live && !selectedLight?.actions.includes(name as Action))} onClick={() => run(name as Action)} aria-pressed={state.color === name && state.effect !== 'blackout'}><span style={{ '--swatch': color } as React.CSSProperties}/><small>{name === 'Warm white' ? 'Warm' : name}</small></button>)}</div><div className="brightness-label"><label htmlFor="brightness">Brightness</label><span>{brightness}%</span></div><input id="brightness" aria-label="Brightness" type="range" min="0" max="100" disabled={pending || (live && !selectedLight?.actions.includes('Brightness'))} onPointerUp={() => { if (live) void run(state.color, 'Brightness control', brightness, true); }} onKeyUp={e => { if (live && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) void run(state.color, 'Brightness control', brightness, true); }} value={brightness} onChange={e => setBrightness(Number(e.target.value))}/><div className="range-labels"><span>Subtle</span><span>Full glow</span></div><div className="effects-label section-label">QUICK EFFECTS</div><div className="effect-options">{([{ name: 'Flash', icon: Zap }, { name: 'Pulse', icon: AudioLines }, { name: 'Blackout', icon: Moon }] as const).map(({ name, icon: Icon }) => <button key={name} className={state.effect === name.toLowerCase() ? 'effect-button active' : 'effect-button'} disabled={pending || (live && !selectedLight?.actions.includes(name))} onClick={() => run(name)} aria-pressed={state.effect === name.toLowerCase()}><Icon size={20}/>{name}</button>)}</div><div className="control-note"><ShieldCheck size={14}/> {live ? 'Commands affect your selected real Hue light.' : 'Preview only. Physical control is disabled.'}</div></div></section>
    <section className="panel mappings-panel" id="mappings"><div className="panel-heading"><div><h2><GiftIcon size={17}/> Gift-to-light mappings</h2><p>A little appreciation. A whole new atmosphere.</p></div><span className="count-tag">4 mappings</span></div><div className="mapping-table"><div className="table-head"><span>TIKTOK GIFT</span><span>LIGHTING ACTION</span></div>{gifts.map(gift => <div className="mapping-row" key={gift}><div><span className="gift-emoji">{emojis[gift]}</span><span>{gift}<small>Simulated gift</small></span></div><label className="mapping-select"><span className="sr-only">Lighting action for {gift}</span><select value={mappings[gift]} onChange={e => setMappings(m => ({ ...m, [gift]: e.target.value as Action }))}>{actions.map(action => <option key={action}>{action}</option>)}</select></label></div>)}</div><div className="mapping-footer"><span className="status-dot"/>{storageWarning ? 'Browser storage unavailable; mappings last this session' : 'Mappings saved automatically in this browser'}</div></section>
    <div className="right-stack"><section className="panel test-panel"><div className="test-title"><span className="test-icon"><Sparkles size={19}/></span><div><h2>Make a little magic</h2><p>See your gift mappings in action.</p></div></div><label className="section-label" htmlFor="test-gift">SIMULATE A TIKTOK GIFT</label><div className="test-controls"><select id="test-gift" value={selectedGift} onChange={e => setSelectedGift(e.target.value as Gift)}>{gifts.map(g => <option key={g} value={g}>{emojis[g]} {g}</option>)}</select><button className="primary-button" disabled={pending || (live && !selectedLight?.actions.includes(mappings[selectedGift]))} onClick={() => run(mappings[selectedGift], `Test gift · ${selectedGift}`)}><Play size={14} fill="currentColor"/> Send test gift</button></div><p className="test-caption"><ArrowDownRight size={13}/> Triggers <strong>{mappings[selectedGift]}</strong> {live ? 'on your selected Hue light' : 'in your virtual studio'}</p></section>
    <section className="panel activity-panel" id="activity"><div className="panel-heading"><h2><Activity size={17}/> Activity log <span className="log-count">{logs.length}</span></h2><button className="icon-button" aria-label="Clear activity log" title="Clear activity log" onClick={() => setLogs([])}><RotateCcw size={14}/></button></div><div className="activity-list" role="log" aria-live="polite" aria-relevant="additions">{logs.length === 0 ? <div className="empty-log"><span><Activity size={20}/></span><p>The stage is yours.</p><small>Change a light or send a gift to get started.</small></div> : logs.map(log => <div className="log-entry" key={log.id}><span className="log-dot"/><div><strong>{log.message}</strong><small>{log.source}</small></div><time>{log.time}</time></div>)}</div></section></div>
    </div><footer><span><Crown size={13}/> ROYALLS STUDIO <span className="footer-divider">/</span> Built for the moments that matter.</span><span>{live ? 'LIVE' : 'SIMULATION'} V2.0 <span className="status-dot"/></span></footer></main></div>
  </div>;
}
