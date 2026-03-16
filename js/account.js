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

const API = (typeof INTERNAL_API_URL !== 'undefined')
  ? INTERNAL_API_URL
  : 'https://ei-internal-production.up.railway.app';
const TOKEN_KEY = 'ei_loyalty_token';

// ── Level config ──────────────────────────────────────────────────────────────
const LEVELS = [
  { key: 'apprentice', label: 'Apprentice', min: 0,     next: 1000,  benefits: ['5 pts per €1 on every order', 'Access to the full rewards shop', 'Earn 2,500 pts per successful referral'], next_teaser: 'Reach Journeyman to unlock 2% off all consumables' },
  { key: 'journeyman', label: 'Journeyman', min: 1000,  next: 5000,  benefits: ['2% off all consumables on every order', '5 pts per €1 on every order', 'Earn 2,500 pts per successful referral'], next_teaser: 'Reach Artist to unlock 5% off consumables' },
  { key: 'artist',     label: 'Artist',     min: 5000,  next: 10000, benefits: ['5% off all consumables on every order', 'Selected new product previews', 'Earn 2,500 pts per successful referral'], next_teaser: 'Reach Master to unlock 7% off consumables' },
  { key: 'master',     label: 'Master',     min: 10000, next: 15000, benefits: ['7% off all consumables on every order', 'Faster email support — replies within 24h', 'Selected new product previews'], next_teaser: 'Reach Legend to unlock 10% off consumables' },
  { key: 'legend',     label: 'Legend',     min: 15000, next: null,  benefits: ['10% off all consumables on every order', 'Direct line — WhatsApp support', 'Product requests considered for next restock'], next_teaser: null },
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

// ── Badges ────────────────────────────────────────────────────────────────────
const ALL_BADGES = [
  {
    key: 'first_session',
    name: 'First Session',
    desc: 'Made your first purchase',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`
  },
  {
    key: 'voltage_rising',
    name: 'Voltage Rising',
    desc: '5+ orders in one year',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
  },
  {
    key: 'crew_builder',
    name: 'Crew Builder',
    desc: 'Referred 3+ artists',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
  },
  {
    key: 'studio_voice',
    name: 'Studio Voice',
    desc: '10+ verified reviews',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
  },
  {
    key: 'machine_head',
    name: 'Machine Head',
    desc: 'Purchased a machine €300+',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`
  },
  {
    key: 'full_setup',
    name: 'Full Setup',
    desc: 'Bought from 5 categories',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
  },
  {
    key: 'black_cat_veteran',
    name: 'Black Cat Veteran',
    desc: '1 year with Electric Ink',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/><path d="M12 6v6l4 2"/></svg>`
  }
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
        const stateClass = isEarned ? 'earned' : 'locked';
        const statusLabel = isEarned ? 'Unlocked' : 'Locked';
        return `
          <div class="badge-card ${stateClass}"
               ontouchend="this.classList.toggle('flipped')">
            <div class="badge-card-inner">
              <div class="badge-front">
                <div class="badge-icon">${b.icon}</div>
                <div class="badge-name">${b.name}</div>
                <div class="badge-desc">${isEarned ? dateStr : ''}</div>
                <span class="badge-tap-hint">tap</span>
              </div>
              <div class="badge-back">
                <div class="badge-back-title">${b.name}</div>
                <div class="badge-back-desc">${b.desc}</div>
                <span class="badge-back-status">${statusLabel}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
  } catch {
    el.innerHTML = '<div class="list-empty">Could not load badges.</div>';
  }
}

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
    if (window.toast) window.toast.success('Welcome back!', 3000);
    await loadDashboard();
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    setLoading(btn, false);
  }
}

