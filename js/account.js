/**
 * account.js — Ink Points Dashboard
 * Electric Ink Ireland
 *
 * Connects to: https://ei-internal-production.up.railway.app
 * Endpoints used:
 *   POST /api/auth/login
 *   POST /api/auth/register
 *   GET  /api/auth/me
 *   GET  /api/loyalty/rewards
 *   POST /api/loyalty/redeem
 *   GET  /api/loyalty/redemptions
 *   GET  /api/sales  (filtered by customer email)
 */

const API = 'https://ei-internal-production.up.railway.app';
const TOKEN_KEY = 'ei_loyalty_token';

// ── Level config ──────────────────────────────────────────────────────────────
const LEVELS = [
  { key: 'apprentice', label: 'Apprentice', min: 0,     next: 1000  },
  { key: 'journeyman', label: 'Journeyman', min: 1000,  next: 5000  },
  { key: 'artist',     label: 'Artist',     min: 5000,  next: 10000 },
  { key: 'master',     label: 'Master',     min: 10000, next: 15000 },
  { key: 'legend',     label: 'Legend',     min: 15000, next: null  },
];

// Mission display config
const MISSION_CONFIG = {
  spend_threshold: {
    name: 'Ink Haul',
    desc: 'Place a single order of €150 or more this month and earn bonus points on top of your usual spend.',
    pts: '+300 pts',
  },
  category_focus: {
    name: 'Category Master',
    desc: 'Order 3 or more items from the same product category in a single purchase.',
    pts: '+200 pts',
  },
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentToken = null;
let currentCustomer = null;
let currentPoints = 0;
let allRewards = [];

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentToken = localStorage.getItem(TOKEN_KEY);
  if (currentToken) {
    loadDashboard();
  } else {
    showAuthWall();
  }
});

// ── Auth wall ─────────────────────────────────────────────────────────────────
function showAuthWall() {
  document.getElementById('authWall').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
  document.getElementById('authWall').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
}

function switchAuthTab(tab) {
  const loginWrap = document.getElementById('loginFormWrap');
  const registerWrap = document.getElementById('registerFormWrap');
  const loginBtn = document.getElementById('tabLoginBtn');
  const registerBtn = document.getElementById('tabRegisterBtn');

  if (tab === 'login') {
    loginWrap.style.display = 'block';
    registerWrap.style.display = 'none';
    loginBtn.classList.add('active');
    registerBtn.classList.remove('active');
  } else {
    loginWrap.style.display = 'none';
    registerWrap.style.display = 'block';
    loginBtn.classList.remove('active');
    registerBtn.classList.add('active');
  }

  // Clear errors
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('registerError').style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginSubmit');
  const errorEl = document.getElementById('loginError');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  setLoading(btn, true);
  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem(TOKEN_KEY, data.token);
    currentToken = data.token;
    await loadDashboard();
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    setLoading(btn, false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerSubmit');
  const errorEl = document.getElementById('registerError');
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const referral_code = document.getElementById('registerReferral').value.trim().toUpperCase() || undefined;

  setLoading(btn, true);
  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, referral_code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    localStorage.setItem(TOKEN_KEY, data.token);
    currentToken = data.token;
    await loadDashboard();
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    setLoading(btn, false);
  }
}

function handleSignout() {
  localStorage.removeItem(TOKEN_KEY);
  currentToken = null;
  currentCustomer = null;
  showAuthWall();
}

// ── Dashboard loader ──────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      showAuthWall();
      return;
    }

    const data = await res.json();
    currentCustomer = data.customer;
    currentPoints = data.customer.loyalty_points_total || 0;

    showDashboard();
    renderHeader(data.customer);
    renderOverview(data.customer, data.missions || []);
    renderHistory(data.points_history || []);
    renderActiveCoupons();
    await loadAndRenderBadges();
    // Load rewards and orders in parallel
    loadRewards();
    loadOrders(data.customer.email);

  } catch (err) {
    console.error('loadDashboard error:', err);
    localStorage.removeItem(TOKEN_KEY);
    showAuthWall();
  }
}

// ── Header ────────────────────────────────────────────────────────────────────
function renderHeader(customer) {
  const initial = (customer.name || 'U').charAt(0).toUpperCase();
  document.getElementById('acctAvatar').textContent = initial;
  document.getElementById('acctName').textContent = customer.name || '—';
  document.getElementById('acctEmail').textContent = customer.email || '—';
}

