/* Financial Record: money in & out, monthly bills (fixed, instalments, credit cards) and debts, stored on this device.
   Amounts are stored as integer cents to avoid floating-point rounding errors. Months are 'YYYY-MM' strings. */
(function () {
  'use strict';

  const STORE_KEY = 'tallybook.v1';
  const PREF_KEY = 'tallybook.prefs';
  const CURRENCIES = ['MYR', 'SGD', 'IDR', 'PHP', 'THB', 'VND', 'BND', 'CNY', 'HKD', 'TWD', 'JPY', 'KRW', 'INR', 'AUD', 'NZD', 'USD', 'EUR', 'GBP', 'AED', 'SAR'];
  const REGION_CURRENCY = { MY: 'MYR', SG: 'SGD', ID: 'IDR', PH: 'PHP', TH: 'THB', VN: 'VND', BN: 'BND', CN: 'CNY', HK: 'HKD', TW: 'TWD', JP: 'JPY', KR: 'KRW', IN: 'INR', AU: 'AUD', NZ: 'NZD', US: 'USD', GB: 'GBP', AE: 'AED', SA: 'SAR', DE: 'EUR', FR: 'EUR', NL: 'EUR', IE: 'EUR', ES: 'EUR', IT: 'EUR' };

  // [name, icon, hue]
  const CATS = {
    expense: [
      ['Food', '🍜', 22], ['Drinks', '🧋', 32], ['Groceries', '🛒', 100], ['Transport', '🚗', 210], ['Petrol', '⛽', 4],
      ['Shopping', '🛍️', 320], ['Rent', '🏠', 262], ['Utilities', '💡', 48], ['Phone & internet', '📱', 192], ['Insurance', '🛡️', 230],
      ['Installment', '📆', 275], ['Credit card', '💳', 250], ['Health', '💊', 150], ['Family', '👨‍👩‍👧', 340], ['Education', '📚', 205],
      ['Entertainment', '🎬', 285], ['Travel', '✈️', 182], ['Angpao & gifts', '🧧', 356], ['Charity', '🤲', 165], ['Other', '📦', 35],
    ],
    income: [
      ['Salary', '💼', 160], ['Business', '🏪', 30], ['Freelance', '💻', 210], ['Bonus', '🎉', 45], ['Investment', '📈', 140],
      ['Angpao & gifts', '🧧', 356], ['Refund', '↩️', 192], ['Other', '💰', 50],
    ],
  };
  const CAT_INDEX = {};
  for (const list of [CATS.expense, CATS.income]) for (const [n, icon, hue] of list) if (!CAT_INDEX[n]) CAT_INDEX[n] = { icon, hue };
  // Names used by version 1 of the app
  Object.assign(CAT_INDEX, { Bills: CAT_INDEX.Utilities, Fun: CAT_INDEX.Entertainment, Gift: CAT_INDEX['Angpao & gifts'] });
  const catInfo = (name) => CAT_INDEX[name] || { icon: '📦', hue: 220 };
  const KIND = {
    card: { label: 'Credit card', plural: 'Credit cards', icon: '💳', hue: 250 },
    installment: { label: 'Instalment', plural: 'Instalments', icon: '📆', hue: 275 },
    fixed: { label: 'Fixed monthly', plural: 'Fixed monthly expenses', icon: '🔁', hue: 22 },
  };

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayISO = () => isoOf(new Date());
  const monthOf = (iso) => iso.slice(0, 7);
  const thisMonth = () => monthOf(todayISO());
  const addMonths = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const monthDiff = (a, b) => { const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + (bm - am); };
  const daysInMonth = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
  const daysUntil = (iso) => Math.round((new Date(iso + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000);
  const toCents = (str) => { const n = Number(String(str ?? '').replace(/[^0-9.\-]/g, '')); return String(str ?? '').trim() !== '' && Number.isFinite(n) ? Math.round(n * 100) : NaN; };
  const centsToInput = (c) => (c / 100).toFixed(2).replace(/\.00$/, '');
  const fmtDate = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, opts);
  const fmtMonth = (key, long = true) => new Date(key + '-01T00:00:00').toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short' });
  const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const nameHue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360; return h; };
  const icoTile = (icon, hue, cls = '') => `<span class="ico ${cls}" style="--h:${hue}" aria-hidden="true">${icon}</span>`;
  const catTile = (name, cls) => { const c = catInfo(name); return icoTile(c.icon, c.hue, cls); };

  let prefs = { hide: false };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch (e) { /* ignore */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  let formatter = null, compact = null;
  function setFormatters() {
    try { formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: state.currency, currencyDisplay: 'narrowSymbol' }); }
    catch (e) { formatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  }
  const money = (cents, signed = false) => {
    if (prefs.hide) return '••••';
    const s = formatter.format(Math.abs(cents) / 100);
    if (signed) return (cents < 0 ? '−' : '+') + s;
    return cents < 0 ? '−' + s : s;
  };
  const short = (cents) => (prefs.hide ? '••' : compact.format(cents / 100));
  const currencySymbol = () => { try { return formatter.formatToParts(0).find((p) => p.type === 'currency')?.value || state.currency; } catch (e) { return state.currency; } };

  function defaultCurrency() {
    try {
      const loc = new Intl.Locale(navigator.language || 'en-US').maximize();
      return REGION_CURRENCY[loc.region] || 'USD';
    } catch (e) { return 'USD'; }
  }
  function firstDayOfWeek() {
    try { const l = new Intl.Locale(navigator.language || 'en'); const w = l.getWeekInfo ? l.getWeekInfo() : l.weekInfo; if (w && w.firstDay) return w.firstDay % 7; } catch (e) { /* ignore */ }
    return 1; // Monday
  }

  // ---------- storage ----------
  function emptyState(currency) { return { version: 2, currency: currency || defaultCurrency(), transactions: [], debts: [], bills: [], sample: false }; }
  function normalize(s) {
    const base = emptyState();
    if (!s || typeof s !== 'object') return base;
    return {
      ...base, ...s, version: 2,
      transactions: Array.isArray(s.transactions) ? s.transactions : [],
      debts: Array.isArray(s.debts) ? s.debts.map((x) => ({ ...x, payments: Array.isArray(x.payments) ? x.payments : [] })) : [],
      bills: Array.isArray(s.bills) ? s.bills.map((b) => ({ ...b, payments: Array.isArray(b.payments) ? b.payments : [], statements: b.statements && typeof b.statements === 'object' ? b.statements : {} })) : [],
    };
  }
  function sampleState() {
    const s = emptyState();
    s.sample = true;
    const cur = thisMonth(), today = todayISO(), tdy = Number(today.slice(8));
    const T = (type, amount, category, date, note, extra) => { const t = { id: uid(), type, amount, category, date, note, ex: true, ...extra }; s.transactions.push(t); return t; };
    const pastDay = (key, day) => { const iso = key + '-' + pad(Math.min(day, daysInMonth(key))); return iso > today ? today : iso; };
    const bill = (b) => { const full = { id: uid(), ex: true, payments: [], statements: {}, note: '', ...b }; s.bills.push(full); return full; };
    const pay = (b, month, amount, day) => {
      const date = pastDay(month, day);
      const t = T('expense', amount, b.kind === 'card' ? 'Credit card' : b.category, date, b.name + ' · ' + fmtMonth(month, false), { billId: b.id });
      b.payments.push({ id: uid(), month, amount, date, txId: t.id });
    };

    for (let i = 3; i >= 0; i--) {
      const m = addMonths(cur, -i);
      T('income', 520000, 'Salary', pastDay(m, 25), 'Salary ' + fmtMonth(m, false));
      if (i === 0 || i === 2) T('income', 60000, 'Freelance', pastDay(m, 10), 'Design side job');
      T('expense', 16000 + i * 900, 'Groceries', pastDay(m, 6), 'Weekly groceries');
      T('expense', 4580, 'Food', pastDay(m, 3), 'Nasi lemak & teh tarik');
      T('expense', 9000, 'Petrol', pastDay(m, 12), 'Full tank');
      T('expense', 1290, 'Drinks', pastDay(m, 14), 'Bubble tea');
      if (i === 1) T('expense', 50000, 'Angpao & gifts', pastDay(m, 18), 'Wedding angpao');
      if (i === 2) T('expense', 32000, 'Shopping', pastDay(m, 20), '11.11 sale');
    }
    T('expense', 8800, 'Family', pastDay(cur, 2), 'Dinner with parents');
    T('expense', 3500, 'Transport', pastDay(cur, tdy), 'Grab to office');

    const rent = bill({ kind: 'fixed', name: 'House rent', category: 'Rent', amount: 120000, dueDay: 1, startMonth: addMonths(cur, -6) });
    const phone = bill({ kind: 'fixed', name: 'Phone & home fibre', category: 'Phone & internet', amount: 15800, dueDay: Math.min(28, tdy + 3), startMonth: addMonths(cur, -6) });
    const ins = bill({ kind: 'fixed', name: 'Medical insurance', category: 'Insurance', amount: 22000, dueDay: 28, startMonth: addMonths(cur, -6) });
    const stream = bill({ kind: 'fixed', name: 'Netflix + Spotify', category: 'Entertainment', amount: 7300, dueDay: Math.max(1, tdy - 4), startMonth: addMonths(cur, -6) });
    const car = bill({ kind: 'installment', name: 'Car loan', category: 'Transport', amount: 68500, dueDay: 7, startMonth: addMonths(cur, -20), months: 108, prePaid: 17 });
    const epp = bill({ kind: 'installment', name: 'Phone 0% instalment', category: 'Phone & internet', amount: 24900, dueDay: 15, startMonth: addMonths(cur, -3), months: 12, prePaid: 0 });
    const card = bill({ kind: 'card', name: 'Visa Platinum', dueDay: Math.min(28, tdy + 6), startMonth: addMonths(cur, -3), limit: 1500000, minPct: 5, minFloor: 5000 });

    for (let i = 3; i >= 1; i--) {
      const m = addMonths(cur, -i);
      for (const b of [rent, phone, ins, stream]) pay(b, m, b.amount, b.dueDay);
      if (i <= 3 && monthDiff(car.startMonth, m) >= car.prePaid) pay(car, m, car.amount, 6);
      pay(epp, m, epp.amount, 14);
      card.statements[m] = [128450, 96320, 143780][3 - i];
      pay(card, m, card.statements[m], card.dueDay - 1);
    }
    pay(rent, cur, rent.amount, 1);
    pay(stream, cur, stream.amount, stream.dueDay);
    card.statements[cur] = 186540;

    s.debts.push(
      { id: uid(), ex: true, person: 'Ahmad', direction: 'owed', amount: 50000, date: addDays(today, -40), due: addDays(today, 5), note: 'Lent for car repair', payments: [{ id: uid(), amount: 20000, date: addDays(today, -10), note: 'DuitNow transfer' }] },
      { id: uid(), ex: true, person: 'Mei Ling', direction: 'owe', amount: 30000, date: addDays(today, -12), due: addDays(today, -1), note: 'Concert tickets', payments: [] },
      { id: uid(), ex: true, person: 'Kak Ros', direction: 'owe', amount: 200000, date: addDays(today, -90), due: '', note: 'Kutu / tontine share', payments: [{ id: uid(), amount: 50000, date: addDays(today, -60), note: '' }, { id: uid(), amount: 50000, date: addDays(today, -30), note: '' }] },
    );
    return s;
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // Version 1 example data had no monthly bills: show the newer examples instead.
        if (saved && saved.sample && !Array.isArray(saved.bills)) return sampleState();
        return normalize(saved);
      }
    } catch (e) { /* storage blocked or corrupt */ }
    return sampleState();
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { toast('Could not save on this device. Storage may be full or blocked.'); }
    render();
  }

  // ---------- bill maths ----------
  const findBill = (id) => state.bills.find((b) => b.id === id);
  const dueDate = (b, key) => key + '-' + pad(Math.min(b.dueDay, daysInMonth(key)));
  function billActiveIn(b, key) {
    if (key < b.startMonth) return false;
    if (b.kind === 'installment') return monthDiff(b.startMonth, key) < b.months;
    return true;
  }
  const prePaidMonth = (b, key) => b.kind === 'installment' && monthDiff(b.startMonth, key) < (b.prePaid || 0);
  const paidIn = (b, key) => sum(b.payments.filter((p) => p.month === key), (p) => p.amount);
  function dueAmount(b, key) {
    if (prePaidMonth(b, key)) return b.amount;
    if (b.kind === 'card') return b.statements[key] ?? null;
    return b.amount;
  }
  function minDue(b, key) {
    const s = dueAmount(b, key);
    if (s == null) return null;
    return Math.min(s, Math.max(Math.round(s * (b.minPct ?? 5) / 100), b.minFloor || 0));
  }
  function leftToPay(b, key) {
    if (prePaidMonth(b, key)) return 0;
    const d = dueAmount(b, key);
    return d == null ? 0 : Math.max(0, d - paidIn(b, key));
  }
  function billStatus(b, key) {
    if (prePaidMonth(b, key)) return { code: 'paid', label: 'Paid' };
    const due = dueAmount(b, key), paid = paidIn(b, key);
    if (due != null && paid >= due) return { code: 'paid', label: due === 0 ? 'Nothing due' : 'Paid' };
    if (due == null && paid > 0) return { code: 'paid', label: 'Paid' };
    const n = daysUntil(dueDate(b, key));
    if (b.kind === 'card' && due != null && paid > 0 && paid >= minDue(b, key)) return { code: 'min', label: 'Min. paid' };
    if (n < 0) return { code: 'overdue', label: paid > 0 ? 'Part paid · late' : `${-n} day${n === -1 ? '' : 's'} late` };
    if (paid > 0) return { code: 'partial', label: 'Part paid' };
    if (b.kind === 'card' && due == null) return { code: 'todo', label: 'Add statement' };
    if (n === 0) return { code: 'soon', label: 'Due today' };
    if (n <= 5) return { code: 'soon', label: `Due in ${n} day${n === 1 ? '' : 's'}` };
    return { code: 'upcoming', label: 'Due ' + fmtDate(dueDate(b, key), { day: 'numeric', month: 'short' }) };
  }
  function installmentProgress(b) {
    const paidTotal = sum(b.payments, (p) => p.amount);
    const total = b.amount * b.months;
    const paidMonths = Math.min(b.months, (b.prePaid || 0) + Math.floor(paidTotal / b.amount));
    const balance = Math.max(0, total - (b.prePaid || 0) * b.amount - paidTotal);
    return { paidMonths, balance, total, endMonth: addMonths(b.startMonth, b.months - 1) };
  }
  function billsForMonth(key) {
    const list = state.bills.filter((b) => billActiveIn(b, key));
    const total = sum(list, (b) => dueAmount(b, key) ?? 0);
    const left = sum(list, (b) => leftToPay(b, key));
    const overdue = list.filter((b) => billStatus(b, key).code === 'overdue').length;
    return { list, total, left, paid: total - left, overdue };
  }
  function billSub(b, key) {
    const parts = ['Due ' + ordinal(Math.min(b.dueDay, daysInMonth(key)))];
    if (b.kind === 'installment') parts.push(`${Math.min(b.months, monthDiff(b.startMonth, key) + 1)} of ${b.months}`);
    if (b.kind === 'card' && dueAmount(b, key) != null && leftToPay(b, key) > 0) parts.push('Min ' + money(minDue(b, key)));
    if (b.kind === 'fixed') parts.push(b.category);
    return parts.join(' · ');
  }
  const billTile = (b, cls) => (b.kind === 'card' ? icoTile(KIND.card.icon, KIND.card.hue, cls) : catTile(b.category, cls));

  // ---------- other derived numbers ----------
  const debtPaid = (d) => sum(d.payments, (p) => p.amount);
  const debtLeft = (d) => Math.max(0, d.amount - debtPaid(d));
  const debtSettled = (d) => debtLeft(d) === 0;
  const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1);
  function monthTotals(key) {
    let inn = 0, out = 0;
    for (const t of state.transactions) if (monthOf(t.date) === key) { if (t.type === 'income') inn += t.amount; else out += t.amount; }
    return { inn, out };
  }

  // ---------- UI state & routing ----------
  const ui = { view: 'home', recMonth: thisMonth(), recMode: 'list', recType: 'all', recSearch: '', recDay: '', billMonth: thisMonth(), debtTab: 'owe' };
  const VIEWS = ['home', 'records', 'bills', 'debts', 'more'];
  const LEGACY = { overview: 'home', transactions: 'records' };

  function route() {
    let h = location.hash.replace('#', '');
    h = LEGACY[h] || h;
    ui.view = VIEWS.includes(h) ? h : 'home';
    for (const v of VIEWS) $('#view-' + v).hidden = v !== ui.view;
    document.querySelectorAll('[data-view]').forEach((a) => {
      if (a.dataset.view === ui.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    setFormatters();
    $('#sample-banner').hidden = !state.sample;
    $('#toggle-hide').setAttribute('aria-pressed', String(prefs.hide));
    $('#toggle-hide').setAttribute('aria-label', prefs.hide ? 'Show amounts' : 'Hide amounts');
    ({ home: renderHome, records: renderRecords, bills: renderBills, debts: renderDebts, more: renderMore })[ui.view]();
  }

  // ---------- shared row templates ----------
  function txRow(t) {
    const cls = t.type === 'income' ? 'in' : 'out';
    return `<button type="button" class="item" data-edit-tx="${esc(t.id)}">
      ${catTile(t.category)}
      <span class="txt"><span class="title">${esc(t.note || t.category)}</span>
      <span class="sub">${esc(t.category)}${t.billId ? ' · Monthly bill' : ''} · ${esc(fmtDate(t.date, { day: 'numeric', month: 'short' }))}</span></span>
      <span class="end"><span class="amt ${cls}">${money(t.type === 'income' ? t.amount : -t.amount, true)}</span></span>
    </button>`;
  }
  function billRow(b, key) {
    const st = billStatus(b, key);
    const due = dueAmount(b, key);
    const showPay = st.code !== 'paid' && !prePaidMonth(b, key);
    return `<div class="bill">
      <button type="button" class="open" data-open-bill="${esc(b.id)}" data-month="${key}">
        ${billTile(b)}
        <span class="txt"><span class="title">${esc(b.name)}</span><span class="sub">${esc(billSub(b, key))}</span></span>
      </button>
      <span class="end">
        <span class="amt">${due == null ? '<span class="muted small">No statement</span>' : money(st.code === 'paid' ? due : leftToPay(b, key))}</span>
        ${showPay ? `<button type="button" class="btn pay" data-pay-bill="${esc(b.id)}" data-month="${key}">${b.kind === 'card' && due == null ? 'Add' : 'Pay'}</button>` : `<span class="pill ${st.code}">${esc(st.label)}</span>`}
      </span>
    </div>`;
  }
  function ring(pct) {
    const r = 34, c = 2 * Math.PI * r;
    return `<div class="ring"><svg viewBox="0 0 84 84" aria-hidden="true">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--brand-1)"/><stop offset="1" stop-color="var(--brand-2)"/></linearGradient></defs>
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="10"/>
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="url(#rg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * pct) / 100} ${c}"/>
    </svg><b>${pct}%</b></div>`;
  }
  function categoryRows(key, limit = 6) {
    const by = {};
    for (const t of state.transactions) if (t.type === 'expense' && monthOf(t.date) === key) by[t.category] = (by[t.category] || 0) + t.amount;
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<div class="empty">No spending recorded this month yet.</div>';
    const total = sum(rows, (r) => r[1]);
    let shown = rows.slice(0, limit);
    if (rows.length > limit) shown.push(['Other', sum(rows.slice(limit), (r) => r[1])]);
    const max = shown[0][1];
    return `<div class="cat-rows">${shown.map(([n, v]) => `<div class="cat-row">${catTile(n, 'sm')}
      <span class="name">${esc(n)}</span><span class="val">${money(v)}</span>
      <div class="bar"><span style="width:${Math.max(3, (v / max) * 100)}%"></span></div><span class="pct">${Math.round((v / total) * 100)}%</span></div>`).join('')}</div>`;
  }

  // ---------- Home ----------
  function renderHome() {
    const cur = thisMonth();
    const balance = sum(state.transactions, (t) => (t.type === 'income' ? t.amount : -t.amount));
    const mt = monthTotals(cur);
    const bm = billsForMonth(cur);
    const pct = bm.total ? Math.round((bm.paid / bm.total) * 100) : 100;
    const nextBills = bm.list.filter((b) => !['paid'].includes(billStatus(b, cur).code))
      .sort((a, b) => dueDate(a, cur).localeCompare(dueDate(b, cur))).slice(0, 4);
    const iOwe = sum(state.debts.filter((d) => d.direction === 'owe'), debtLeft);
    const owed = sum(state.debts.filter((d) => d.direction === 'owed'), debtLeft);
    const recent = [...state.transactions].sort(byDateDesc).slice(0, 6);

    const months = Array.from({ length: 6 }, (_, i) => addMonths(cur, i - 5));
    const sums = months.map((m) => monthTotals(m));
    const max = Math.max(1, ...sums.map((s) => Math.max(s.inn, s.out)));

    $('#view-home').innerHTML = `
      <div class="wallet">
        <div class="row"><span class="label">Balance · all records</span><span class="label">${esc(fmtMonth(cur))}</span></div>
        <span class="big">${money(balance)}</span>
        <div class="wallet-split">
          <div><span>Money in this month</span><b>${money(mt.inn)}</b></div>
          <div><span>Money out this month</span><b>${money(mt.out)}</b></div>
        </div>
      </div>
      <div class="board">
        <div class="card">
          <div class="row"><h2>Bills this month</h2><a class="link" href="#bills">See all</a></div>
          ${bm.list.length ? `
          <div class="ring-row">${ring(pct)}
            <div class="ring-txt"><span class="eyebrow">Left to pay</span><span class="left">${money(bm.left)}</span>
            <span class="muted small">${money(bm.paid)} of ${money(bm.total)} paid${bm.overdue ? ` · <b class="out">${bm.overdue} late</b>` : ''}</span></div>
          </div>
          <div class="list">${nextBills.length ? nextBills.map((b) => billRow(b, cur)).join('') : '<div class="empty"><span class="big-ico">🎉</span>All bills paid for this month.</div>'}</div>`
          : `<div class="empty"><span class="big-ico">📆</span>Add your instalments, credit cards and fixed monthly expenses to see what's due.<button type="button" class="btn primary small" data-new-bill>Add a monthly bill</button></div>`}
        </div>
        <div class="card">
          <div class="row"><h2>Spending by category</h2><span class="muted small">${esc(fmtMonth(cur, false))}</span></div>
          ${categoryRows(cur, 5)}
        </div>
      </div>
      <div class="duo">
        <a class="stat" href="#debts" style="text-decoration:none"><span class="eyebrow">I owe</span><b class="out">${money(iOwe)}</b></a>
        <a class="stat" href="#debts" style="text-decoration:none"><span class="eyebrow">Owed to me</span><b class="in">${money(owed)}</b></a>
      </div>
      <div class="board">
        <div class="card">
          <div class="row"><h2>Last 6 months</h2><div class="legend"><span><i style="background:var(--in)"></i>In</span><span><i style="background:var(--out)"></i>Out</span></div></div>
          <div class="bars" role="img" aria-label="Money in and out for the last six months">
            ${sums.map((s, i) => `<div class="col" title="${esc(fmtMonth(months[i]))}: in ${esc(money(s.inn))}, out ${esc(money(s.out))}"><i class="in" style="height:${(s.inn / max) * 100}%"></i><i class="out" style="height:${(s.out / max) * 100}%"></i></div>`).join('')}
          </div>
          <div class="bar-labels">${months.map((m) => `<span>${esc(fmtMonth(m, false))}</span>`).join('')}</div>
        </div>
        <div class="card">
          <div class="row"><h2>Recent records</h2><a class="link" href="#records">See all</a></div>
          <div class="list">${recent.length ? recent.map(txRow).join('') : '<div class="empty">No records yet. Tap + to add your first one.</div>'}</div>
        </div>
      </div>`;
  }

  // ---------- Records ----------
  function renderRecords() {
    const key = ui.recMonth;
    const q = ui.recSearch.trim().toLowerCase();
    const inMonth = state.transactions.filter((t) => monthOf(t.date) === key);
    const filtered = inMonth.filter((t) => (ui.recType === 'all' || t.type === ui.recType) &&
      (!q || (t.note || '').toLowerCase().includes(q) || t.category.toLowerCase().includes(q)));
    const list = (ui.recMode === 'calendar' && ui.recDay ? filtered.filter((t) => t.date === ui.recDay) : filtered).sort(byDateDesc);
    const inn = sum(filtered.filter((t) => t.type === 'income'), (t) => t.amount);
    const out = sum(filtered.filter((t) => t.type === 'expense'), (t) => t.amount);

    let rows = '', last = '';
    for (const t of list) {
      if (t.date !== last) {
        last = t.date;
        const net = sum(list.filter((x) => x.date === t.date), (x) => (x.type === 'income' ? x.amount : -x.amount));
        rows += `<div class="day-head"><span>${esc(fmtDate(t.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span><span class="num">${money(net, true)}</span></div>`;
      }
      rows += txRow(t);
    }
    const searchFocused = document.activeElement && document.activeElement.id === 'rec-search';
    $('#view-records').innerHTML = `
      <div class="row"><h1>Records</h1>
        <div class="month-nav"><button type="button" data-rec-month="-1" aria-label="Previous month">‹</button><span>${esc(fmtMonth(key))}</span><button type="button" data-rec-month="1" aria-label="Next month">›</button></div>
      </div>
      <div class="stats">
        <div class="stat"><span class="eyebrow">In</span><b class="in">${money(inn)}</b></div>
        <div class="stat"><span class="eyebrow">Out</span><b class="out">${money(out)}</b></div>
        <div class="stat"><span class="eyebrow">Balance</span><b>${money(inn - out, true)}</b></div>
      </div>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="View">
          <button type="button" data-rec-mode="list" aria-pressed="${ui.recMode === 'list'}">List</button>
          <button type="button" data-rec-mode="calendar" aria-pressed="${ui.recMode === 'calendar'}">Calendar</button>
        </div>
        <div class="seg" role="group" aria-label="Type">
          ${['all', 'expense', 'income'].map((k) => `<button type="button" data-rec-type="${k}" aria-pressed="${ui.recType === k}">${{ all: 'All', expense: 'Out', income: 'In' }[k]}</button>`).join('')}
        </div>
        <input type="search" id="rec-search" placeholder="Search notes or categories" value="${esc(ui.recSearch)}">
      </div>
      <div class="board">
        <div class="card" style="${ui.recMode === 'calendar' ? '' : 'display:none'}">${ui.recMode === 'calendar' ? calendar(key, filtered) : ''}</div>
        <div class="card">
          ${ui.recMode === 'calendar' && ui.recDay ? `<div class="row"><h2>${esc(fmtDate(ui.recDay, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2><button type="button" class="link" data-rec-day="">Show whole month</button></div>` : ''}
          <div class="list">${rows || `<div class="empty"><span class="big-ico">🧾</span>No records ${ui.recDay && ui.recMode === 'calendar' ? 'on this day' : 'for this month'}.</div>`}</div>
        </div>
        ${ui.recMode === 'list' ? `<div class="card"><h2>Spending by category</h2>${categoryRows(key, 8)}</div>` : ''}
      </div>`;
    if (searchFocused) { const s = $('#rec-search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }
  function calendar(key, txs) {
    const first = new Date(key + '-01T00:00:00');
    const fd = firstDayOfWeek();
    const lead = (first.getDay() - fd + 7) % 7;
    const n = daysInMonth(key);
    const wd = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((fd + i) % 7)).toLocaleDateString(undefined, { weekday: 'narrow' }));
    const billDays = new Set(state.bills.filter((b) => billActiveIn(b, key)).map((b) => dueDate(b, key)));
    let cells = wd.map((w) => `<span class="wd">${esc(w)}</span>`).join('');
    for (let i = 0; i < lead; i++) cells += '<button type="button" class="blank" tabindex="-1" aria-hidden="true"></button>';
    const today = todayISO();
    for (let d = 1; d <= n; d++) {
      const iso = key + '-' + pad(d);
      const day = txs.filter((t) => t.date === iso);
      const inn = sum(day.filter((t) => t.type === 'income'), (t) => t.amount);
      const out = sum(day.filter((t) => t.type === 'expense'), (t) => t.amount);
      cells += `<button type="button" class="${iso === today ? 'today' : ''} ${iso === ui.recDay ? 'sel' : ''}" data-rec-day="${iso}" aria-label="${esc(fmtDate(iso))}">
        <span class="d">${d}</span>${inn ? `<span class="v in">+${short(inn)}</span>` : ''}${out ? `<span class="v out">-${short(out)}</span>` : ''}${billDays.has(iso) ? '<span class="bill-dot" title="Bill due"></span>' : ''}</button>`;
    }
    return `<div class="cal">${cells}</div><span class="muted small"><span class="bill-dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--warn)"></span> bill due date</span>`;
  }

  // ---------- Bills ----------
  function renderBills() {
    const key = ui.billMonth;
    const bm = billsForMonth(key);
    const pct = bm.total ? Math.round((bm.paid / bm.total) * 100) : 100;
    const groups = ['card', 'installment', 'fixed'].map((kind) => {
      const items = bm.list.filter((b) => b.kind === kind).sort((a, b) => a.dueDay - b.dueDay);
      if (!items.length) return '';
      return `<div class="bill-group"><h3>${KIND[kind].plural.toUpperCase()} · ${money(sum(items, (b) => dueAmount(b, key) ?? 0))}</h3>${items.map((b) => billRow(b, key)).join('')}</div>`;
    }).join('');
    const ending = state.bills.filter((b) => b.kind === 'installment' && installmentProgress(b).balance > 0);
    $('#view-bills').innerHTML = `
      <div class="row"><h1>Monthly bills</h1>
        <div class="month-nav"><button type="button" data-bill-month="-1" aria-label="Previous month">‹</button><span>${esc(fmtMonth(key))}</span><button type="button" data-bill-month="1" aria-label="Next month">›</button></div>
      </div>
      <div class="board">
        <div class="card">
          <div class="ring-row">${ring(pct)}
            <div class="ring-txt"><span class="eyebrow">Left to pay in ${esc(fmtMonth(key, false))}</span><span class="left">${money(bm.left)}</span>
              <span class="muted small">${money(bm.paid)} of ${money(bm.total)} paid · ${bm.list.length} bill${bm.list.length === 1 ? '' : 's'}${bm.overdue ? ` · <b class="out">${bm.overdue} late</b>` : ''}</span></div>
          </div>
          <button type="button" class="btn small" data-new-bill style="justify-self:start">+ Add a monthly bill</button>
        </div>
        ${ending.length ? `<div class="card"><h2>Instalments left</h2><div class="cat-rows">${ending.map((b) => {
          const p = installmentProgress(b);
          return `<div class="cat-row">${billTile(b, 'sm')}<span class="name">${esc(b.name)}</span><span class="val">${money(p.balance)}</span>
            <div class="bar"><span style="width:${(p.paidMonths / b.months) * 100}%"></span></div><span class="pct">${p.paidMonths}/${b.months} · ends ${esc(fmtMonth(p.endMonth, false))} ${p.endMonth.slice(0, 4)}</span></div>`;
        }).join('')}</div></div>` : ''}
      </div>
      <div class="card">${groups || `<div class="empty"><span class="big-ico">📆</span>No bills for this month.<br>Add your car loan, credit cards, rent, phone bill and other fixed monthly payments.<button type="button" class="btn primary small" data-new-bill>Add a monthly bill</button></div>`}</div>`;
  }

  // ---------- Debts ----------
  function dueBadge(d) {
    if (debtSettled(d)) return '<span class="pill paid">Settled</span>';
    if (!d.due) return '';
    const n = daysUntil(d.due);
    if (n < 0) return `<span class="pill overdue">${-n} day${n === -1 ? '' : 's'} late</span>`;
    if (n === 0) return '<span class="pill soon">Due today</span>';
    if (n <= 7) return `<span class="pill soon">Due in ${n} day${n === 1 ? '' : 's'}</span>`;
    return `<span class="pill upcoming">Due ${esc(fmtDate(d.due, { day: 'numeric', month: 'short' }))}</span>`;
  }
  const avatar = (name) => `<span class="avatar" style="--h:${nameHue(name)}" aria-hidden="true">${esc([...String(name).trim()][0] || '?').toUpperCase()}</span>`;
  function renderDebts() {
    const tabs = { owe: 'I owe', owed: 'Owed to me', settled: 'Settled' };
    const list = state.debts.filter((d) => (ui.debtTab === 'settled' ? debtSettled(d) : !debtSettled(d) && d.direction === ui.debtTab))
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const total = sum(list, debtLeft);
    $('#view-debts').innerHTML = `
      <div class="row"><h1>Debts</h1>${ui.debtTab !== 'settled' ? `<b class="num ${ui.debtTab === 'owe' ? 'out' : 'in'}" style="font-size:22px">${money(total)}</b>` : ''}</div>
      <div class="toolbar"><div class="seg" role="group" aria-label="Debt list">
        ${Object.entries(tabs).map(([k, v]) => `<button type="button" data-debt-tab="${k}" aria-pressed="${ui.debtTab === k}">${v}</button>`).join('')}
      </div></div>
      ${list.length ? `<div class="debts">${list.map((d) => `
        <button type="button" class="debt" data-open-debt="${esc(d.id)}">
          <div class="row"><span class="who">${avatar(d.person)}<span class="person">${esc(d.person)}</span></span>${dueBadge(d)}</div>
          <span class="remaining ${d.direction === 'owe' ? 'out' : 'in'}">${money(debtLeft(d))}</span>
          <div class="bar green"><span style="width:${d.amount ? Math.min(100, (debtPaid(d) / d.amount) * 100) : 0}%"></span></div>
          <span class="muted small">${money(debtPaid(d))} of ${money(d.amount)} paid${d.note ? ' · ' + esc(d.note) : ''}</span>
        </button>`).join('')}</div>`
      : `<div class="card"><div class="empty"><span class="big-ico">🤝</span>${ui.debtTab === 'settled' ? 'Fully paid debts will show here.' : 'No open debts here.'}${ui.debtTab !== 'settled' ? '<button type="button" class="btn primary small" data-new-debt>Record a debt</button>' : ''}</div></div>`}`;
  }

  // ---------- Backup & settings ----------
  function renderMore() {
    $('#view-more').innerHTML = `
      <h1>Backup &amp; settings</h1>
      <div class="board">
        <div class="card">
          <h2>Currency</h2>
          <div class="field"><label for="currency">Show amounts in</label>
            <select id="currency">${[...new Set([state.currency, ...CURRENCIES])].map((c) => `<option ${c === state.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <label class="check"><input type="checkbox" id="pref-hide" ${prefs.hide ? 'checked' : ''}> Hide amounts on screen (tap the eye icon to toggle)</label>
        </div>
        <div class="card prose">
          <h2>Back up your records</h2>
          <p class="muted">Your records are saved only in this browser on this device. Download a backup regularly. You can also use it to move your records to another phone or computer.</p>
          <div class="toolbar">
            <button type="button" class="btn primary" id="export-json">Download backup</button>
            <button type="button" class="btn" id="export-csv">Download spreadsheet (.csv)</button>
            <label class="btn" for="import-file">Restore from backup</label>
            <input type="file" id="import-file" accept="application/json,.json" hidden>
          </div>
        </div>
        <div class="card prose">
          <h2>Install on your phone</h2>
          <p class="muted"><b>Android (Chrome):</b> open the menu ⋮ and choose <i>Install app</i> or <i>Add to Home screen</i>.</p>
          <p class="muted"><b>iPhone (Safari):</b> tap Share, then <i>Add to Home Screen</i>.</p>
        </div>
        <div class="card prose">
          <h2>Erase everything</h2>
          <p class="muted">Deletes all records, bills and debts from this device. Download a backup first if you might need them.</p>
          <div><button type="button" class="btn danger" id="wipe">Erase all records</button></div>
        </div>
      </div>`;
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function csv() {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Record', 'Date / month', 'Type', 'Name or category', 'Amount', 'Paid', 'Remaining', 'Due', 'Note']];
    for (const t of [...state.transactions].sort(byDateDesc)) rows.push(['Money', t.date, t.type === 'income' ? 'In' : 'Out', t.category, centsToInput(t.amount), '', '', '', t.note]);
    for (const b of state.bills) {
      const extra = b.kind === 'installment' ? `${b.months} months from ${b.startMonth}` : b.kind === 'card' ? `Limit ${b.limit ? centsToInput(b.limit) : '-'}` : '';
      rows.push(['Monthly bill', b.startMonth, KIND[b.kind].label, b.name, b.amount ? centsToInput(b.amount) : '', centsToInput(sum(b.payments, (p) => p.amount)), b.kind === 'installment' ? centsToInput(installmentProgress(b).balance) : '', 'Day ' + b.dueDay, [extra, b.note].filter(Boolean).join(' · ')]);
    }
    for (const d of state.debts) rows.push(['Debt', d.date, d.direction === 'owe' ? 'I owe' : 'Owed to me', d.person, centsToInput(d.amount), centsToInput(debtPaid(d)), centsToInput(debtLeft(d)), d.due, d.note]);
    return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
  }

  // ---------- Sheets ----------
  const sheet = $('#sheet');
  const form = $('#sheet-form');
  let onSubmit = null;
  function openSheet(html, handler, ctx = {}) {
    form.innerHTML = '<div class="grabber" aria-hidden="true"></div>' + html;
    onSubmit = handler;
    form.dataset.ctx = JSON.stringify(ctx);
    if (!sheet.open) sheet.showModal();
    form.scrollTop = 0;
    const first = form.querySelector('.amount-box input, input:not([type=hidden]):not([type=radio]):not([type=checkbox])');
    if (first && window.matchMedia('(min-width: 820px)').matches) first.focus();
  }
  const ctx = () => JSON.parse(form.dataset.ctx || '{}');
  function closeSheet() { sheet.close(); onSubmit = null; }
  form.addEventListener('submit', (e) => { e.preventDefault(); if (onSubmit) onSubmit(new FormData(form), e.submitter); });
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  const showError = (msg) => { const el = form.querySelector('.error'); if (el) { el.textContent = msg; el.hidden = false; } };
  const amountBox = (id, name, value, placeholder = '0.00') =>
    `<div class="amount-box"><span class="cur">${esc(currencySymbol())}</span><input id="${id}" name="${name}" inputmode="decimal" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(value)}" aria-label="Amount"></div>`;

  function chooser() {
    const opt = (key, em, hue, title, sub) => `<button type="button" data-choose="${key}" style="--h:${hue}"><span class="em">${em}</span><b>${title}</b><span>${sub}</span></button>`;
    openSheet(`<h2>What do you want to add?</h2>
      <div class="choose">
        ${opt('expense', '💸', 356, 'Money out', 'Spending, a bill you paid')}
        ${opt('income', '💰', 150, 'Money in', 'Salary, sales, angpao')}
        ${opt('bill', '📆', 30, 'Monthly bill', 'Instalment, credit card, rent')}
        ${opt('debt', '🤝', 265, 'Debt', 'Money lent or borrowed')}
      </div>`, null);
  }

  // Money in / out
  function txForm(tx, presetType, draft) {
    const isEdit = !!tx;
    const type = presetType || (tx ? tx.type : 'expense');
    const cats = CATS[type];
    const chosen = draft?.category && cats.some((c) => c[0] === draft.category) ? draft.category : tx && tx.type === type ? tx.category : cats[0][0];
    const catList = cats.some((c) => c[0] === chosen) ? cats : [[chosen, catInfo(chosen).icon, catInfo(chosen).hue], ...cats];
    openSheet(`
      <div class="row"><h2>${isEdit ? 'Edit record' : type === 'income' ? 'Money in' : 'Money out'}</h2>
        <div class="seg out-in" role="group" aria-label="Type">
          <button type="button" data-switch-type="expense" aria-pressed="${type === 'expense'}">Out</button>
          <button type="button" data-switch-type="income" aria-pressed="${type === 'income'}">In</button>
        </div></div>
      ${amountBox('f-amount', 'amount', draft ? draft.amount : tx ? centsToInput(tx.amount) : '')}
      <div class="field"><span class="lbl">Category</span>
        <div class="cat-grid" role="radiogroup" aria-label="Category">
          ${catList.map(([n, icon, hue]) => `<label>${icoTile(icon, hue)}<input type="radio" name="category" value="${esc(n)}" ${n === chosen ? 'checked' : ''}>${esc(n)}</label>`).join('')}
        </div></div>
      <div class="grid2">
        <div class="field"><label for="f-date">Date</label><input type="date" id="f-date" name="date" value="${esc(draft ? draft.date : tx ? tx.date : (ui.view === 'records' && ui.recDay) || todayISO())}"></div>
        <div class="field"><label for="f-note">Note</label><input id="f-note" name="note" maxlength="140" placeholder="What was it for?" value="${esc(draft ? draft.note : tx ? tx.note : '')}"></div>
      </div>
      ${tx && tx.billId ? '<p class="muted small" style="margin:0">This payment is linked to a monthly bill. Changes here update the bill too.</p>' : ''}
      <p class="error" hidden></p>
      <div class="actions">
        ${isEdit ? '<button type="button" class="btn danger" data-delete-tx>Delete</button><span class="spacer"></span>' : ''}
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${isEdit ? 'Save changes' : 'Save'}</button>
      </div>`, (fd) => {
      const amount = toCents(fd.get('amount'));
      if (!(amount > 0)) return showError('Enter an amount greater than zero, for example 12.50.');
      if (!fd.get('date')) return showError('Pick a date.');
      const rec = { ...(tx || {}), id: tx ? tx.id : uid(), type, amount, category: fd.get('category') || cats[0][0], date: fd.get('date'), note: String(fd.get('note') || '').trim() };
      delete rec.ex;
      if (isEdit) {
        state.transactions = state.transactions.map((x) => (x.id === tx.id ? rec : x));
        if (rec.billId) { const b = findBill(rec.billId); const p = b && b.payments.find((p) => p.txId === rec.id); if (p) { p.amount = amount; p.date = rec.date; } }
      } else state.transactions.push(rec);
      closeSheet(); save(); toast(isEdit ? 'Changes saved' : 'Saved');
    }, { txId: tx ? tx.id : '', type });
  }

  // Monthly bill add / edit
  function billForm(bill, presetKind) {
    const isEdit = !!bill;
    const kind = presetKind || (bill ? bill.kind : 'installment');
    const v = (k, d = '') => esc(bill && bill[k] != null ? bill[k] : d);
    const only = (kinds) => `data-kinds="${kinds}" ${kinds.split(' ').includes(kind) ? '' : 'hidden'}`;
    openSheet(`
      <h2>${isEdit ? 'Edit monthly bill' : 'Add a monthly bill'}</h2>
      <div class="seg" role="group" aria-label="Bill type">
        ${['installment', 'card', 'fixed'].map((k) => `<button type="button" data-bill-kind="${k}" aria-pressed="${k === kind}">${KIND[k].label}</button>`).join('')}
      </div>
      <input type="hidden" name="kind" value="${kind}">
      <p class="muted small" style="margin:0" data-kinds="installment" ${kind === 'installment' ? '' : 'hidden'}>A fixed amount for a set number of months, like a car loan, house loan, study loan or 0% phone plan.</p>
      <p class="muted small" style="margin:0" data-kinds="card" ${kind === 'card' ? '' : 'hidden'}>Enter each month's statement amount, then record full, minimum or part payments.</p>
      <p class="muted small" style="margin:0" data-kinds="fixed" ${kind === 'fixed' ? '' : 'hidden'}>The same payment every month, like rent, phone bill, insurance or streaming.</p>
      <div class="field"><label for="b-name">Name</label><input id="b-name" name="name" maxlength="60" value="${v('name')}" placeholder="${{ installment: 'e.g. Car loan, iPhone 0% plan', card: 'e.g. Maybank Visa, Citi Rewards', fixed: 'e.g. Rent, Unifi, Insurance' }[kind]}"></div>
      <div class="field" ${only('installment fixed')}><label for="b-amount">Monthly amount</label>${amountBox('b-amount', 'amount', bill && bill.amount ? centsToInput(bill.amount) : '')}</div>
      <div class="grid2" ${only('installment')}>
        <div class="field"><label for="b-months">Number of months</label><input id="b-months" name="months" type="number" min="1" max="600" inputmode="numeric" value="${v('months', '')}" placeholder="e.g. 60"></div>
        <div class="field"><label for="b-prepaid">Months already paid</label><input id="b-prepaid" name="prePaid" type="number" min="0" inputmode="numeric" value="${v('prePaid', 0)}"></div>
      </div>
      <div class="grid2" ${only('card')}>
        <div class="field"><label for="b-limit">Credit limit (optional)</label><input id="b-limit" name="limit" inputmode="decimal" value="${bill && bill.limit ? centsToInput(bill.limit) : ''}" placeholder="e.g. 10000"></div>
        <div class="field"><label for="b-minpct">Minimum payment %</label><input id="b-minpct" name="minPct" type="number" min="0" max="100" step="0.5" inputmode="decimal" value="${v('minPct', 5)}"></div>
      </div>
      <div class="field" ${only('card')}><label for="b-minfloor">Minimum payment is at least (optional)</label><input id="b-minfloor" name="minFloor" inputmode="decimal" value="${bill && bill.minFloor ? centsToInput(bill.minFloor) : ''}" placeholder="e.g. 50"></div>
      <div class="grid2">
        <div class="field"><label for="b-due">Due day each month</label><input id="b-due" name="dueDay" type="number" min="1" max="31" inputmode="numeric" value="${v('dueDay', '')}" placeholder="1 – 31"></div>
        <div class="field"><label for="b-start">${kind === 'installment' ? 'First payment month' : 'Start tracking from'}</label><input id="b-start" name="startMonth" type="month" value="${v('startMonth', thisMonth())}"></div>
      </div>
      <div class="field" ${only('installment fixed')}><span class="lbl">Category</span>
        <select name="category" aria-label="Category">${CATS.expense.filter((c) => c[0] !== 'Credit card').map(([n, icon]) => `<option value="${esc(n)}" ${(bill ? bill.category : kind === 'installment' ? 'Installment' : 'Utilities') === n ? 'selected' : ''}>${icon} ${esc(n)}</option>`).join('')}</select></div>
      <div class="field"><label for="b-note">Note (optional)</label><input id="b-note" name="note" maxlength="140" value="${v('note')}" placeholder="Account number, bank, reference…"></div>
      <p class="error" hidden></p>
      <div class="actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${isEdit ? 'Save changes' : 'Add bill'}</button>
      </div>`, (fd) => {
      const k = fd.get('kind');
      const name = String(fd.get('name') || '').trim();
      const dueDay = parseInt(fd.get('dueDay'), 10);
      const startMonth = String(fd.get('startMonth') || '').trim();
      if (!name) return showError('Give this bill a name.');
      if (!(dueDay >= 1 && dueDay <= 31)) return showError('Enter the due day as a number from 1 to 31.');
      if (!/^\d{4}-\d{2}$/.test(startMonth)) return showError('Enter the start month as YYYY-MM, for example 2026-01.');
      const rec = { ...(bill || { id: uid(), payments: [], statements: {} }), kind: k, name, dueDay, startMonth, note: String(fd.get('note') || '').trim() };
      delete rec.ex;
      if (k !== 'card') {
        const amount = toCents(fd.get('amount'));
        if (!(amount > 0)) return showError('Enter the monthly amount.');
        rec.amount = amount; rec.category = fd.get('category') || 'Other';
      }
      if (k === 'installment') {
        const months = parseInt(fd.get('months'), 10), prePaid = parseInt(fd.get('prePaid') || '0', 10);
        if (!(months >= 1)) return showError('Enter how many months the instalment runs for.');
        if (!(prePaid >= 0 && prePaid <= months)) return showError('Months already paid must be between 0 and the number of months.');
        rec.months = months; rec.prePaid = prePaid;
      }
      if (k === 'card') {
        const limit = toCents(fd.get('limit')), floor = toCents(fd.get('minFloor'));
        rec.limit = limit > 0 ? limit : 0; rec.minFloor = floor > 0 ? floor : 0;
        rec.minPct = Math.min(100, Math.max(0, Number(fd.get('minPct')) || 0));
      }
      if (isEdit) state.bills = state.bills.map((x) => (x.id === bill.id ? rec : x)); else state.bills.push(rec);
      closeSheet(); save(); toast(isEdit ? 'Bill updated' : 'Bill added');
      if (!isEdit && ui.view !== 'bills') location.hash = 'bills';
    }, { billId: bill ? bill.id : '' });
  }

  // Pay a bill for a month
  function payForm(billId, key) {
    const b = findBill(billId); if (!b) return;
    const due = dueAmount(b, key), left = leftToPay(b, key);
    const isCard = b.kind === 'card';
    const defDate = key === thisMonth() ? todayISO() : dueDate(b, key);
    openSheet(`
      <div class="row"><span class="row" style="justify-content:flex-start">${billTile(b)}<span><h2>${esc(b.name)}</h2><span class="muted small">${esc(KIND[b.kind].label)} · ${esc(fmtMonth(key))}</span></span></span></div>
      ${isCard ? `<div class="field"><label for="p-statement">Statement amount for ${esc(fmtMonth(key, false))}</label>${amountBox('p-statement', 'statement', due != null ? centsToInput(due) : '', 'From your card statement')}</div>` : ''}
      <div class="field"><label for="p-amount">Amount paid</label>${amountBox('p-amount', 'amount', left > 0 ? centsToInput(left) : '')}
        ${isCard ? `<div class="quick"><button type="button" data-quick="full">Full amount</button><button type="button" data-quick="min">Minimum</button></div>` : ''}</div>
      <div class="field"><label for="p-date">Date paid</label><input type="date" id="p-date" name="date" value="${defDate}"></div>
      <label class="check"><input type="checkbox" name="addTx" checked> Also add to Money out records</label>
      <p class="error" hidden></p>
      <div class="actions">
        <button type="button" class="btn" data-close>Cancel</button>
        ${isCard ? '<button type="button" class="btn" data-save-statement>Save statement only</button>' : ''}
        <button type="submit" class="btn primary">Record payment</button>
      </div>`, (fd) => {
      if (isCard) {
        const st = toCents(fd.get('statement'));
        if (st >= 0) b.statements[key] = st;
      }
      const amount = toCents(fd.get('amount'));
      if (!(amount > 0)) return showError('Enter the amount you paid.');
      const date = fd.get('date') || todayISO();
      const pay = { id: uid(), month: key, amount, date };
      if (fd.get('addTx')) {
        const t = { id: uid(), type: 'expense', amount, category: isCard ? 'Credit card' : b.category, date, note: b.name + ' · ' + fmtMonth(key, false), billId: b.id };
        state.transactions.push(t); pay.txId = t.id;
      }
      b.payments.push(pay);
      closeSheet(); save(); toast(leftToPay(b, key) === 0 ? `${b.name} paid for ${fmtMonth(key, false)}` : 'Payment recorded');
    }, { billId, month: key });
  }

  // Bill details
  function billDetail(billId, key, confirmDelete = false) {
    const b = findBill(billId); if (!b) return;
    key = key || thisMonth();
    const st = billStatus(b, key);
    let summary = '';
    if (b.kind === 'installment') {
      const p = installmentProgress(b);
      summary = `<div class="duo">
          <div class="stat"><span class="eyebrow">Balance left</span><b>${money(p.balance)}</b></div>
          <div class="stat"><span class="eyebrow">Monthly</span><b>${money(b.amount)}</b></div></div>
        <div class="bar"><span style="width:${(p.paidMonths / b.months) * 100}%"></span></div>
        <span class="muted small">${p.paidMonths} of ${b.months} months paid · last payment ${esc(fmtMonth(p.endMonth))} · total ${money(p.total)}</span>`;
    } else if (b.kind === 'card') {
      const s = dueAmount(b, key);
      summary = `<div class="duo">
          <div class="stat"><span class="eyebrow">${esc(fmtMonth(key, false))} statement</span><b>${s == null ? '—' : money(s)}</b></div>
          <div class="stat"><span class="eyebrow">Minimum</span><b>${s == null ? '—' : money(minDue(b, key))}</b></div></div>
        ${b.limit && s != null ? `<div class="bar"><span style="width:${Math.min(100, (s / b.limit) * 100)}%"></span></div><span class="muted small">${Math.round((s / b.limit) * 100)}% of ${money(b.limit)} limit used</span>` : ''}`;
    } else {
      summary = `<div class="duo"><div class="stat"><span class="eyebrow">Monthly</span><b>${money(b.amount)}</b></div>
        <div class="stat"><span class="eyebrow">Paid so far</span><b>${money(sum(b.payments, (p) => p.amount))}</b></div></div>`;
    }
    const pays = [...b.payments].sort((x, y) => y.date.localeCompare(x.date));
    openSheet(`
      <div class="row"><span class="row" style="justify-content:flex-start">${billTile(b)}<span><h2>${esc(b.name)}</h2><span class="muted small">${esc(KIND[b.kind].label)} · due on the ${ordinal(b.dueDay)}${b.note ? ' · ' + esc(b.note) : ''}</span></span></span>
        ${billActiveIn(b, key) ? `<span class="pill ${st.code}">${esc(fmtMonth(key, false))}: ${esc(st.label)}</span>` : ''}</div>
      ${summary}
      <h3>Payment history</h3>
      ${pays.length ? `<div class="history">${pays.map((p) => `<div class="p"><span>${esc(fmtMonth(p.month, false))} ${p.month.slice(0, 4)} <span class="muted">· paid ${esc(fmtDate(p.date, { day: 'numeric', month: 'short' }))}</span></span>
        <span><span class="num">${money(p.amount)}</span><button type="button" class="linkbtn" data-del-bill-pay="${esc(p.id)}">Remove</button></span></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">No payments recorded yet.</p>'}
      ${confirmDelete ? `<div class="confirm"><span>Delete this bill? Payments already in your records stay there.</span><span class="toolbar"><button type="button" class="btn small" data-cancel-delete-bill>Keep</button><button type="button" class="btn small danger" data-confirm-delete-bill>Delete</button></span></div>` : ''}
      <div class="actions">
        <button type="button" class="btn danger" data-delete-bill>Delete</button>
        <button type="button" class="btn" data-edit-bill>Edit</button>
        <span class="spacer"></span>
        ${billActiveIn(b, key) && st.code !== 'paid' ? `<button type="button" class="btn primary" data-pay-bill="${esc(b.id)}" data-month="${key}">Pay ${esc(fmtMonth(key, false))}</button>` : '<button type="button" class="btn" data-close>Close</button>'}
      </div>`, null, { billId, month: key });
  }

  // Debts
  function debtForm(debt, presetDir) {
    const isEdit = !!debt;
    const dir = presetDir || (debt ? debt.direction : ui.debtTab === 'owed' ? 'owed' : 'owe');
    openSheet(`
      <div class="row"><h2>${isEdit ? 'Edit debt' : 'Record a debt'}</h2></div>
      <div class="seg" role="group" aria-label="Direction">
        <button type="button" data-switch-dir="owe" aria-pressed="${dir === 'owe'}">I owe them</button>
        <button type="button" data-switch-dir="owed" aria-pressed="${dir === 'owed'}">They owe me</button>
      </div>
      <input type="hidden" name="direction" value="${dir}">
      <div class="field"><label for="d-person">Person or lender</label><input id="d-person" name="person" maxlength="60" placeholder="e.g. Ahmad, Kak Ros, Ah Beng" value="${esc(debt ? debt.person : '')}"></div>
      <div class="field"><label for="d-amount">Total amount</label>${amountBox('d-amount', 'amount', debt ? centsToInput(debt.amount) : '')}</div>
      <div class="grid2">
        <div class="field"><label for="d-date">Date</label><input type="date" id="d-date" name="date" value="${esc(debt ? debt.date : todayISO())}"></div>
        <div class="field"><label for="d-due">Pay back by (optional)</label><input type="date" id="d-due" name="due" value="${esc(debt ? debt.due || '' : '')}"></div>
      </div>
      <div class="field"><label for="d-note">Note</label><input id="d-note" name="note" maxlength="140" placeholder="What was it for?" value="${esc(debt ? debt.note : '')}"></div>
      <p class="error" hidden></p>
      <div class="actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${isEdit ? 'Save changes' : 'Save debt'}</button>
      </div>`, (fd) => {
      const person = String(fd.get('person') || '').trim();
      const amount = toCents(fd.get('amount'));
      if (!person) return showError('Enter who the debt is with.');
      if (!(amount > 0)) return showError('Enter an amount greater than zero.');
      const rec = { id: debt ? debt.id : uid(), person, direction: fd.get('direction'), amount, date: fd.get('date') || todayISO(), due: fd.get('due') || '', note: String(fd.get('note') || '').trim(), payments: debt ? debt.payments : [] };
      if (isEdit) state.debts = state.debts.map((x) => (x.id === debt.id ? rec : x)); else state.debts.push(rec);
      closeSheet(); save(); toast(isEdit ? 'Debt updated' : 'Debt saved');
      if (!isEdit && ui.view !== 'debts') { ui.debtTab = rec.direction; location.hash = 'debts'; }
    });
  }
  function debtDetail(id, confirmDelete = false) {
    const d = state.debts.find((x) => x.id === id); if (!d) return;
    const left = debtLeft(d);
    openSheet(`
      <div class="row"><span class="row" style="justify-content:flex-start">${avatar(d.person)}<span><h2>${esc(d.person)}</h2><span class="muted small">${d.direction === 'owe' ? 'You owe' : 'Owes you'} · since ${esc(fmtDate(d.date))}${d.note ? ' · ' + esc(d.note) : ''}</span></span></span>${dueBadge(d)}</div>
      <div class="duo">
        <div class="stat"><span class="eyebrow">Left to pay</span><b class="${d.direction === 'owe' ? 'out' : 'in'}">${money(left)}</b></div>
        <div class="stat"><span class="eyebrow">Paid of ${money(d.amount)}</span><b>${money(debtPaid(d))}</b></div>
      </div>
      ${d.payments.length ? `<div class="history">${[...d.payments].sort((a, b) => b.date.localeCompare(a.date)).map((p) =>
        `<div class="p"><span>${esc(fmtDate(p.date))}${p.note ? ' · <span class="muted">' + esc(p.note) + '</span>' : ''}</span><span><span class="num">${money(p.amount)}</span><button type="button" class="linkbtn" data-del-debt-pay="${esc(p.id)}">Remove</button></span></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">No payments yet.</p>'}
      ${left > 0 ? `
      <h3>Record a payment</h3>
      ${amountBox('p-amount', 'pamount', '', centsToInput(left))}
      <div class="grid2">
        <div class="field"><label for="p-date">Date</label><input type="date" id="p-date" name="pdate" value="${todayISO()}"></div>
        <div class="field"><label for="p-note">Note</label><input id="p-note" name="pnote" maxlength="80" placeholder="Cash, bank transfer…"></div>
      </div>` : ''}
      <p class="error" hidden></p>
      ${confirmDelete ? `<div class="confirm"><span>Delete this debt and its payment history?</span><span class="toolbar"><button type="button" class="btn small" data-cancel-delete-debt>Keep</button><button type="button" class="btn small danger" data-confirm-delete-debt>Delete</button></span></div>` : ''}
      <div class="actions">
        <button type="button" class="btn danger" data-delete-debt>Delete</button>
        <button type="button" class="btn" data-edit-debt>Edit</button>
        <span class="spacer"></span>
        ${left > 0 ? '<button type="button" class="btn" data-pay-full>Paid in full</button><button type="submit" class="btn primary">Add payment</button>' : '<button type="button" class="btn" data-close>Close</button>'}
      </div>`, (fd) => {
      const amount = toCents(fd.get('pamount'));
      if (!(amount > 0)) return showError('Enter the payment amount.');
      if (amount > left) return showError(`That's more than what's left (${money(left)}).`);
      d.payments.push({ id: uid(), amount, date: fd.get('pdate') || todayISO(), note: String(fd.get('pnote') || '').trim() });
      save(); toast(debtLeft(d) === 0 ? 'Debt settled 🎉' : 'Payment recorded'); debtDetail(d.id);
    }, { debtId: d.id });
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    const ds = el.dataset;
    const c = form.contains(el) ? ctx() : {};

    if (ds.close !== undefined) return closeSheet();
    if (ds.add !== undefined) return chooser();
    if (ds.choose) {
      if (ds.choose === 'bill') return billForm();
      if (ds.choose === 'debt') return debtForm();
      return txForm(null, ds.choose);
    }
    if (el.id === 'toggle-hide') { prefs.hide = !prefs.hide; savePrefs(); return render(); }

    // records
    if (ds.recMonth) { ui.recMonth = addMonths(ui.recMonth, Number(ds.recMonth)); ui.recDay = ''; return render(); }
    if (ds.recMode) { ui.recMode = ds.recMode; ui.recDay = ''; return render(); }
    if (ds.recType) { ui.recType = ds.recType; return render(); }
    if (ds.recDay !== undefined) { ui.recDay = ui.recDay === ds.recDay ? '' : ds.recDay; return render(); }
    if (ds.editTx) { const t = state.transactions.find((x) => x.id === ds.editTx); if (t) txForm(t); return; }
    if (ds.switchType) {
      const t = c.txId ? state.transactions.find((x) => x.id === c.txId) : null;
      const draft = { amount: $('#f-amount').value, date: $('#f-date').value, note: $('#f-note').value, category: (form.querySelector('[name=category]:checked') || {}).value };
      return txForm(t, ds.switchType, draft);
    }
    if (ds.deleteTx !== undefined) {
      if (!ds.armed) { ds.armed = '1'; el.textContent = 'Tap again to delete'; return; }
      const t = state.transactions.find((x) => x.id === c.txId);
      if (t && t.billId) { const b = findBill(t.billId); if (b) b.payments = b.payments.filter((p) => p.txId !== t.id); }
      state.transactions = state.transactions.filter((x) => x.id !== c.txId);
      closeSheet(); save(); return toast('Record deleted');
    }

    // bills
    if (ds.billMonth) { ui.billMonth = addMonths(ui.billMonth, Number(ds.billMonth)); return render(); }
    if (ds.newBill !== undefined) return billForm();
    if (ds.billKind) {
      form.querySelector('[name=kind]').value = ds.billKind;
      form.querySelectorAll('[data-bill-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      form.querySelectorAll('[data-kinds]').forEach((n) => { n.hidden = !n.dataset.kinds.split(' ').includes(ds.billKind); });
      $('#b-name').placeholder = { installment: 'e.g. Car loan, iPhone 0% plan', card: 'e.g. Maybank Visa, Citi Rewards', fixed: 'e.g. Rent, Unifi, Insurance' }[ds.billKind];
      $('label[for="b-start"]').textContent = ds.billKind === 'installment' ? 'First payment month' : 'Start tracking from';
      const cat = form.querySelector('select[name=category]');
      if (!c.billId) cat.value = ds.billKind === 'installment' ? 'Installment' : 'Utilities';
      return;
    }
    if (ds.openBill) return billDetail(ds.openBill, ds.month);
    if (ds.payBill) return payForm(ds.payBill, ds.month);
    if (ds.quick) {
      const b = findBill(c.billId);
      const st = toCents($('#p-statement').value);
      if (!(st >= 0)) return showError('Enter the statement amount first.');
      const paid = paidIn(b, c.month);
      const minimum = Math.min(st, Math.max(Math.round(st * (b.minPct ?? 5) / 100), b.minFloor || 0));
      $('#p-amount').value = centsToInput(Math.max(0, (ds.quick === 'full' ? st : minimum) - paid));
      return;
    }
    if (ds.saveStatement !== undefined) {
      const b = findBill(c.billId); const st = toCents($('#p-statement').value);
      if (!(st >= 0)) return showError('Enter the statement amount.');
      b.statements[c.month] = st; closeSheet(); save(); return toast('Statement saved');
    }
    if (ds.editBill !== undefined) return billForm(findBill(c.billId));
    if (ds.deleteBill !== undefined) return billDetail(c.billId, c.month, true);
    if (ds.cancelDeleteBill !== undefined) return billDetail(c.billId, c.month);
    if (ds.confirmDeleteBill !== undefined) {
      state.bills = state.bills.filter((b) => b.id !== c.billId);
      state.transactions.forEach((t) => { if (t.billId === c.billId) delete t.billId; });
      closeSheet(); save(); return toast('Bill deleted');
    }
    if (ds.delBillPay) {
      const b = findBill(c.billId); const p = b.payments.find((x) => x.id === ds.delBillPay);
      b.payments = b.payments.filter((x) => x.id !== ds.delBillPay);
      if (p && p.txId) state.transactions = state.transactions.filter((t) => t.id !== p.txId);
      save(); toast('Payment removed'); return billDetail(c.billId, c.month);
    }

    // debts
    if (ds.debtTab) { ui.debtTab = ds.debtTab; return render(); }
    if (ds.newDebt !== undefined) return debtForm();
    if (ds.openDebt) return debtDetail(ds.openDebt);
    if (ds.switchDir) {
      form.querySelector('[name=direction]').value = ds.switchDir;
      form.querySelectorAll('[data-switch-dir]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      return;
    }
    if (ds.deleteDebt !== undefined) return debtDetail(c.debtId, true);
    if (ds.cancelDeleteDebt !== undefined) return debtDetail(c.debtId);
    if (ds.confirmDeleteDebt !== undefined) { state.debts = state.debts.filter((d) => d.id !== c.debtId); closeSheet(); save(); return toast('Debt deleted'); }
    if (ds.editDebt !== undefined) return debtForm(state.debts.find((x) => x.id === c.debtId));
    if (ds.payFull !== undefined) {
      const d = state.debts.find((x) => x.id === c.debtId);
      d.payments.push({ id: uid(), amount: debtLeft(d), date: $('#p-date').value || todayISO(), note: $('#p-note').value.trim() || 'Paid in full' });
      save(); toast('Debt settled 🎉'); return debtDetail(d.id);
    }
    if (ds.delDebtPay) {
      const d = state.debts.find((x) => x.id === c.debtId);
      d.payments = d.payments.filter((p) => p.id !== ds.delDebtPay); save(); toast('Payment removed'); return debtDetail(d.id);
    }

    // settings
    if (el.id === 'clear-sample') {
      // Remove only the example rows, so anything the user already added is kept.
      state.transactions = state.transactions.filter((t) => !t.ex);
      state.debts = state.debts.filter((d) => !d.ex);
      state.bills = state.bills.filter((b) => !b.ex);
      state.sample = false; save(); return toast('Examples cleared');
    }
    if (el.id === 'export-json') { download(`financial-record-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json'); return toast('Backup downloaded'); }
    if (el.id === 'export-csv') { download(`financial-record-${todayISO()}.csv`, csv(), 'text/csv'); return toast('Spreadsheet downloaded'); }
    if (el.id === 'wipe') {
      if (!ds.armed) { ds.armed = '1'; el.textContent = 'Tap again to erase everything'; return; }
      state = emptyState(state.currency); save(); return toast('All records erased');
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'currency') { state.currency = e.target.value; save(); toast('Currency set to ' + state.currency); }
    if (e.target.id === 'pref-hide') { prefs.hide = e.target.checked; savePrefs(); render(); }
    if (e.target.id === 'import-file') {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data.transactions) || !Array.isArray(data.debts)) throw new Error('shape');
          state = normalize({ ...data, sample: false }); save(); toast('Backup restored');
        } catch (err) { toast('That file is not a Financial Record backup. Choose a .json file downloaded from this app.'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'rec-search') { ui.recSearch = e.target.value; render(); } });

  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 2600);
  }

  window.addEventListener('hashchange', route);
  route();
})();