// Real-time code availability check
(function() {
  const input = document.getElementById('registerCustomCode');
  if (!input) return;
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const msgEl = document.getElementById('codeCheckMsg');
    const val = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!val || val.length < 2) {
      if (msgEl) msgEl.style.display = 'none';
      return;
    }
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/auth/check-code?code=EI-${val}`);
        const data = await res.json();
        if (msgEl) {
          msgEl.style.display = 'block';
          if (data.available) {
            msgEl.style.color = '#43BDAB';
            msgEl.textContent = `EI-${val} is available ✓`;
          } else {
            msgEl.style.color = '#c0392b';
            msgEl.textContent = `EI-${val} is already taken`;
          }
        }
      } catch {}
    }, 500);
  });
})();

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerSubmit');
  const errorEl = document.getElementById('registerError');
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const referralRaw = document.getElementById('registerReferral')?.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
  const referral_code = referralRaw ? `EI-${referralRaw}` : undefined;
  const custom_code = undefined;

  setLoading(btn, true);
  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, referral_code, custom_code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    localStorage.setItem(TOKEN_KEY, data.token);
    currentToken = data.token;
    if (window.toast) window.toast.success('Account created — +250 pts on your first purchase!', 5000);
    await loadDashboard();
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    setLoading(btn, false);
  }
}

function handleSignout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('ei_last_level');
  localStorage.removeItem('ei_last_pts');
  currentToken = null;
  currentCustomer = null;
  if (window.toast) window.toast.info('Signed out successfully', 3000);
  showAuthWall();
}

// ── Dashboard loader ──────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    if (res.status === 401 || res.status === 404) {
      localStorage.removeItem(TOKEN_KEY);
      showAuthWall();
      return;
    }

    const data = await res.json();
    currentCustomer = data.customer;
    currentPoints = data.customer.loyalty_points_total || 0;

    showDashboard();
    renderHeader(data.customer);
    renderOverview(data.customer, data.missions || [], data.points_earned || 0);
    renderHistory(data.points_history || []);
    renderActiveCoupons();
    await loadAndRenderBadges();
    // Load rewards and orders in parallel
    loadRewards();
    loadOrders(data.customer.email);

    // ── Loyalty toasts ──────────────────────────────
    const _pts   = data.customer.loyalty_points_total || 0;
    const _level = data.customer.loyalty_level || 'apprentice';
    const _prevLevel = localStorage.getItem('ei_last_level');
    const _prevPts   = parseInt(localStorage.getItem('ei_last_pts') || '0', 10);

    const _iconStar = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="display:inline-block;vertical-align:middle;margin-right:6px;flex-shrink:0"><path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" stroke="#43BDAB" stroke-width="1.8" stroke-linejoin="round" fill="none"/></svg>`;
    const _iconArrow = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" style="display:inline-block;vertical-align:middle;margin-right:6px;flex-shrink:0"><path d="M10 16V4M4 10l6-6 6 6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const _levelLabels = {
      journeyman: 'Journeyman', artist: 'Artist',
      master: 'Master', legend: 'Legend'
    };

    if (_prevLevel && _prevLevel !== _level && _levelLabels[_level]) {
      if (window.toast) window.toast.success(
        `${_iconStar} Level up — you reached ${_levelLabels[_level]}`, 6000
      );
    } else if (_pts > _prevPts && _prevPts > 0) {
      const _earned = _pts - _prevPts;
      if (window.toast) window.toast.success(
        `${_iconArrow} +${_earned.toLocaleString()} Ink Points added`, 4000
      );
    }

    localStorage.setItem('ei_last_level', _level);
    localStorage.setItem('ei_last_pts', String(_pts));

  } catch (err) {
    console.error('loadDashboard error:', err);
    localStorage.removeItem(TOKEN_KEY);
    showAuthWall();
  }
}

// ── Header ────────────────────────────────────────────────────────────────────
function renderHeader(customer) {
  const initial = (customer.name || 'U').charAt(0).toUpperCase();
  // Hidden — kept for JS compatibility
  document.getElementById('acctAvatar').textContent = initial;
  document.getElementById('acctName').textContent = customer.name || '—';
  document.getElementById('acctEmail').textContent = customer.email || '—';
  // Visible integrated header bar
  const avatarBar = document.getElementById('acctAvatarBar');
  if (avatarBar) {
    avatarBar.textContent = initial;
    document.getElementById('acctNameBar').textContent = customer.name || '—';
    document.getElementById('acctEmailBar').textContent = customer.email || '—';
  }
}