// ── Overview ──────────────────────────────────────────────────────────────────
function renderOverview(customer, missions) {
  const pts = customer.loyalty_points_total || 0;
  const level = getLevelData(customer.loyalty_level || 'apprentice');

  // Points number
  document.getElementById('ptsNum').textContent = pts.toLocaleString();
  document.getElementById('balPts').textContent = `${pts.toLocaleString()} pts`;

  // Level badge
  const badge = document.getElementById('levelBadge');
  badge.className = `level-badge lv-${level.key}`;
  document.getElementById('levelName').textContent = level.label;

  // Progress bar
  const next = LEVELS.find(l => l.min > pts);
  const prev = getLevelData(customer.loyalty_level || 'apprentice');

  if (next) {
    const pct = Math.min(100, Math.round(((pts - prev.min) / (next.min - prev.min)) * 100));
    document.getElementById('progFill').style.width = `${pct}%`;
    document.getElementById('progCount').textContent = `${pts.toLocaleString()} / ${next.min.toLocaleString()} pts`;
    document.getElementById('progLabel').textContent = `Progress to ${next.label}`;
    document.getElementById('progStart').textContent = `${prev.label} · ${prev.min.toLocaleString()}`;
    document.getElementById('progEnd').textContent = `${next.label} · ${next.min.toLocaleString()}`;
  } else {
    // Legend — max level
    document.getElementById('progFill').style.width = '100%';
    document.getElementById('progCount').textContent = 'Max level reached';
    document.getElementById('progLabel').textContent = 'Legend status';
    document.getElementById('progStart').textContent = '';
    document.getElementById('progEnd').textContent = '';
  }

  // Highlight current level in strip
  LEVELS.forEach(l => {
    const el = document.getElementById(`lv-${l.key}`);
    if (el) el.className = `lv${l.key === level.key ? ` lv-cur-${level.key}` : ''}`;
  });

  // Referral code
  document.getElementById('refCode').textContent = customer.referral_code || '—';

  // Missions label with month
  const monthName = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
  document.getElementById('missionsLabel').textContent = `Monthly missions — ${monthName}`;

  // Render missions
  renderMissions(missions);
}

function renderMissions(missions) {
  const grid = document.getElementById('missionsGrid');
  const missionTypes = ['spend_threshold', 'category_focus'];

  grid.innerHTML = missionTypes.map(type => {
    const cfg = MISSION_CONFIG[type] || { name: type, desc: '', pts: '' };
    const mission = missions.find(m => m.mission_type === type);
    const done = mission && mission.completed;

    return `
      <div class="m-card${done ? ' done' : ''}">
        <div class="m-name">${cfg.name}</div>
        <div class="m-desc">${cfg.desc}</div>
        <div class="m-foot">
          <div class="m-pts">${cfg.pts}</div>
          <div class="${done ? 'badge-done' : 'badge-open'}">${done ? 'Completed' : 'Pending'}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Rewards ───────────────────────────────────────────────────────────────────
async function loadRewards() {
  try {
    const res = await fetch(`${API}/api/loyalty/rewards`);
    const rewards = await res.json();
    allRewards = rewards;
    renderRewards(rewards);
  } catch (err) {
    document.getElementById('rewardsGrid').innerHTML = '<div class="list-empty">Could not load rewards.</div>';
  }
}

function renderRewards(rewards) {
  const grid = document.getElementById('rewardsGrid');
  if (!rewards.length) {
    grid.innerHTML = '<div class="list-empty">No rewards available.</div>';
    return;
  }

  grid.innerHTML = rewards.map(r => {
    const cost = parseInt(r.points_cost);
    const canAfford = currentPoints >= cost;
    const typeLabel = r.reward_type === 'free_shipping' ? 'Coupon code'
      : r.reward_type === 'voucher' ? 'Discount code'
      : 'Free product';

    return `
      <div class="r-card" id="rcard-${r.id}">
        <div class="r-name">${r.name}</div>
        <div class="r-type">${typeLabel}</div>
        <div class="r-cost">${cost.toLocaleString()} <span>pts</span></div>
        <button
          class="r-btn ${canAfford ? 'can-afford' : 'cannot-afford'}"
          ${canAfford ? `onclick="redeemReward(${r.id})"` : 'disabled'}
        >${canAfford ? 'Redeem' : 'Not enough pts'}</button>
      </div>
    `;
  }).join('');
}

async function redeemReward(rewardId) {
  const btn = document.querySelector(`#rcard-${rewardId} .r-btn`);
  if (!btn || btn.disabled) return;

  const originalText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/loyalty/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ reward_id: rewardId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Redemption failed');

    // Update points
    currentPoints = data.points_remaining;
    document.getElementById('ptsNum').textContent = currentPoints.toLocaleString();
    document.getElementById('balPts').textContent = `${currentPoints.toLocaleString()} pts`;

    // Show coupon
    document.getElementById('couponCode').textContent = data.coupon_code;
    const reveal = document.getElementById('couponReveal');
    reveal.style.display = 'block';
    reveal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Persist coupon to localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('inkpoints_coupons') || '[]');
      saved.push({
        code: data.coupon_code,
        reward: data.reward_name,
        points: data.points_spent,
        date: new Date().toISOString()
      });
      localStorage.setItem('inkpoints_coupons', JSON.stringify(saved));
      renderActiveCoupons();
    } catch {}

    // Update button
    btn.textContent = 'Redeemed';
    btn.className = 'r-btn redeemed';

    // Refresh reward buttons
    renderRewards(allRewards);

  } catch (err) {
    btn.textContent = originalText;
    btn.disabled = false;
    alert(err.message);
  }
}

