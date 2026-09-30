// Generates ~13 months of realistic, deterministic sample data so every screen
// has something to show. Seeded PRNG => same data on every load.

import { emptyState } from './store.js';
import { addDays, addMonths, currentMonth, monthEnd, round2, today, uid, parseISO } from './util.js';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemo() {
  const rnd = mulberry32(20260930);
  const r = (a, b) => a + rnd() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const s = emptyState();
  const end = today();
  const startMonth = addMonths(currentMonth(), -12);
  const start = `${startMonth}-01`;
  const openDate = addDays(start, -1);

  const acct = (name, type, institution, extra = {}) => {
    const a = { id: uid('acct'), name, type, institution, derive: false, createdAt: openDate, ...extra };
    s.accounts.push(a);
    return a;
  };
  const checking = acct('Everyday Checking', 'checking', 'Chase', { derive: true });
  const savings = acct('High-Yield Savings', 'savings', 'Ally', { derive: true });
  const sapphire = acct('Sapphire Preferred', 'credit', 'Chase', { derive: true });
  const amex = acct('Gold Card', 'credit', 'American Express', { derive: true });
  const brokerage = acct('Individual Brokerage', 'brokerage', 'Vanguard');
  const k401 = acct('401(k)', 'retirement', 'Fidelity');
  const home = acct('Home', 'property', 'Zillow estimate');
  const mortgage = acct('Mortgage', 'mortgage', 'Rocket Mortgage');
  const car = acct('2022 RAV4', 'vehicle', 'KBB estimate');
  const autoLoan = acct('Auto Loan', 'auto_loan', 'Toyota Financial');

  const snap = (a, date, balance) => s.balanceHistory.push({ accountId: a.id, date, balance: round2(balance) });
  snap(checking, openDate, 5200);
  snap(savings, openDate, 16500);
  snap(sapphire, openDate, 0);
  snap(amex, openDate, 0);

  // Monthly snapshots for the non-transaction accounts.
  const months = [];
  for (let m = startMonth; m <= currentMonth(); m = addMonths(m, 1)) months.push(m);
  let brk = 61000, ret = 98000, house = 612000, mort = 438000, veh = 31000, loan = 18400;
  snap(brokerage, openDate, brk); snap(k401, openDate, ret); snap(home, openDate, house);
  snap(mortgage, openDate, mort); snap(car, openDate, veh); snap(autoLoan, openDate, loan);
  months.forEach((m) => {
    const d = m === currentMonth() ? end : monthEnd(m);
    brk = brk * (1 + r(-0.035, 0.05)) + 500; ret = ret * (1 + r(-0.03, 0.045)) + 1450;
    house *= 1 + r(-0.003, 0.009); mort -= 790; veh *= 0.988; loan -= 360;
    snap(brokerage, d, brk); snap(k401, d, ret); snap(home, d, house);
    snap(mortgage, d, mort); snap(car, d, veh); snap(autoLoan, d, loan);
  });

  // Tags
  const tag = (name, color) => { const t = { id: uid('tag'), name, color }; s.tags.push(t); return t; };
  const tVacation = tag('Vacation', '#2a78d6');
  const tReimb = tag('Reimbursable', '#eb6834');
  const tTax = tag('Tax deductible', '#1baf7a');

  const tx = [];
  const add = (date, a, merchant, orig, amount, categoryId, extra = {}) => {
    if (date > end || date < start) return;
    tx.push({
      id: uid('txn'), date, accountId: a.id, merchant, originalDescription: orig, amount: round2(amount),
      categoryId, tags: [], notes: '', reviewed: date < addDays(end, -10), hidden: false, ...extra,
    });
  };

  // Paychecks: every other Friday.
  let d = start;
  while (parseISO(d).getDay() !== 5) d = addDays(d, 1);
  for (; d <= end; d = addDays(d, 14)) add(d, checking, 'Acme Corp', 'ACME CORP PAYROLL DIRECT DEP PPD', r(4140, 4160), 'cat_paychecks');

  const cardSpend = new Map(); // month|card -> total
  const card = (date, c, merchant, orig, amount, cat, extra) => {
    add(date, c, merchant, orig, -amount, cat, extra);
    const k = `${date.slice(0, 7)}|${c.id}`;
    cardSpend.set(k, (cardSpend.get(k) || 0) + amount);
  };

  months.forEach((m, mi) => {
    const day = (n) => `${m}-${String(Math.min(n, Number(monthEnd(m).slice(8)))).padStart(2, '0')}`;
    // Fixed bills from checking
    add(day(1), checking, 'Rocket Mortgage', 'ROCKET MORTGAGE PAYMENT 88321', -2745.18, 'cat_mortgage');
    add(day(5), checking, 'Toyota Financial', 'TOYOTA FINANCIAL SVCS AUTOPAY', -425, 'cat_auto_payment');
    add(day(8), checking, 'Ally Bank', 'ONLINE TRANSFER TO ALLY SAVINGS', -1500, 'cat_transfer');
    add(day(8), savings, 'Everyday Checking', 'TRANSFER FROM CHASE CHECKING', 1500, 'cat_transfer');
    add(day(28), savings, 'Ally Bank', 'INTEREST PAID', r(52, 64), 'cat_interest');
    add(day(12), checking, 'Geico', 'GEICO *AUTO INSURANCE', -132.4, 'cat_insurance');
    add(day(15), checking, 'East Bay MUD', 'EBMUD WATER BILL ONLINE', -r(58, 84), 'cat_water');
    add(day(20), checking, 'Bright Horizons', 'BRIGHT HORIZONS CHILD CARE ACH', -1150, 'cat_child_care');

    // Card-based bills & subscriptions
    card(day(3), sapphire, 'Netflix', 'NETFLIX.COM 866-579-7172 CA', 15.49, 'cat_subscriptions');
    card(day(6), sapphire, 'Spotify', 'SPOTIFY USA 877-778-1161 NY', 11.99, 'cat_subscriptions');
    card(day(9), amex, 'iCloud', 'APPLE.COM/BILL 866-712-7753 CA', 2.99, 'cat_subscriptions');
    card(day(2), sapphire, 'Equinox', 'EQUINOX #122 SAN FRANCISCO CA', 185, 'cat_fitness');
    card(day(14), sapphire, 'Comcast Xfinity', 'COMCAST CALIFORNIA 800-266-2278', 89.99, 'cat_internet_and_cable');
    card(day(18), sapphire, 'T-Mobile', 'T-MOBILE *AUTOPAY 800-937-8997 WA', 140, 'cat_phone');
    const winter = ['12', '01', '02'].includes(m.slice(5)), summer = ['07', '08', '09'].includes(m.slice(5));
    card(day(22), sapphire, 'PG&E', 'PGANDE WEB ONLINE PAYMENT', winter ? r(190, 240) : summer ? r(120, 150) : r(95, 130), 'cat_gas_and_electric');
    if (mi % 3 === 0) card(day(11), amex, 'Recology', 'RECOLOGY SUNSET SCAVENGER', 118.5, 'cat_garbage');

    // Variable spending
    const groceries = ri(6, 8);
    for (let i = 0; i < groceries; i++) {
      const [mer, orig] = pick([['Whole Foods', 'WHOLEFDS MKT #10234 SAN FRANCISCO CA'], ["Trader Joe's", "TRADER JOE'S #236 QPS SAN FRANCISCO CA"], ['Safeway', 'SAFEWAY #1490 OAKLAND CA'], ['Costco', 'COSTCO WHSE #0144 SAN FRANCISCO CA']]);
      card(day(ri(1, 28)), amex, mer, orig, mer === 'Costco' ? r(120, 260) : r(38, 145), 'cat_groceries');
    }
    const meals = ri(6, 11);
    for (let i = 0; i < meals; i++) {
      const [mer, orig] = pick([['Tartine', 'TST* TARTINE MANUFACTORY SAN FRANCISCO CA'], ['Chipotle', 'CHIPOTLE 2291 SAN FRANCISCO CA'], ['DoorDash', 'DOORDASH*THAI HOUSE 855-973-1040 CA'], ['Nopa', 'NOPA RESTAURANT SAN FRANCISCO CA'], ['Sweetgreen', 'SWEETGREEN MISSION SAN FRANCISCO CA'], ['Zeitgeist', 'SQ *ZEITGEIST SAN FRANCISCO CA']]);
      card(day(ri(1, 28)), amex, mer, orig, mer === 'Nopa' ? r(80, 160) : r(14, 62), 'cat_restaurants_and_bars');
    }
    const coffees = ri(8, 13);
    for (let i = 0; i < coffees; i++) {
      const [mer, orig] = pick([['Blue Bottle Coffee', 'SQ *BLUE BOTTLE COFFEE SAN FRANCISCO CA'], ['Starbucks', 'STARBUCKS STORE 05623 SAN FRANCISCO CA'], ["Philz Coffee", 'PHILZ COFFEE #12 SAN FRANCISCO CA']]);
      card(day(ri(1, 28)), sapphire, mer, orig, r(4.5, 8.75), 'cat_coffee_shops');
    }
    for (let i = 0; i < ri(2, 4); i++) card(day(ri(1, 28)), sapphire, pick(['Shell', 'Chevron']), 'SHELL OIL 57444 OAKLAND CA', r(42, 71), 'cat_gas');
    for (let i = 0; i < ri(1, 4); i++) card(day(ri(1, 28)), sapphire, 'Uber', 'UBER *TRIP HELP.UBER.COM CA', r(11, 38), 'cat_taxi_and_ride_shares');
    for (let i = 0; i < ri(3, 6); i++) card(day(ri(1, 28)), amex, 'Amazon', 'AMZN MKTP US*2K4LZ93T1 AMZN.COM/BILL WA', r(12, 110), 'cat_shopping');
    if (rnd() < 0.8) card(day(ri(1, 28)), amex, 'Target', 'TARGET 00027441 SAN FRANCISCO CA', r(25, 140), 'cat_shopping');
    if (rnd() < 0.5) card(day(ri(1, 28)), amex, pick(['Uniqlo', 'Nordstrom', 'Lululemon']), 'UNIQLO USA SAN FRANCISCO CA', r(45, 180), 'cat_clothing');
    if (rnd() < 0.6) card(day(ri(1, 28)), sapphire, 'Chewy', 'CHEWY.COM 800-672-4399 FL', r(38, 72), 'cat_pets');
    if (rnd() < 0.4) card(day(ri(1, 28)), sapphire, 'AMC Theatres', 'AMC METREON 16 #2345 SAN FRANCISCO CA', r(28, 55), 'cat_entertainment_and_recreation');
    if (rnd() < 0.35) card(day(ri(1, 28)), sapphire, 'Walgreens', 'WALGREENS #3243 SAN FRANCISCO CA', r(12, 48), 'cat_medical');
    if (mi % 2 === 1) card(day(ri(1, 28)), amex, 'Home Depot', 'THE HOME DEPOT #0628 SAN FRANCISCO CA', r(35, 240), 'cat_home_improvement');
    if (mi % 6 === 2) card(day(16), sapphire, 'Bay Area Dental', 'BAY AREA DENTAL GROUP', 180, 'cat_dentist');
    if (mi % 4 === 1) add(day(ri(3, 26)), checking, 'ATM Withdrawal', 'ATM WITHDRAWAL 000932 MARKET ST', -100, 'cat_cash_and_atm');
    if (rnd() < 0.5) card(day(ri(1, 28)), sapphire, 'Lyft', 'LYFT *RIDE SUN 8PM', r(14, 32), 'cat_taxi_and_ride_shares', { tags: rnd() < 0.3 ? [tReimb.id] : [] });
    if (mi % 3 === 2) add(day(ri(5, 25)), checking, 'Red Cross', 'AMERICAN RED CROSS DONATION', -100, 'cat_charity', { tags: [tTax.id] });

    // Trips: a summer vacation and a winter holiday.
    if (m.slice(5) === '07' || m.slice(5) === '12') {
      card(day(9), sapphire, 'Delta Air Lines', 'DELTA AIR 0062345678901 ATLANTA GA', r(540, 880), 'cat_travel_and_vacation', { tags: [tVacation.id] });
      card(day(19), sapphire, 'Airbnb', 'AIRBNB * HMQ4Z2KX9 SAN FRANCISCO CA', r(1100, 1650), 'cat_travel_and_vacation', { tags: [tVacation.id] });
      for (let i = 0; i < 4; i++) card(day(20 + i), sapphire, pick(['Local Restaurant', 'Beach Bar', 'Seafood Shack']), 'SQ *LOCAL RESTAURANT', r(40, 120), 'cat_restaurants_and_bars', { tags: [tVacation.id] });
    }
    if (m.slice(5) === '12') for (let i = 0; i < 5; i++) card(day(ri(1, 20)), amex, pick(['Amazon', 'Target', 'Etsy']), 'ETSY.COM - HOLIDAY', r(25, 140), 'cat_gifts');
    if (m.slice(5) === '04') add(day(15), checking, 'IRS', 'IRS USATAXPYMT 2204', -1850, 'cat_taxes');
    if (m.slice(5) === '03') add(day(2), checking, 'Acme Corp', 'ACME CORP BONUS DIRECT DEP', 6200, 'cat_paychecks');
  });

  // Pay last month's card balance in full on the 25th.
  months.forEach((m) => {
    for (const c of [sapphire, amex]) {
      const prev = addMonths(m, -1);
      const bal = cardSpend.get(`${prev}|${c.id}`);
      if (!bal) continue;
      const due = `${m}-25`;
      add(due, checking, `${c.institution} Credit Card Payment`, `${c.institution.toUpperCase()} EPAYMENT ACH PMT`, -bal, 'cat_credit_card_payment');
      add(due, c, 'Payment Thank You', 'AUTOPAY PAYMENT - THANK YOU', bal, 'cat_credit_card_payment');
    }
  });

  // A refund, a split, and a couple of uncategorized items to review.
  const recent = addDays(end, -4);
  add(addDays(end, -9), amex, 'Amazon', 'AMZN MKTP US REFUND', 42.18, 'cat_shopping', { notes: 'Returned headphones' });
  add(recent, sapphire, 'Venmo', 'VENMO *J SMITH', -60, 'cat_uncategorized', { reviewed: false });
  add(addDays(end, -2), checking, 'Check #1043', 'CHECK 1043', -350, 'cat_uncategorized', { reviewed: false });
  const costco = { id: uid('txn'), date: addDays(end, -6), accountId: amex.id, merchant: 'Costco', originalDescription: 'COSTCO WHSE #0144 SAN FRANCISCO CA',
    amount: -312.44, categoryId: 'cat_groceries', tags: [], notes: 'Groceries + a new vacuum', reviewed: false, hidden: false,
    splits: [{ id: uid('spl'), amount: -182.44, categoryId: 'cat_groceries' }, { id: uid('spl'), amount: -130, categoryId: 'cat_furniture_and_housewares' }] };
  if (costco.date >= start) tx.push(costco);

  s.transactions = tx.sort((a, b) => (a.date < b.date ? 1 : -1));

  // Budgets (set once at the start; they carry forward month to month).
  const b = {
    cat_paychecks: 8900, cat_interest: 55, cat_mortgage: 2746, cat_auto_payment: 425, cat_insurance: 133, cat_water: 85,
    cat_child_care: 1150, cat_subscriptions: 31, cat_fitness: 185, cat_internet_and_cable: 90, cat_phone: 140,
    cat_gas_and_electric: 160, cat_garbage: 40, cat_groceries: 800, cat_restaurants_and_bars: 450, cat_coffee_shops: 75,
    cat_gas: 150, cat_taxi_and_ride_shares: 100, cat_shopping: 420, cat_clothing: 75, cat_pets: 50,
    cat_entertainment_and_recreation: 40, cat_medical: 40, cat_home_improvement: 100, cat_dentist: 30,
    cat_travel_and_vacation: 400, cat_gifts: 60, cat_charity: 35, cat_taxes: 150, cat_cash_and_atm: 25,
  };
  s.budgets[startMonth] = { ...b, __flex: 1900 };
  for (const id of ['cat_travel_and_vacation', 'cat_home_improvement', 'cat_gifts', 'cat_garbage', 'cat_dentist']) {
    const c = s.categories.find((x) => x.id === id);
    c.rollover = true; c.rolloverStart = startMonth;
  }

  // Rules
  s.rules.push(
    { id: uid('rule'), name: 'Venmo is a transfer', enabled: true, conditions: { field: 'merchant', op: 'contains', value: 'venmo' }, actions: { categoryId: 'cat_transfer' } },
    { id: uid('rule'), name: 'Lyft for work', enabled: true, conditions: { field: 'merchant', op: 'contains', value: 'lyft', amountOp: 'gt', amount: 25 }, actions: { tagIds: [tReimb.id] } },
  );

  // Recurring: confirm the big fixed bills; leave the rest for auto-detection to suggest.
  const rec = (merchant, amount, frequency, categoryId, accountId, dayOfMonth) => {
    const last = [...s.transactions].find((t) => t.merchant === merchant);
    const nextDate = last ? addMonths(last.date, 1) : addMonths(`${currentMonth()}-${String(dayOfMonth).padStart(2, '0')}`, 0);
    s.recurring.push({ id: uid('rec'), merchantKey: merchant.toLowerCase().replace(/[^a-z0-9]+/g, ''), merchant, amount, frequency, categoryId, accountId, lastDate: last?.date, nextDate, active: true });
  };
  rec('Rocket Mortgage', -2745.18, 'monthly', 'cat_mortgage', checking.id, 1);
  rec('Bright Horizons', -1150, 'monthly', 'cat_child_care', checking.id, 20);
  rec('Netflix', -15.49, 'monthly', 'cat_subscriptions', sapphire.id, 3);
  rec('Comcast Xfinity', -89.99, 'monthly', 'cat_internet_and_cable', sapphire.id, 14);

  // Goals
  s.goals.push(
    { id: uid('goal'), name: 'Emergency fund', icon: '🛟', target: 45000, targetDate: addMonths(end, 14), accountId: savings.id, monthlyContribution: 1500 },
    { id: uid('goal'), name: 'Japan trip', icon: '🗾', target: 8000, targetDate: addMonths(end, 9), startingAmount: 1500, monthlyContribution: 500,
      contributions: [{ id: uid('c'), date: addMonths(end, -2), amount: 500 }, { id: uid('c'), date: addMonths(end, -1), amount: 500 }] },
    { id: uid('goal'), name: 'Kitchen remodel', icon: '🍳', target: 25000, targetDate: addMonths(end, 30), startingAmount: 4200, monthlyContribution: 600, contributions: [] },
  );

  // Holdings sized to the latest brokerage / 401k snapshots.
  const hold = (a, ticker, name, weight, price, assetClass, total, gainPct) => {
    const value = total * weight;
    s.holdings.push({ id: uid('hold'), accountId: a.id, ticker, name, shares: round2(value / price), price, costBasis: round2(value / (1 + gainPct)), assetClass, priceDate: end });
  };
  hold(brokerage, 'VTI', 'Vanguard Total Stock Market ETF', 0.5, 312.4, 'US stocks', brk, 0.34);
  hold(brokerage, 'VXUS', 'Vanguard Total Intl Stock ETF', 0.2, 68.1, 'International stocks', brk, 0.12);
  hold(brokerage, 'BND', 'Vanguard Total Bond Market ETF', 0.15, 73.2, 'Bonds', brk, -0.03);
  hold(brokerage, 'AAPL', 'Apple Inc.', 0.1, 231.5, 'US stocks', brk, 0.61);
  hold(brokerage, 'VMFXX', 'Vanguard Federal Money Market', 0.05, 1, 'Cash', brk, 0);
  hold(k401, 'FXAIX', 'Fidelity 500 Index Fund', 0.7, 214.8, 'US stocks', ret, 0.42);
  hold(k401, 'FTIHX', 'Fidelity Total Intl Index', 0.2, 15.3, 'International stocks', ret, 0.15);
  hold(k401, 'FXNAX', 'Fidelity US Bond Index', 0.1, 10.4, 'Bonds', ret, -0.02);

  s.settings.budgetMode = 'category';
  s.demo = true;
  return s;
}