// ── Overview ──────────────────────────────────────────────────────────────────
function renderOverview(customer, missions, pointsEarned) {
  const pts = customer.loyalty_points_total || 0;
  const earned = pointsEarned || pts;
  const level = getLevelData(customer.loyalty_level || 'apprentice');

  document.getElementById('ptsNum').textContent = pts.toLocaleString();
  document.getElementById('balPts').textContent = `${pts.toLocaleString()} pts`;

  const badge = document.getElementById('levelBadge');
  badge.className = `level-badge lv-${level.key}`;
  document.getElementById('levelName').textContent = level.label;

  // Progress bar uses total earned (never goes down)
  const next = LEVELS.find(l => l.min > earned);
  const current = getLevelData(customer.loyalty_level || 'apprentice');
  if (next) {
    const pct = Math.min(100, Math.round(((earned - current.min) / (next.min - current.min)) * 100));
    document.getElementById('progFill').style.width = `${pct}%`;
    document.getElementById('progCount').textContent = `${earned.toLocaleString()} / ${next.min.toLocaleString()} pts earned`;
    document.getElementById('progLabel').textContent = `Progress to ${next.label}`;
    document.getElementById('progStart').textContent = current.label;
    document.getElementById('progEnd').textContent = `${next.label} · ${next.min.toLocaleString()} pts`;
  } else {
    document.getElementById('progFill').style.width = '100%';
    document.getElementById('progCount').textContent = 'Max level reached';
    document.getElementById('progLabel').textContent = 'Legend status';
    document.getElementById('progStart').textContent = '';
    document.getElementById('progEnd').textContent = '';
  }

  // Level benefits
  const benefitsEl = document.getElementById('levelBenefits');
  if (benefitsEl && level.benefits) {
    benefitsEl.innerHTML = level.benefits.map(b => `
      <div class="level-benefit">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#43BDAB" stroke-width="2"/>
          <path d="M6 10l3 3 5-6" stroke="#43BDAB" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>${b}</span>
      </div>
    `).join('');
  }

  LEVELS.forEach(l => {
    const el = document.getElementById(`lv-${l.key}`);
    if (el) el.className = `lv${l.key === level.key ? ` lv-cur-${level.key}` : ''}`;
  });

  document.getElementById('refCode').textContent = customer.referral_code || '—';

  const monthName = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
  document.getElementById('missionsLabel').textContent = `Monthly missions — ${monthName}`;
  const resetEl = document.getElementById('missionsReset');
  if (resetEl) {
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysLeft = Math.ceil((nextReset - now) / (1000 * 60 * 60 * 24));
    resetEl.textContent = `Resets in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} · 1st of every month`;
  }

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
    const res = await fetch(`${API}/api/loyalty/rewards`, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
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

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      showAuthWall();
      return;
    }
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
    if (window.toast) window.toast.success(
      `Coupon ${data.coupon_code} ready to use — check your Coupons tab`, 5000
    );
    // Navigate to Coupons tab after short delay
    setTimeout(() => {
      const couponsBtn = document.querySelector('[onclick*="goTab(\'coupons\'"]');
      if (couponsBtn) goTab('coupons', couponsBtn);
    }, 1500);
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

// ── Active Coupons ────────────────────────────────────────────────────────────
async function renderActiveCoupons() {
  const el = document.getElementById('activeCoupons');
  if (!el) return;

  // Immediate render from localStorage while fetch loads
  try {
    const cached = JSON.parse(localStorage.getItem('inkpoints_coupons') || '[]');
    if (cached.length) {
      el.innerHTML = cached.map(c => `
        <div class="h-row" style="align-items:center;gap:12px;">
          <div style="flex:1;">
            <div class="h-action">${c.reward}</div>
            <div class="h-desc" style="font-family:monospace;font-size:13px;
              letter-spacing:0.05em;color:#111;margin-top:2px;">${c.code}</div>
            <div class="h-date" style="margin-top:2px;">${formatDate(c.date)}</div>
          </div>
          <button class="btn-outline-teal" style="font-size:12px;padding:6px 12px;"
            onclick="navigator.clipboard.writeText('${c.code}').then(()=>{
              this.textContent='Copied!';
              setTimeout(()=>this.textContent='Copy',2000)
            })">Copy</button>
        </div>
      `).join('');
    }
  } catch {}

  // Fetch from backend and replace
  if (!currentToken) return;
  try {
    const res = await fetch(`${API}/api/loyalty/redemptions`, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });
    if (!res.ok) return;
    const rows = await res.json();

    const active = rows.filter(r => r.status === 'active');

    if (!active.length) {
      el.innerHTML = '<div class="list-empty">No active coupons.</div>';
      localStorage.removeItem('inkpoints_coupons');
      return;
    }

    // Sync localStorage with backend data
    const synced = active.map(r => ({
      code: r.stripe_coupon_id,
      reward: r.reward_name,
      points: r.points_spent,
      date: r.created_at
    }));
    localStorage.setItem('inkpoints_coupons', JSON.stringify(synced));

    el.innerHTML = active.map(r => `
      <div class="h-row" style="align-items:center;gap:12px;">
        <div style="flex:1;">
          <div class="h-action">${r.reward_name}</div>
          <div class="h-desc" style="font-family:monospace;font-size:13px;
            letter-spacing:0.05em;color:#111;margin-top:2px;">
            ${r.stripe_coupon_id}</div>
          <div class="h-date" style="margin-top:2px;">${formatDate(r.created_at)}</div>
        </div>
        <button class="btn-outline-teal" style="font-size:12px;padding:6px 12px;"
          onclick="navigator.clipboard.writeText('${r.stripe_coupon_id}').then(()=>{
            this.textContent='Copied!';
            setTimeout(()=>this.textContent='Copy',2000)
          })">Copy</button>
      </div>
    `).join('');
  } catch (err) {
    console.warn('[InkPoints] renderActiveCoupons fetch failed', err);
  }
}

// ── History ───────────────────────────────────────────────────────────────────
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
    badge: 'Badge earned',
    anniversary: 'Anniversary bonus',
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
    const res = await fetch(`${API}/api/loyalty/my-orders`, {
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