function copyCoupon() {
  const code = document.getElementById('couponCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.coupon-reveal .btn-outline-teal');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy code'; }, 2000);
    }
  });
}

// ── History ───────────────────────────────────────────────────────────────────
// ── Active Coupons ────────────────────────────────────────────────────────────
function renderActiveCoupons() {
  const el = document.getElementById('activeCoupons');
  if (!el) return;
  try {
    const saved = JSON.parse(localStorage.getItem('inkpoints_coupons') || '[]');
    if (!saved.length) {
      el.innerHTML = '<div class="list-empty">No active coupons.</div>';
      return;
    }
    el.innerHTML = saved.map((c, i) => `
      <div class="h-row" style="align-items:center;gap:12px;">
        <div style="flex:1;">
          <div class="h-action">${c.reward}</div>
          <div class="h-desc" style="font-family:monospace;font-size:13px;letter-spacing:0.05em;color:#111;margin-top:2px;">${c.code}</div>
          <div class="h-date" style="margin-top:2px;">${formatDate(c.date)}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-outline-teal" style="font-size:12px;padding:6px 12px;"
            onclick="navigator.clipboard.writeText('${c.code}').then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)})">Copy</button>
          <button class="btn-outline-teal" style="font-size:12px;padding:6px 12px;color:#999;border-color:#ddd;"
            onclick="removeActiveCoupon(${i})">Remove</button>
        </div>
      </div>
    `).join('');
  } catch {}
}

function removeActiveCoupon(index) {
  try {
    const saved = JSON.parse(localStorage.getItem('inkpoints_coupons') || '[]');
    saved.splice(index, 1);
    localStorage.setItem('inkpoints_coupons', JSON.stringify(saved));
    renderActiveCoupons();
  } catch {}
}

// ── Badges ────────────────────────────────────────────────────────────────────
const ALL_BADGES = [
  { key: 'first_session',     name: 'First Session',      desc: 'Made your first purchase' },
  { key: 'voltage_rising',    name: 'Voltage Rising',     desc: '5+ orders in one year' },
  { key: 'crew_builder',      name: 'Crew Builder',       desc: 'Referred 3+ artists' },
  { key: 'studio_voice',      name: 'Studio Voice',       desc: '10+ verified reviews' },
  { key: 'machine_head',      name: 'Machine Head',       desc: 'Purchased a machine €300+' },
  { key: 'full_setup',        name: 'Full Setup',         desc: 'Bought from 5 categories' },
  { key: 'black_cat_veteran', name: 'Black Cat Veteran',  desc: '1 year with Electric Ink' }
];

