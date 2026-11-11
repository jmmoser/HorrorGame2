// DOM interface: HUD, notes, menus, title cards.
import { NOTES } from './story.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), cross: $('crosshair'), prompt: $('prompt'), promptText: $('prompt-text'), objective: $('objective'),
      hint: $('hint'), subtitle: $('subtitle'), fuses: $('fuses'), battery: $('battery'), batteryFill: $('battery-fill'),
      stamina: $('stamina'), staminaFill: $('stamina-fill'), card: $('card'), cardText: $('card-text'), resumeTip: $('resume-tip'),
      touch: $('touch'),
    };
    this.screens = {};
    for (const n of ['loading', 'warning', 'menu', 'pause', 'settings', 'how', 'death', 'ending', 'note']) this.screens[n] = $('screen-' + n);
    this._prompt = null; this._hintT = 0; this._subT = 0; this._objT = 0;
    this.noteOpen = null; this.onNoteClose = null;
    this._bat = -1; this._sta = -1;
  }

  show(name) { for (const k in this.screens) this.screens[k].hidden = k !== name; }
  hideAll() { for (const k in this.screens) this.screens[k].hidden = true; }
  isOpen(name) { return !this.screens[name].hidden; }
  hud(on) { this.el.hud.hidden = !on; }

  loading(p, text) { $('load-fill').style.width = Math.round(p * 100) + '%'; if (text) $('load-text').textContent = text; }

  prompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    if (text) { this.el.promptText.textContent = text; this.el.prompt.classList.add('on'); this.el.cross.classList.add('on'); }
    else { this.el.prompt.classList.remove('on'); this.el.cross.classList.remove('on'); }
  }

  objective(text) {
    const o = this.el.objective;
    o.classList.remove('on', 'rest');
    setTimeout(() => { o.textContent = text; o.classList.add('on'); }, 500);
    this._objT = 9;
  }

  hint(text, dur = 4) { this.el.hint.textContent = text; this.el.hint.classList.add('on'); this._hintT = dur; }
  subtitle(text, dur = 3.5) { this.el.subtitle.textContent = text; this.el.subtitle.classList.add('on'); this._subT = dur; }

  setFuses(n) {
    this.el.fuses.hidden = false;
    [...this.el.fuses.children].forEach((c, i) => c.classList.toggle('on', i < n));
  }
  setBattery(v, has) {
    if (!has) return;
    this.el.battery.hidden = false;
    const q = Math.round(v * 50);
    if (q !== this._bat) { this._bat = q; this.el.batteryFill.style.width = v * 100 + '%'; this.el.battery.classList.toggle('low', v < 0.15); }
  }
  setStamina(v) {
    const q = Math.round(v * 50);
    if (q !== this._sta) { this._sta = q; this.el.staminaFill.style.width = v * 100 + '%'; this.el.stamina.classList.toggle('on', v < 0.98); }
  }

  // Text over black. lines: array of html strings shown one after another.
  card(lines, each = 2.6, done) {
    const c = this.el.card, t = this.el.cardText;
    c.hidden = false;
    let i = 0;
    const next = () => {
      if (i >= lines.length) { t.classList.remove('on'); setTimeout(() => { c.hidden = true; if (done) done(); }, 1200); return; }
      t.classList.remove('on');
      setTimeout(() => { t.innerHTML = lines[i++]; t.classList.add('on'); setTimeout(next, each * 1000); }, i === 0 ? 50 : 1300);
    };
    next();
  }

  showNote(id, onClose) {
    const n = NOTES[id];
    if (!n) return;
    $('note-title').textContent = n.title;
    const b = $('note-body'); b.textContent = n.body; b.className = n.style;
    this.screens.note.hidden = false;
    $('note-paper').scrollTop = 0;
    this.noteOpen = id; this.onNoteClose = onClose;
  }
  closeNote() {
    if (!this.noteOpen) return;
    const id = this.noteOpen, cb = this.onNoteClose;
    this.noteOpen = null; this.onNoteClose = null;
    this.screens.note.hidden = true;
    if (cb) cb(id);
  }

  update(dt) {
    if (this._hintT > 0) { this._hintT -= dt; if (this._hintT <= 0) this.el.hint.classList.remove('on'); }
    if (this._subT > 0) { this._subT -= dt; if (this._subT <= 0) this.el.subtitle.classList.remove('on'); }
    if (this._objT > 0) { this._objT -= dt; if (this._objT <= 0) this.el.objective.classList.add('rest'); }
  }
}