async function loadAndRenderBadges() {
  const el = document.getElementById('badgesGrid');
  if (!el) return;
  try {
    const res = await fetch(`${API}/api/loyalty/badges`, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
    const earned = res.ok ? await res.json() : [];
    const earnedKeys = new Set(earned.map(b => b.badge_key));
    el.innerHTML = ALL_BADGES.map(b => {
      const isEarned = earnedKeys.has(b.key);
      const earnedBadge = earned.find(e => e.badge_key === b.key);
      const dateStr = earnedBadge ? formatDate(earnedBadge.earned_at) : '';
      return `
        <div class="badge-card ${isEarned ? 'earned' : 'locked'}">
          <div class="badge-icon">${isEarned ? '⚡' : '🔒'}</div>
          <div class="badge-name">${b.name}</div>
          <div class="badge-desc">${isEarned ? dateStr : b.desc}</div>
        </div>
      `;
    }).join('');
  } catch {
    el.innerHTML = '<div class="list-empty">Could not load badges.</div>';
  }
}

function renderHistory(history) {
  const el = document.getElementById('historyList');
  if (!history.length) {
    el.innerHTML = '<div class="list-empty">No transactions yet.</div>';
    return;
  }

  const actionLabels = {
    purchase: 'Purchase',
    welcome_bonus: 'Welcome bonus',
    mission: 'Mission completed',
    referral: 'Referral bonus',
    redemption: 'Redemption',
  };

  el.innerHTML = history.map(h => {
    const pts = parseInt(h.points);
    const pos = pts >= 0;
    const label = actionLabels[h.action] || h.action;
    const date = formatDate(h.created_at);

    return `
      <div class="h-row">
        <div>
          <div class="h-action">${label}</div>
          <div class="h-desc">${h.description || ''}</div>
        </div>
        <div class="h-right">
          <div class="${pos ? 'h-pos' : 'h-neg'}">${pos ? '+' : ''}${pts.toLocaleString()}</div>
          <div class="h-date">${date}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Orders ────────────────────────────────────────────────────────────────────
async function loadOrders(email) {
  const el = document.getElementById('ordersList');
  if (!email) {
    el.innerHTML = '<div class="list-empty">No orders found.</div>';
    return;
  }

  try {
    // Find customer id first, then get sales by email
    const res = await fetch(`${API}/api/sales`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    if (!res.ok) throw new Error('Failed');

    const allSales = await res.json();
    const orders = allSales
      .filter(s => s.customer_email && s.customer_email.toLowerCase() === email.toLowerCase())
      .slice(0, 20);

    if (!orders.length) {
      el.innerHTML = '<div class="list-empty">No orders found.</div>';
      return;
    }

    el.innerHTML = orders.map(o => {
      const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
      const itemCount = Array.isArray(items) ? items.reduce((sum, i) => sum + (i.qty || i.quantity || 1), 0) : 0;
      const total = parseFloat(o.total || 0).toFixed(2);
      const date = formatDate(o.created_at);
      const status = o.status || 'pending';
      const pillClass = status === 'shipped' ? 'p-shipped'
        : status === 'cancelled' ? 'p-cancelled'
        : status === 'processing' ? 'p-processing'
        : 'p-pending';

      return `
        <div class="o-row">
          <div>
            <div class="o-num">Order #${o.order_number || o.id.slice(0, 8)}</div>
            <div class="o-meta">${date} · €${total}${itemCount ? ` · ${itemCount} item${itemCount !== 1 ? 's' : ''}` : ''}</div>
          </div>
          <div class="o-pill ${pillClass}">${capitalize(status)}</div>
        </div>
      `;
    }).join('');

  } catch (err) {
    el.innerHTML = '<div class="list-empty">Could not load orders.</div>';
  }
}

// ── Referral copy ─────────────────────────────────────────────────────────────
function copyReferral() {
  const code = document.getElementById('refCode').textContent;
  if (!code || code === '—') return;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.ref-code-wrap .btn-outline-teal');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy code'; }, 2000);
    }
  });
}

// ── Tab navigation ────────────────────────────────────────────────────────────
function goTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.getElementById(`tab-${id}`).classList.add('active');
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLevelData(levelKey) {
  return LEVELS.find(l => l.key === levelKey) || LEVELS[0];
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function setLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (text) text.style.display = loading ? 'none' : 'inline';
  if (loader) loader.style.display = loading ? 'inline' : 'none';
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}