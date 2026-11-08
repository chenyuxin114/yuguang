(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const CATEGORIES = {
    餐饮: { icon: 'i-bowl' },
    房租: { icon: 'i-home' },
    医药: { icon: 'i-pulse' },
    交通: { icon: 'i-train' },
    学习: { icon: 'i-book' },
    生活: { icon: 'i-sun' },
    其他: { icon: 'i-spark' },
  };

  const CATEGORY_NAMES = Object.keys(CATEGORIES);
  const CITIES = ['上海', '北京', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '其他'];
  const AMOUNT_FILTERS = [
    { value: 'all', label: '不限金额' },
    { value: '0-100', label: '¥100 以下' },
    { value: '100-300', label: '¥100–300' },
    { value: '300-800', label: '¥300–800' },
    { value: '800+', label: '¥800 以上' },
  ];
  const REPORT_REASONS = ['虚假账单', '不当内容', '疑似诈骗', '其他'];
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function defaultFilters() {
    return { category: '全部', city: '全部', amount: 'all' };
  }

  const state = {
    me: null,
    publicMode: false,
    week: null,
    stats: null,
    filters: defaultFilters(),
    filterDraft: defaultFilters(),
    history: [],
    leaderboard: [],
    myPosition: null,
    myBills: [],
    myPayments: [],
    pending: [],
    prevLeaderboardAmounts: new Map(),
    route: 'home',
    billTab: 'pending',
    authRole: null,
    drawSeen: new Set(),
    previewId: null,
    modal: null,
    lastFocused: null,
    sse: null,
    refreshPromise: null,
    refreshTimer: null,
    clockTimer: null,
    loginBusy: false,
    sessionEpoch: 0,
  };

  const els = {
    authView: $('#authView'),
    appView: $('#appView'),
    homeView: $('#homeView'),
    leaderboardView: $('#leaderboardView'),
    modalRoot: $('#modalRoot'),
    toastRoot: $('#toastRoot'),
    loginForm: $('#loginForm'),
    loginName: $('#loginName'),
    loginError: $('#loginError'),
    loginSubmit: $('#loginSubmit'),
    publicBills: $('#publicBills'),
    publicAmount: $('#publicAmount'),
    headerWeek: $('#headerWeek'),
    headerAvatar: $('#headerAvatar'),
    headerName: $('#headerName'),
    headerRole: $('#headerRole'),
  };

  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
  }

  function icon(name, className = 'icon') {
    return `<svg class="${className}" aria-hidden="true"><use href="#${name}"></use></svg>`;
  }

  function firstChar(name) {
    return Array.from(String(name || '予'))[0] || '予';
  }

  function avatar(name, hue, size = '', extraClass = '') {
    const safeHue = Number.isFinite(Number(hue)) ? Math.round(Number(hue)) : 32;
    return `<span class="avatar ${size} ${extraClass}" style="--avatar-hue:${safeHue}" aria-hidden="true">${esc(firstChar(name))}</span>`;
  }

  const numberFormat = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  function numberText(amount) {
    return numberFormat.format(Number(amount) || 0);
  }

  function money(amount) {
    return `¥${numberText(amount)}`;
  }

  function compactMoney(amount) {
    const value = Number(amount) || 0;
    if (value >= 10000) {
      return `¥${(value / 10000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, '')}万`;
    }
    return money(value);
  }

  function categoryIcon(category) {
    return icon(CATEGORIES[category]?.icon || 'i-receipt');
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatDate(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    return `${date.getMonth() + 1}.${pad(date.getDate())}`;
  }

  function formatTime(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatJoined(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}`;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - Number(ts));
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return formatDate(ts);
  }

  function todayLabel() {
    const date = new Date();
    return `${WEEKDAYS[date.getDay()]} · ${date.getMonth() + 1}.${pad(date.getDate())}`;
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 5) return '夜深了';
    if (hour < 11) return '早上好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  function roleLabel(role) {
    return role === 'rich' ? '富人' : '平民';
  }

  function countdownHtml(end) {
    const remaining = Math.max(0, Number(end) - Date.now());
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${days > 0 ? `<b>${days}</b><small>天</small> ` : ''}<b>${pad(hours)}</b><small>:</small><b>${pad(minutes)}</b><small>:</small><b>${pad(seconds)}</b>`;
  }

  function routeFromHash() {
    const hash = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
    return hash === 'leaderboard' ? 'leaderboard' : 'home';
  }

  function initialRoute() {
    const params = new URLSearchParams(location.search);
    if (params.get('view') === 'leaderboard') return 'leaderboard';
    return routeFromHash();
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers,
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = null;
      }
    }
    if (!response.ok) {
      throw new ApiError(response.status, data?.error || `请求失败（${response.status}）`);
    }
    return data;
  }

  async function tryGetState() {
    try {
      return await api('/api/state');
    } catch (error) {
      if (error.status === 401) return null;
      throw error;
    }
  }

  function applyState(data) {
    const previousAmounts = new Map(state.leaderboard.map((entry) => [entry.id, entry.amount]));
    state.me = data.me;
    state.publicMode = Boolean(data.publicMode);
    state.week = data.week;
    state.stats = data.stats;
    state.leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];
    state.myPosition = data.myPosition || null;
    state.myBills = Array.isArray(data.myBills) ? data.myBills : [];
    state.myPayments = Array.isArray(data.myPayments) ? data.myPayments : [];
    state.pending = Array.isArray(data.pending) ? data.pending : [];
    state.history = Array.isArray(data.history) ? data.history : [];
    state.prevLeaderboardAmounts = previousAmounts;
    if (state.previewId && !state.pending.some((bill) => bill.id === state.previewId)) {
      state.previewId = state.pending[0]?.id || null;
    }
    if (!state.previewId && state.pending.length) {
      state.previewId = state.pending[0].id;
    }
  }

  async function refreshState({ render: shouldRender = true, silent = true } = {}) {
    if (state.refreshPromise) return state.refreshPromise;
    const epoch = state.sessionEpoch;
    const task = (async () => {
      const data = await tryGetState();
      if (epoch !== state.sessionEpoch) return null;
      if (!data) {
        handleSignedOut();
        return null;
      }
      applyState(data);
      if (shouldRender && state.me) render();
      return data;
    })();
    state.refreshPromise = task;

    try {
      return await task;
    } catch (error) {
      if (!silent) toast(error.message || '刷新失败，请稍后再试', 'error');
      return null;
    } finally {
      if (state.refreshPromise === task) state.refreshPromise = null;
    }
  }

  function amountMatches(amount, filter) {
    if (filter === '0-100') return amount < 100;
    if (filter === '100-300') return amount >= 100 && amount < 300;
    if (filter === '300-800') return amount >= 300 && amount < 800;
    if (filter === '800+') return amount >= 800;
    return true;
  }

  function filterBills(bills, filters) {
    return bills.filter((bill) => {
      if (filters.category !== '全部' && bill.category !== filters.category) return false;
      if (filters.city !== '全部' && (bill.city || '其他') !== filters.city) return false;
      return amountMatches(Number(bill.amount) || 0, filters.amount);
    });
  }

  function filteredPending(filters = state.filters) {
    return filterBills(state.pending, filters);
  }

  function activeFilterCount(filters = state.filters) {
    let count = 0;
    if (filters.category !== '全部') count += 1;
    if (filters.city !== '全部') count += 1;
    if (filters.amount !== 'all') count += 1;
    return count;
  }

  function filterSummary(filters = state.filters) {
    const parts = [];
    if (filters.category !== '全部') parts.push(filters.category);
    if (filters.city !== '全部') parts.push(filters.city);
    if (filters.amount !== 'all') {
      parts.push(AMOUNT_FILTERS.find((item) => item.value === filters.amount)?.label || '');
    }
    return parts.length ? parts.join(' · ') : '全部账单';
  }

  function render() {
    if (!state.me) {
      showAuth();
      return;
    }
    els.authView.hidden = true;
    els.appView.hidden = false;
    renderHeader();
    renderHome();
    renderLeaderboard();
    applyRoute(state.route, { scroll: false });
  }

  function renderHeader() {
    const me = state.me;
    if (!me) return;
    els.headerAvatar.style.setProperty('--avatar-hue', Number(me.hue) || 32);
    els.headerAvatar.textContent = firstChar(me.name);
    els.headerName.textContent = me.name;
    els.headerRole.textContent = roleLabel(me.role);
    els.headerWeek.textContent = state.week ? `本周 · ${state.week.rangeLabel}` : '本周';
  }

  function applyRoute(route, { scroll = false } = {}) {
    const next = route === 'leaderboard' ? 'leaderboard' : 'home';
    state.route = next;
    els.homeView.hidden = next !== 'home';
    els.leaderboardView.hidden = next !== 'leaderboard';
    $$('[data-nav]').forEach((button) => {
      const active = button.dataset.route === next;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $$('[data-tab]').forEach((button) => {
      if (button.dataset.tab === 'profile') return;
      const active = button.dataset.tab === next;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function welcomeKicker() {
    return `<p class="eyebrow"><span class="live-dot"></span>${todayLabel()} · 本周实时</p>`;
  }

  function renderHome() {
    if (!state.me) return;
    els.homeView.innerHTML = state.me.role === 'rich' ? richHomeHtml() : commonerHomeHtml();
  }

  function previewBill() {
    const bills = filteredPending();
    if (!bills.length) return null;
    return bills.find((bill) => bill.id === state.previewId) || bills[0];
  }

  function drawStackHtml(bill) {
    if (!bill) {
      return `<div class="draw-stack" data-action="draw" role="button" tabindex="0" aria-label="随机抽一张账单">
        <div class="draw-stack__card"></div>
        <div class="draw-stack__card"></div>
        <div class="draw-stack__card">
          <div class="draw-card__top"><span>YUGUANG</span><span>WAITING</span></div>
          <div class="draw-card__title">正在等一张<br>刚写下的账单</div>
          <div class="draw-card__bottom"><span class="draw-card__amount">¥—</span><span class="barcode"></span></div>
        </div>
      </div>`;
    }
    return `<div class="draw-stack" data-action="draw" role="button" tabindex="0" aria-label="随机抽一张账单">
      <div class="draw-stack__card" aria-hidden="true">
        <div class="draw-card__top"><span>YUGUANG</span><span>NO. 000</span></div>
        <div class="draw-card__title"></div>
      </div>
      <div class="draw-stack__card" aria-hidden="true">
        <div class="draw-card__top"><span>YUGUANG</span><span>NO. 000</span></div>
        <div class="draw-card__title"></div>
      </div>
      <div class="draw-stack__card">
        <div class="draw-card__top">
          <span>${esc(bill.code)}</span>
          <span class="draw-card__cat">${esc(bill.category)}</span>
        </div>
        <div class="draw-card__title">${esc(bill.title)}</div>
        <div class="draw-card__note">${esc(bill.note || '一张没有多说的账单。')}</div>
        <div class="draw-card__bottom">
          <span class="draw-card__amount">${money(bill.amount)}</span>
          <span class="barcode"></span>
        </div>
      </div>
    </div>`;
  }

  function richHomeHtml() {
    const me = state.me;
    const stats = state.stats || {};
    const position = state.myPosition || { rank: null, amount: 0, billCount: 0 };
    const bill = previewBill();
    const payments = state.myPayments.slice(0, 4);
    const pending = filteredPending();
    const filterCount = activeFilterCount();
    const rankText = position.rank ? `第 <b>${position.rank}</b> 名` : '尚未上榜';

    const paymentRows = payments.length
      ? payments.map((payment) => `
        <div class="history-row ${payment.thanks ? 'has-thanks' : ''}">
          <span class="history-row__icon">${categoryIcon(payment.category)}</span>
          <span class="history-row__copy">
            <span class="history-row__title">${esc(payment.title)}</span>
            ${payment.thanks
              ? `<span class="history-row__thanks">${icon('i-mail')}“${esc(payment.thanks)}”</span>`
              : `<span class="history-row__meta">${timeAgo(payment.paidAt)} · ${esc(payment.owner.name)}</span>`}
          </span>
          <span class="history-row__meta">${payment.thanks ? timeAgo(payment.thanksAt) : ''}</span>
          <span class="history-row__amount">${money(payment.amount)}</span>
        </div>`).join('')
      : `<div class="small-empty">
          <span class="small-empty__mark">${icon('i-spark')}</span>
          <span>本周还没有出手。第一张账单，或许就在上面。</span>
        </div>`;

    return `
      <div class="welcome">
        <div>
          ${welcomeKicker()}
          <h1>${greeting()}，${esc(me.name)}。<br><em>今天，想接住谁？</em></h1>
        </div>
        <p class="welcome__note">
          ${icon('i-spark')}
          <span>本周已有 <strong>${stats.paidBillsWeek || 0}</strong> 张账单，被 <strong>${stats.richParticipants || 0}</strong> 位富人接住。</span>
        </p>
      </div>

      <div class="home-grid">
        <div class="home-main">
          <article class="draw-hero">
            <div class="draw-hero__top">
              <span class="pill"><span class="live-dot live-dot--gold"></span> WEEKLY GIVING · LIVE</span>
              <p class="draw-hero__stats">本周已送出 <b>${money(position.amount)}</b><i></i>${rankText}</p>
            </div>
            <div class="draw-hero__body">
              <div class="draw-copy">
                <p class="eyebrow"><span class="live-dot live-dot--gold"></span> RANDOM ENCOUNTER</p>
                <h2>翻开一张<br>陌生人的账单</h2>
                <p>不看身份，不问缘由。只凭眼缘，替 TA 结掉这一笔。</p>
                <div class="draw-actions">
                  <button class="btn btn--cream" type="button" data-action="draw">随机抽一张 ${icon('i-arrow')}</button>
                  <button class="btn btn--ghost-light btn--sm filter-trigger" type="button" data-action="open-filters">${icon('i-filter')} 筛选${filterCount ? ` · ${filterCount}` : ''}</button>
                  <span class="draw-count"><b>${pending.length}</b> 张可抽</span>
                </div>
              </div>
              ${drawStackHtml(bill)}
            </div>
            <div class="draw-hero__foot">
              <span class="${filterCount ? 'is-filtered' : ''}">${filterCount ? `${icon('i-filter')} ${filterSummary()} · ${pending.length} 张` : '每一张账单，都只等一次不期而遇。'}</span>
              <span>不是施舍，是刚好看见。</span>
            </div>
          </article>

          <section class="panel history-panel">
            <div class="panel__head">
              <h2 class="panel__title">本周由你接住 <span class="tag tag--moss">${state.myPayments.length} 张</span></h2>
              <button class="panel__link" type="button" data-action="go" data-route="leaderboard">完整榜单 ${icon('i-chevron')}</button>
            </div>
            <div class="history-list">${paymentRows}</div>
          </section>
        </div>

        <aside class="side-stack">
          ${rankPreviewHtml()}
          <section class="quote-card">
            ${icon('i-quote', 'quote-card__mark')}
            <p>善意不是一次性的烟火，是有人记得把灯留着。</p>
            <footer>予光手记 · 第 01 期</footer>
          </section>
        </aside>
      </div>`;
  }

  function rankPreviewHtml() {
    const rows = state.leaderboard.slice(0, 5).map((entry) => `
      <div class="rank-mini ${entry.isMe ? 'is-me' : ''}">
        <span class="rank-mini__num">${pad(entry.rank)}</span>
        ${avatar(entry.name, entry.hue, 'avatar--xs')}
        <span class="rank-mini__name">${esc(entry.name)}${entry.isMe ? '<small>你</small>' : ''}</span>
        <span class="rank-mini__amount">${money(entry.amount)}</span>
      </div>`).join('');

    const tenth = state.leaderboard[9];
    return `<section class="panel rank-preview">
      <div class="panel__head">
        <h2 class="panel__title">本周富人榜 <span class="live-dot live-dot--small"></span></h2>
        <span class="tag tag--gold">TOP 10</span>
      </div>
      <div class="rank-preview__list">
        ${rows || `<div class="small-empty"><span>本周榜单还在等第一位富人。</span></div>`}
      </div>
      <div class="rank-preview__foot">
        <span>${tenth ? `上榜门槛 ${money(tenth.amount)}` : '每周一 00:00 重置'}</span>
        <button type="button" data-action="go" data-route="leaderboard">查看全部 ${icon('i-chevron')}</button>
      </div>
    </section>`;
  }

  function commonerHomeHtml() {
    const me = state.me;
    const stats = state.stats || {};
    const pendingCount = stats.myPendingCount || 0;
    const receivedAmount = stats.myReceivedAmount || 0;
    const hasBills = state.myBills.length > 0;
    const title = !hasBills
      ? '把生活里的一笔，<br>轻轻放在这里。'
      : pendingCount > 0
        ? `还有 <em>${pendingCount}</em> 张账单<br>在等一个路过的人。`
        : '这一周，<br>你的账单都被接住了。';
    const copy = !hasBills
      ? '不用解释太多，写下它本来的样子就好。会有人刚好看见。'
      : pendingCount > 0
        ? '不用解释太多，写下它本来的样子就好。会有人刚好看见。'
        : '账单已经结清，但生活还在继续。想写的时候，随时再放一张。';

    return `
      <div class="welcome">
        <div>
          ${welcomeKicker()}
          <h1>${greeting()}，${esc(me.name)}。<br><em>让生活，被看见。</em></h1>
        </div>
        <p class="welcome__note">
          ${icon('i-lock')}
          <span>你的真实姓名与联系方式不会被展示，付款人只会看到昵称首字。</span>
        </p>
      </div>

      <div class="home-grid">
        <div class="home-main">
          <article class="commoner-hero">
            <div class="commoner-hero__copy">
              <p class="eyebrow"><span class="live-dot"></span> YOUR LEDGER · ${state.week ? state.week.rangeLabel : ''}</p>
              <h2>${title}</h2>
              <p>${copy}</p>
              <div class="commoner-hero__actions">
                <button class="btn btn--cream" type="button" data-action="publish">发布一张账单 ${icon('i-plus')}</button>
                <button class="btn btn--ghost-light" type="button" data-action="go" data-route="leaderboard">看看谁在接住 ${icon('i-arrow')}</button>
              </div>
            </div>
            <div class="commoner-orb">
              <div class="commoner-orb__inner">
                <span class="commoner-orb__label">已被接住</span>
                <strong class="commoner-orb__amount">${money(receivedAmount)}</strong>
                <span class="commoner-orb__sub">${stats.myReceivedCount || 0} 张账单</span>
              </div>
            </div>
          </article>

          <section class="panel bill-panel">
            <div class="panel__head">
              <h2 class="panel__title">我的账单 <span class="tag">${state.myBills.length} 张</span></h2>
              <button class="panel__link" type="button" data-action="publish">写一张 ${icon('i-plus')}</button>
            </div>
            ${billTabsHtml()}
            <div class="bill-list">${billListHtml()}</div>
          </section>
        </div>

        <aside class="side-stack">
          <section class="panel commoner-summary">
            <div class="panel__head">
              <h2 class="panel__title">本周小结</h2>
              <span class="live-dot live-dot--small"></span>
            </div>
            <div class="summary-grid">
              <div class="summary-cell"><strong>${money(stats.myPendingAmount || 0)}</strong><span>等待中的金额</span></div>
              <div class="summary-cell"><strong>${stats.myReceivedCount || 0}</strong><span>累计被接住</span></div>
              <div class="summary-cell"><strong>${stats.paidBillsWeek || 0}</strong><span>本周全站结清</span></div>
              <div class="summary-cell"><strong>${stats.richParticipants || 0}</strong><span>本周出手的人</span></div>
            </div>
          </section>

          <section class="commoner-note">
            ${icon('i-heart')}
            <span>账单不是标签。它只是生活偶尔需要被托住的一角。每周一 00:00，所有排名重新开始，灯也会继续亮着。</span>
          </section>

          ${rankPreviewHtml()}
        </aside>
      </div>`;
  }

  function billTabsHtml() {
    const pending = state.myBills.filter((bill) => bill.status === 'pending').length;
    const paid = state.myBills.filter((bill) => bill.status === 'paid').length;
    return `<div class="bill-tabs" role="tablist" aria-label="账单筛选">
      <button class="bill-tab ${state.billTab === 'pending' ? 'is-active' : ''}" type="button" data-action="bill-tab" data-tab-name="pending" role="tab" aria-selected="${state.billTab === 'pending'}">等待中 <span>${pending}</span></button>
      <button class="bill-tab ${state.billTab === 'paid' ? 'is-active' : ''}" type="button" data-action="bill-tab" data-tab-name="paid" role="tab" aria-selected="${state.billTab === 'paid'}">已结清 <span>${paid}</span></button>
    </div>`;
  }

  function billListHtml() {
    const filtered = state.myBills.filter((bill) => bill.status === state.billTab);
    if (!filtered.length) {
      return `<div class="empty-bills">
        <span class="empty-bills__mark">${icon(state.billTab === 'pending' ? 'i-receipt' : 'i-check')}</span>
        <h3>${state.billTab === 'pending' ? '这里还没有等待中的账单' : '还没有被结清的账单'}</h3>
        <p>${state.billTab === 'pending' ? '写下一笔真正需要被托住的支出，它会在某次随机翻页里遇见一个人。' : '被接住的账单会留在这里，成为一小段被看见过的证据。'}</p>
        ${state.billTab === 'pending' ? `<button class="btn btn--ghost btn--sm" type="button" data-action="publish">写下第一张 ${icon('i-plus')}</button>` : ''}
      </div>`;
    }

    return filtered.map((bill) => {
      const paid = bill.status === 'paid';
      const payer = bill.payer;
      const auditing = Boolean(bill.hidden);
      return `<article class="bill-card ${paid ? 'is-paid' : ''} ${auditing ? 'is-auditing' : ''}">
        <div class="bill-card__head">
          <span class="bill-card__cat">${categoryIcon(bill.category)}${esc(bill.category)}</span>
          ${paid ? '<span class="bill-card__stamp">已结清</span>' : ''}
          ${auditing ? '<span class="bill-card__stamp bill-card__stamp--audit">审核中</span>' : ''}
          ${bill.anonymous ? '<span class="bill-card__anonymous">匿名</span>' : ''}
          <span class="bill-card__date">${esc(bill.city || '其他')} · ${formatDate(bill.createdAt)}</span>
          <span class="bill-card__amount">${money(bill.amount)}</span>
        </div>
        <div class="bill-card__body">
          <div>
            <h3 class="bill-card__title">${esc(bill.title)}</h3>
            ${bill.note ? `<p class="bill-card__note">${esc(bill.note)}</p>` : ''}
          </div>
        </div>
        ${paid && bill.paidMessage ? `<p class="bill-card__message">“${esc(bill.paidMessage)}”</p>` : ''}
        ${paid && bill.thanks ? `<div class="bill-card__reply"><span>你的回信</span><p>“${esc(bill.thanks)}”</p></div>` : ''}
        ${paid && !bill.thanks && payer ? `<button class="bill-card__thanks-btn" type="button" data-action="open-thanks" data-id="${esc(bill.id)}">${icon('i-mail')}写一句谢谢</button>` : ''}
        <div class="bill-card__foot">
          <div class="bill-card__foot-left">
            ${auditing
              ? `<span class="bill-card__audit-note">${icon('i-shield')}正在审核，暂时不会出现在富人端</span>`
              : paid && payer
                ? `<span class="bill-card__payer">${icon('i-check')}${esc(payer.name)} 替你接住了这张账单</span>`
                : `<span>等待中 · 发布于 ${timeAgo(bill.createdAt)}</span>`}
          </div>
          ${paid
            ? `<span>${formatDate(bill.paidAt)} 结清</span>`
            : auditing
              ? ''
              : `<button class="bill-card__withdraw" type="button" data-action="withdraw" data-id="${esc(bill.id)}">撤回</button>`}
        </div>
      </article>`;
    }).join('');
  }

  function renderLeaderboard() {
    if (!state.week) return;
    const stats = state.stats || {};
    const entries = state.leaderboard;
    const top = entries[0];
    const podium = [entries[1], entries[0], entries[2]].filter(Boolean).map(podiumCardHtml).join('');
    const rows = entries.slice(3, 10).map((entry) => leaderboardRowHtml(entry, top?.amount || 1)).join('');
    const list = rows
      ? `<div class="lb-list">${rows}</div>`
      : `<div class="lb-list"><div class="lb-empty">本周还没有更多富人出手。</div></div>`;

    els.leaderboardView.innerHTML = `
      <div class="lb-head">
        <div>
          <p class="eyebrow"><span class="live-dot"></span> WEEKLY GIVING · ${state.week.rangeLabel}</p>
          <h1>本周<em>富人榜</em></h1>
          <p class="lb-head__sub">不比谁拥有更多，只比谁愿意给出更多。榜单按本周实际结清的账单金额排序，实时刷新。</p>
        </div>
        <div class="lb-clock">
          <span class="lb-clock__live"><span class="live-dot"></span> 实时刷新中</span>
          <div class="lb-countdown" id="lbCountdown">${countdownHtml(state.week.end)}</div>
          <span class="lb-clock__label">距本周榜单封存</span>
          <button class="lb-history-link" type="button" data-action="open-history">${icon('i-history')} 往期榜单</button>
        </div>
      </div>

      <div class="lb-stats">
        <div class="lb-stat"><strong>${money(stats.paidAmountWeek || 0)}</strong><span>本周账单总额</span></div>
        <div class="lb-stat"><strong>${stats.paidBillsWeek || 0}</strong><span>被接住的账单</span></div>
        <div class="lb-stat"><strong>${stats.richParticipants || 0}</strong><span>出手的富人</span></div>
        <div class="lb-stat lb-stat--accent"><strong>${money(stats.top10Total || 0)}</strong><span>TOP 10 累计善意</span></div>
      </div>

      <div class="lb-grid">
        <div class="lb-main">
          ${podium ? `<div class="podium">${podium}</div>` : `<div class="lb-empty">本周还没有人上榜。</div>`}
          ${list}
        </div>
        <aside class="lb-side">
          ${positionCardHtml()}
          <section class="panel lb-rules">
            <h3>${icon('i-spark')}榜单规则</h3>
            <ol>
              <li>按本周实际替平民结清的账单金额合计排序。</li>
              <li>每周一 00:00 自动重置，新的一周重新开始。</li>
              <li>金额相同时，接住账单更多的一方优先。</li>
              <li>仅展示前 10 名；排名随每一次支付实时刷新。</li>
            </ol>
          </section>
        </aside>
      </div>`;
    state.prevLeaderboardAmounts = new Map(entries.map((entry) => [entry.id, entry.amount]));
  }

  function openHistory() {
    if (!state.history.length) {
      openModal(`<div class="empty-draw"><span class="empty-draw__mark">${icon('i-history')}</span><h2>还没有往期榜单</h2><p>本周结束后，榜单会在这里留下一张快照。每周一 00:00 封存。</p><div class="modal-actions"><button class="btn btn--ghost" type="button" data-action="close-modal">好</button></div></div>`, { sheet: true, label: '往期榜单' });
      return;
    }
    const weeks = state.history.map((week) => {
      const entries = (week.entries || []).slice(0, 10);
      return `<section class="history-week">
        <header class="history-week__head">
          <div>
            <span class="history-week__range">${esc(week.rangeLabel)}</span>
            <small>${week.stats?.paidBills || 0} 张账单 · ${week.stats?.richParticipants || 0} 位富人</small>
          </div>
          <strong>${money(week.stats?.paidAmount || 0)}</strong>
        </header>
        <div class="history-week__list">
          ${entries.map((entry) => `<div class="history-entry">
            <span class="history-entry__rank">${pad(entry.rank)}</span>
            ${avatar(entry.name, entry.hue, 'avatar--xs')}
            <span class="history-entry__name">${esc(entry.name)}</span>
            <span class="history-entry__count">${entry.billCount} 笔</span>
            <strong>${money(entry.amount)}</strong>
          </div>`).join('')}
        </div>
      </section>`;
    }).join('');
    openModal(`<p class="modal-kicker"><span class="live-dot"></span> WEEKLY ARCHIVE</p>
      <h2 class="modal-title">往期榜单</h2>
      <p class="modal-lede">每周一 00:00 封存一次。这里保存最近几周的善意快照。</p>
      <div class="history-weeks">${weeks}</div>`, { wide: true, label: '往期榜单' });
  }

  function podiumCardHtml(entry) {
    const first = entry.rank === 1;
    return `<article class="podium-card ${first ? 'podium-card--first' : ''}">
      <span class="podium-card__rank">NO. ${pad(entry.rank)}</span>
      ${first ? `<span class="podium-card__crown">${icon('i-crown')}</span>` : ''}
      ${avatar(entry.name, entry.hue, first ? 'avatar--gold' : '', '')}
      <h3 class="podium-card__name">${esc(entry.name)}${entry.isMe ? '<small>你</small>' : ''}</h3>
      <div class="podium-card__amount">${money(entry.amount)}</div>
      <p class="podium-card__meta">${entry.billCount} 笔 · 本周</p>
      <span class="podium-card__place">${pad(entry.rank)}</span>
    </article>`;
  }

  function leaderboardRowHtml(entry, topAmount) {
    const previous = state.prevLeaderboardAmounts.get(entry.id);
    const bumped = previous !== undefined && entry.amount > previous;
    const width = Math.max(5, Math.min(100, (entry.amount / Math.max(topAmount, 1)) * 100));
    return `<div class="lb-row ${entry.isMe ? 'is-me' : ''}">
      <span class="lb-row__rank">${pad(entry.rank)}</span>
      ${avatar(entry.name, entry.hue, 'avatar--sm')}
      <div>
        <div class="lb-row__name">${esc(entry.name)}${entry.isMe ? '<small>你</small>' : ''}</div>
        <div class="lb-row__bar"><span style="width:${width.toFixed(1)}%"></span></div>
      </div>
      <div class="lb-row__right">
        <div class="lb-row__amount ${bumped ? 'lb-bump' : ''}">${money(entry.amount)}</div>
        <div class="lb-row__count">${entry.billCount} 笔</div>
      </div>
    </div>`;
  }

  function positionCardHtml() {
    const me = state.me;
    if (me.role === 'commoner') {
      const stats = state.stats || {};
      return `<section class="position-card">
        <div class="position-card__eyebrow"><span>THIS WEEK</span><span>LIVE</span></div>
        <div class="position-card__body">
          <div class="position-card__rank">${stats.richParticipants || 0}<small>位</small></div>
          <div class="position-card__amount"><strong>${money(stats.top10Total || 0)}</strong><span>TOP 10 累计</span></div>
        </div>
        <p class="position-card__hint">本周已有 ${stats.paidBillsWeek || 0} 张账单被接住，${stats.pendingBills || 0} 张还在等待。每一次刷新，都可能有人刚好路过。</p>
        <button class="btn btn--cream btn--sm" type="button" data-action="publish">发布一张账单 ${icon('i-plus')}</button>
      </section>`;
    }

    const position = state.myPosition || { rank: null, amount: 0, billCount: 0 };
    const tenth = state.leaderboard[9];
    const top10Gap = tenth && (!position.rank || position.rank > 10)
      ? Math.max(0, Math.round((tenth.amount - position.amount) * 100) / 100)
      : null;

    if (!position.rank) {
      return `<section class="position-card position-card--empty">
        <div class="position-card__eyebrow"><span>YOUR POSITION</span><span>UNRANKED</span></div>
        <div class="position-card__body">
          <div class="position-card__rank">尚未上榜</div>
          <div class="position-card__amount"><strong>${money(0)}</strong><span>本周累计</span></div>
        </div>
        <p class="position-card__hint">${top10Gap !== null ? `距离本周前十还差 ${money(top10Gap)}。` : '本周还没有人出手，第一位就是你。'} 随机翻一张账单，榜单会立刻记住。</p>
        <button class="btn btn--cream btn--sm" type="button" data-action="draw">去翻第一张 ${icon('i-arrow')}</button>
      </section>`;
    }

    let hint;
    if (position.rank === 1) hint = '本周暂列榜首。善意还在继续，灯也还亮着。';
    else if (position.rank > 10) hint = `距离前十还差 ${money(top10Gap || 0)}，再接住一张就可能进去。`;
    else if (position.gapToNext) hint = `距离上一名还差 ${money(position.gapToNext)}。`;
    else hint = '与上一名金额相同，再一单就能往前。';

    return `<section class="position-card">
      <div class="position-card__eyebrow"><span>YOUR POSITION</span><span>${position.rank <= 10 ? 'ON THE BOARD' : 'OFF THE BOARD'}</span></div>
      <div class="position-card__body">
        <div class="position-card__rank">${position.rank}<small>名</small></div>
        <div class="position-card__amount"><strong>${money(position.amount)}</strong><span>本周 ${position.billCount} 笔</span></div>
      </div>
      <p class="position-card__hint">${hint}</p>
      <button class="btn btn--cream btn--sm" type="button" data-action="draw">再去接住一张 ${icon('i-arrow')}</button>
    </section>`;
  }

  function showAuth() {
    els.authView.hidden = false;
    els.appView.hidden = true;
    disconnectSSE();
    closeModal({ restore: false });
    document.body.classList.remove('modal-open');
    state.sessionEpoch += 1;
    state.refreshPromise = null;
    state.me = null;
    state.week = null;
    state.stats = null;
    state.leaderboard = [];
    state.myPosition = null;
    state.myBills = [];
    state.myPayments = [];
    state.pending = [];
    state.history = [];
    state.filters = defaultFilters();
    state.filterDraft = defaultFilters();
    state.previewId = null;
    state.drawSeen.clear();
    state.authRole = null;
    state.loginBusy = false;
    if (els.loginError) els.loginError.textContent = '';
    $$('[data-action="choose-role"]').forEach((button) => {
      button.setAttribute('aria-pressed', 'false');
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function handleSignedOut() {
    const wasSignedIn = Boolean(state.me);
    showAuth();
    if (wasSignedIn) toast('登录已失效，请重新选择一个身份。', 'error');
  }

  async function loadPublicStats() {
    try {
      const data = await api('/api/public');
      if (els.publicBills) els.publicBills.textContent = String(data.paidBillsWeek ?? 0);
      if (els.publicAmount) els.publicAmount.textContent = compactMoney(data.paidAmountWeek || 0);
    } catch (_) {
      // Marketing numbers are non-critical.
    }
  }

  function chooseRole(role) {
    state.authRole = role;
    $$('[data-action="choose-role"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.role === role));
    });
    if (els.loginError) els.loginError.textContent = '';
    if (els.loginName) els.loginName.focus({ preventScroll: true });
  }

  function validateLogin() {
    if (!state.authRole) return '请先选择一个身份。';
    const name = els.loginName.value.trim();
    const length = Array.from(name).length;
    if (length < 2) return '称呼至少需要 2 个字。';
    if (length > 10) return '称呼最多 10 个字。';
    return '';
  }

  async function submitLogin() {
    if (state.loginBusy) return;
    const error = validateLogin();
    if (error) {
      els.loginError.textContent = error;
      els.loginName.focus({ preventScroll: true });
      return;
    }

    state.loginBusy = true;
    els.loginSubmit.disabled = true;
    els.loginSubmit.classList.add('btn--loading');
    els.loginError.textContent = '';

    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          name: els.loginName.value.trim(),
          role: state.authRole,
        }),
      });
      await afterLogin();
    } catch (requestError) {
      els.loginError.textContent = requestError.message || '登录失败，请稍后再试。';
    } finally {
      state.loginBusy = false;
      els.loginSubmit.disabled = false;
      els.loginSubmit.classList.remove('btn--loading');
    }
  }

  async function demoLogin(role, button) {
    if (state.loginBusy) return;
    state.loginBusy = true;
    if (button) {
      button.disabled = true;
      button.classList.add('btn--loading');
    }
    try {
      await api('/api/login/demo', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      await afterLogin();
    } catch (error) {
      toast(error.message || '演示账号暂时不可用', 'error');
    } finally {
      state.loginBusy = false;
      if (button) {
        button.disabled = false;
        button.classList.remove('btn--loading');
      }
    }
  }

  async function afterLogin() {
    state.route = initialRoute();
    const data = await refreshState({ render: false, silent: false });
    if (!data) return;
    const url = new URL(location.href);
    url.searchParams.delete('demo');
    url.searchParams.delete('view');
    url.hash = state.route === 'leaderboard' ? '/leaderboard' : '/home';
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    render();
    connectSSE();
    window.scrollTo({ top: 0, behavior: 'auto' });
    toast(`身份已确认，欢迎来到予光。`, 'success');
  }

  function connectSSE() {
    if (!state.me || state.sse) return;
    const source = new EventSource('/api/events');
    source.addEventListener('update', () => {
      clearTimeout(state.refreshTimer);
      state.refreshTimer = setTimeout(() => {
        refreshState({ render: true, silent: true });
      }, 160);
    });
    source.onerror = () => {
      // EventSource reconnects automatically. If the cookie expired, the next
      // state refresh will route us back to auth.
    };
    state.sse = source;
  }

  function disconnectSSE() {
    if (state.sse) {
      state.sse.close();
      state.sse = null;
    }
    clearTimeout(state.refreshTimer);
  }

  // -------------------------------------------------------
  // Modals
  // -------------------------------------------------------

  function openModal(html, { wide = false, sheet = false, label = '对话框', focus = true } = {}) {
    if (!els.modalRoot.firstChild) state.lastFocused = document.activeElement;
    els.modalRoot.innerHTML = `
      <div class="modal-backdrop" data-action="close-modal"></div>
      <div class="modal-panel ${wide ? 'modal-panel--wide' : ''} ${sheet ? 'modal-panel--sheet' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">
        <button class="modal-close" type="button" data-action="close-modal" aria-label="关闭">${icon('i-close')}</button>
        <div class="modal-body">${html}</div>
      </div>`;
    document.body.classList.add('modal-open');
    if (focus) focusModalFirst();
  }

  function setModalBody(html, { focus = true } = {}) {
    const body = $('.modal-body', els.modalRoot);
    if (!body) return;
    body.innerHTML = html;
    if (focus) focusModalFirst();
  }

  function focusModalFirst() {
    requestAnimationFrame(() => {
      const preferred = $('[autofocus]', els.modalRoot)
        || $('input, textarea', els.modalRoot)
        || $('.modal-panel button:not(.modal-close)', els.modalRoot)
        || $('.modal-panel', els.modalRoot);
      preferred?.focus({ preventScroll: true });
    });
  }

  function closeModal({ restore = true } = {}) {
    if (!els.modalRoot.firstChild) {
      state.modal = null;
      return;
    }
    els.modalRoot.innerHTML = '';
    document.body.classList.remove('modal-open');
    state.modal = null;
    if (restore && state.lastFocused instanceof HTMLElement) {
      state.lastFocused.focus({ preventScroll: true });
    }
    state.lastFocused = null;
  }

  function openFilters() {
    if (!state.me || state.me.role !== 'rich') return;
    state.filterDraft = { ...state.filters };
    state.modal = { type: 'filters' };
    openModal(renderFilterForm(), { sheet: true, label: '筛选账单' });
  }

  function renderFilterForm() {
    const count = filteredPending(state.filterDraft).length;
    const chip = (group, value, label, current) => `<button class="filter-chip ${current === value ? 'is-active' : ''}" type="button" data-action="choose-filter" data-group="${group}" data-value="${esc(value)}" aria-pressed="${current === value}">${label}</button>`;
    return `<p class="modal-kicker"><span class="live-dot"></span> FIND A BILL</p>
      <h2 class="modal-title">缩小一点范围</h2>
      <p class="modal-lede">筛选只影响随机抽取的范围，不会改变所有人的账单和榜单。</p>
      <div class="filter-form">
        <div class="filter-group">
          <div class="filter-group__head"><span>分类</span><small>${esc(state.filterDraft.category)}</small></div>
          <div class="filter-chips">
            ${chip('category', '全部', '全部分类', state.filterDraft.category)}
            ${CATEGORY_NAMES.map((category) => chip('category', category, category, state.filterDraft.category)).join('')}
          </div>
        </div>
        <div class="filter-group">
          <div class="filter-group__head"><span>城市</span><small>${esc(state.filterDraft.city)}</small></div>
          <div class="filter-chips">
            ${chip('city', '全部', '全部城市', state.filterDraft.city)}
            ${CITIES.map((city) => chip('city', city, city, state.filterDraft.city)).join('')}
          </div>
        </div>
        <div class="filter-group">
          <div class="filter-group__head"><span>金额</span><small>${esc(AMOUNT_FILTERS.find((item) => item.value === state.filterDraft.amount)?.label || '')}</small></div>
          <div class="filter-chips">
            ${AMOUNT_FILTERS.map((item) => chip('amount', item.value, item.label, state.filterDraft.amount)).join('')}
          </div>
        </div>
      </div>
      <div class="filter-footer">
        <button class="btn btn--ghost" type="button" data-action="reset-filters">清除筛选</button>
        <button class="btn btn--ink" type="button" data-action="apply-filters">查看 <span id="filterCount">${count}</span> 张账单 ${icon('i-arrow')}</button>
      </div>`;
  }

  function updateFilterChip(group, value) {
    state.filterDraft[group] = value;
    $$(`[data-action="choose-filter"][data-group="${group}"]`).forEach((chip) => {
      const active = chip.dataset.value === value;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    const groupLabel = $(`[data-action="choose-filter"][data-group="${group}"].is-active`);
    const head = groupLabel?.closest('.filter-group')?.querySelector('.filter-group__head small');
    if (head) head.textContent = groupLabel.dataset.value === '全部' ? '全部' : groupLabel.textContent.trim();
    const countEl = $('#filterCount');
    if (countEl) countEl.textContent = String(filteredPending(state.filterDraft).length);
  }

  function applyFilters() {
    state.filters = { ...state.filterDraft };
    state.previewId = null;
    closeModal({ restore: false });
    renderHome();
    applyRoute(state.route, { scroll: false });
    toast(`筛选已应用：${filterSummary()}`, 'success');
  }

  function resetFilters(apply = false) {
    state.filterDraft = defaultFilters();
    if (apply) {
      state.filters = defaultFilters();
      state.previewId = null;
      closeModal({ restore: false });
      renderHome();
      applyRoute(state.route, { scroll: false });
      toast('已清除筛选。', 'success');
      return;
    }
    setModalBody(renderFilterForm());
  }

  function openThanks(billId) {
    const bill = state.myBills.find((item) => item.id === billId);
    if (!bill || bill.status !== 'paid' || bill.thanks) return;
    state.modal = { type: 'thanks', billId };
    openModal(`<p class="modal-kicker"><span class="live-dot"></span> A LETTER BACK</p>
      <h2 class="modal-title">写一句谢谢</h2>
      <p class="modal-lede">${esc(bill.payer?.name || '那位富人')} 接住了「${esc(bill.title)}」。回信会出现在 TA 的首页里。</p>
      <form id="thanksForm" class="publish-form" novalidate>
        <div class="message-field" style="margin-top:18px">
          <label for="thanksMessage">回信内容 <span>2–80 字</span></label>
          <textarea id="thanksMessage" maxlength="80" placeholder="比如：谢谢你，今晚的灯很亮。"></textarea>
        </div>
        <p class="field-error" id="thanksError" role="alert"></p>
        <div class="modal-actions">
          <button class="btn btn--ghost" type="button" data-action="close-modal">先不写</button>
          <button class="btn btn--ink" type="submit">把这封回信寄出去 ${icon('i-mail')}</button>
        </div>
      </form>`, { sheet: true, label: '写回信' });
  }

  async function submitThanks(form) {
    if (!state.modal || state.modal.type !== 'thanks') return;
    const message = $('#thanksMessage', form).value.trim();
    const errorEl = $('#thanksError', form);
    const submit = $('button[type="submit"]', form);
    if (Array.from(message).length < 2) {
      if (errorEl) errorEl.textContent = '至少写 2 个字吧。';
      return;
    }
    submit.disabled = true;
    submit.classList.add('btn--loading');
    try {
      await api(`/api/bills/${encodeURIComponent(state.modal.billId)}/thanks`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      closeModal();
      toast('回信已寄出，愿它刚好被看见。', 'success');
      await refreshState({ render: true, silent: false });
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message || '回信没有寄出，请稍后再试。';
      submit.disabled = false;
      submit.classList.remove('btn--loading');
    }
  }

  function openReport(billId) {
    const bill = state.pending.find((item) => item.id === billId);
    if (!bill) return;
    state.modal = { type: 'report', billId, reason: REPORT_REASONS[0] };
    openModal(`<p class="modal-kicker"><span class="live-dot"></span> REPORT · ${esc(bill.code)}</p>
      <h2 class="modal-title">举报这张账单</h2>
      <p class="modal-lede">如果账单是虚假的、包含不当内容，或疑似诈骗，请告诉我们。审核员会在后台处理。</p>
      <div class="report-form">
        <div class="filter-group">
          <div class="filter-group__head"><span>举报原因</span></div>
          <div class="filter-chips">
            ${REPORT_REASONS.map((reason) => `<button class="filter-chip ${reason === REPORT_REASONS[0] ? 'is-active' : ''}" type="button" data-action="choose-report-reason" data-value="${reason}" aria-pressed="${reason === REPORT_REASONS[0]}">${reason}</button>`).join('')}
          </div>
        </div>
        <div class="message-field">
          <label for="reportNote">补充说明 <span>可选 · 最多 60 字</span></label>
          <textarea id="reportNote" maxlength="60" placeholder="比如：账单内容和说明明显不符。"></textarea>
        </div>
        <p class="field-error" id="reportError" role="alert"></p>
        <div class="modal-actions">
          <button class="btn btn--ghost" type="button" data-action="close-modal">取消</button>
          <button class="btn btn--red" type="button" data-action="submit-report" data-id="${esc(bill.id)}">提交举报 ${icon('i-flag')}</button>
        </div>
        <p class="modal-disclaimer">恶意举报会被记录；同一张账单 3 条有效举报会先进入审核。</p>
      </div>`, { sheet: true, label: '举报账单' });
  }

  async function submitReport(billId, button) {
    const reason = $('.report-form .filter-chip.is-active')?.dataset.value || '其他';
    const note = $('#reportNote')?.value.trim() || '';
    const errorEl = $('#reportError');
    button.disabled = true;
    button.classList.add('btn--loading');
    try {
      const data = await api(`/api/bills/${encodeURIComponent(billId)}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: note ? `${reason}：${note}` : reason }),
      });
      closeModal({ restore: false });
      toast(data.autoHidden ? '举报已提交，这张账单已进入审核。' : '举报已提交，谢谢你的提醒。', 'success');
      await refreshState({ render: true, silent: false });
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message || '举报没有提交，请稍后再试。';
      button.disabled = false;
      button.classList.remove('btn--loading');
    }
  }

  function openDraw() {
    const available = filteredPending();
    if (!state.pending.length) {
      openModal(`<div class="empty-draw">
        <span class="empty-draw__mark">${icon('i-check')}</span>
        <h2>今天的账单，都被接住了。</h2>
        <p>每一张等待的账单都已经遇见了一个人。晚一点再来，或者先去榜单看看今晚的灯火。</p>
        <div class="modal-actions"><button class="btn btn--ghost" type="button" data-action="close-modal">好，晚点再来</button><button class="btn btn--ink" type="button" data-action="go" data-route="leaderboard">去看看榜单 ${icon('i-arrow')}</button></div>
      </div>`, { sheet: true, label: '暂无账单' });
      return;
    }
    if (!available.length) {
      openModal(`<div class="empty-draw">
        <span class="empty-draw__mark">${icon('i-filter')}</span>
        <h2>这个筛选下，暂时没有账单。</h2>
        <p>试试放宽金额范围，或者换一个城市和分类。等待中的账单会随着新发布实时出现。</p>
        <div class="modal-actions"><button class="btn btn--ghost" type="button" data-action="reset-filters-apply">清除筛选</button><button class="btn btn--ink" type="button" data-action="open-filters">调整筛选 ${icon('i-filter')}</button></div>
      </div>`, { sheet: true, label: '筛选无结果' });
      return;
    }
    const bill = pickRandomBill();
    if (!bill) return;
    state.modal = { type: 'draw', stage: 'bill', billId: bill.id };
    state.previewId = bill.id;
    openModal(renderDrawBill(bill), { wide: true, label: '随机账单' });
  }

  function pickRandomBill(excludeId = null) {
    const source = filteredPending();
    const pool = source.filter((bill) => bill.id !== excludeId);
    if (!pool.length) return null;
    let candidates = pool.filter((bill) => !state.drawSeen.has(bill.id));
    if (!candidates.length) {
      state.drawSeen.clear();
      candidates = pool;
    }
    const bill = candidates[Math.floor(Math.random() * candidates.length)];
    state.drawSeen.add(bill.id);
    return bill;
  }

  function currentDrawBill() {
    if (!state.modal || state.modal.type !== 'draw') return null;
    return state.pending.find((bill) => bill.id === state.modal.billId) || null;
  }

  function renderDrawBill(bill) {
    return `<p class="modal-kicker"><span class="live-dot live-dot--gold"></span> RANDOM ENCOUNTER · ${esc(state.week?.rangeLabel || '')}</p>
      <h2 class="modal-title">刚好，翻到了这一张。</h2>
      <p class="modal-lede">一张随机账单。你可以换一张，也可以就这样接住它。</p>
      <div class="draw-ticket">
        <div class="draw-ticket__top">
          <span>${esc(bill.code)}</span>
          <span class="tag tag--red">${categoryIcon(bill.category)}${esc(bill.category)}</span>
        </div>
        <div class="draw-ticket__amount"><small>¥</small>${numberText(bill.amount)}</div>
        <h3 class="draw-ticket__title">${esc(bill.title)}</h3>
        <p class="draw-ticket__note">${esc(bill.note || 'TA 没有留下更多说明。')}</p>
        <div class="draw-ticket__owner">
          ${avatar(bill.owner.name, bill.owner.hue, 'avatar--xs')}
          <span>来自 <strong>${esc(bill.owner.name)}</strong> 的账单</span>
          <span class="draw-ticket__place">${esc(bill.city || '其他')} · ${timeAgo(bill.createdAt)}</span>
        </div>
        <div class="draw-ticket__barcode">
          <span>THANK YOU FOR SEEING</span>
          <span class="barcode"></span>
        </div>
      </div>
      <div class="draw-modal__actions">
        <button class="btn btn--ghost" type="button" data-action="draw-reroll">${icon('i-shuffle')} 换一张</button>
        <button class="btn btn--red" type="button" data-action="draw-pay-start">替 TA 付掉 ${money(bill.amount)} ${icon('i-arrow')}</button>
      </div>
      <p class="draw-modal__foot">本机演示支付 · 不会产生真实扣款 · <button class="report-link" type="button" data-action="open-report" data-id="${esc(bill.id)}">${icon('i-flag')}举报这张账单</button></p>`;
  }

  function renderDrawConfirm(bill) {
    return `<p class="modal-kicker"><span class="live-dot"></span> CONFIRM · ${esc(bill.code)}</p>
      <h2 class="modal-title">确认接住这张账单</h2>
      <p class="modal-lede">你将为 ${esc(bill.owner.name)} 结清这笔 ${esc(bill.category)} 支出。</p>
      <div class="draw-ticket" style="margin-top:16px">
        <div class="draw-ticket__top">
          <span>${esc(bill.code)}</span>
          <span class="tag tag--red">${categoryIcon(bill.category)}${esc(bill.category)}</span>
        </div>
        <div class="draw-ticket__amount" style="font-size:40px"><small>¥</small>${numberText(bill.amount)}</div>
        <h3 class="draw-ticket__title">${esc(bill.title)}</h3>
        <div class="draw-ticket__owner" style="border-top:0;padding-top:6px">
          ${avatar(bill.owner.name, bill.owner.hue, 'avatar--xs')}
          <span>给 <strong>${esc(bill.owner.name)}</strong></span>
        </div>
      </div>
      <div class="draw-confirm">
        <div class="confirm-line"><span>本次支付</span><strong>${money(bill.amount)}</strong></div>
        <div class="message-field">
          <label for="payMessage">留一句话 <span>可选 · 最多 40 字</span></label>
          <textarea id="payMessage" maxlength="40" placeholder="比如：希望这盏灯亮得久一点。"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn--ghost" type="button" data-action="draw-back">再想想</button>
          <button class="btn btn--red" type="button" data-action="draw-confirm" data-id="${esc(bill.id)}">确认支付 ${money(bill.amount)}</button>
        </div>
        <p class="modal-disclaimer">演示环境，仅记录在本地数据中，不会调用真实支付。</p>
      </div>`;
  }

  async function confirmPayment(button) {
    const bill = currentDrawBill();
    if (!bill || !state.modal) return;
    const message = $('#payMessage')?.value.trim() || '';
    button.disabled = true;
    button.classList.add('btn--loading');
    try {
      const data = await api(`/api/bills/${encodeURIComponent(bill.id)}/pay`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      state.modal = { type: 'draw', stage: 'success', billId: bill.id, result: data.payment };
      await refreshState({ render: false, silent: true });
      render();
      setModalBody(renderDrawSuccess(data.payment), { focus: false });
      launchConfetti();
    } catch (error) {
      if (error.status === 409) {
        toast('慢了一步，这张账单已经被接住了。', 'error');
        closeModal();
        await refreshState({ render: true, silent: true });
      } else {
        toast(error.message || '支付失败，请稍后重试。', 'error');
        button.disabled = false;
        button.classList.remove('btn--loading');
      }
    }
  }

  function renderDrawSuccess(payment) {
    const bill = payment.bill;
    let rankCopy = '';
    if (payment.rankAfter === null || payment.rankAfter === undefined) {
      rankCopy = '本周继续出手，就会出现在榜上。';
    } else if (!payment.rankBefore && payment.rankAfter > 10) {
      rankCopy = `本周第 ${payment.rankAfter} 名 · 距前十还差一点`;
    } else if (!payment.rankBefore) {
      rankCopy = `本周首次上榜 · 第 ${payment.rankAfter} 名`;
    } else if (payment.rankBefore > 10 && payment.rankAfter <= 10) {
      rankCopy = `进入前十 · 第 ${payment.rankAfter} 名`;
    } else if (payment.rankBefore > payment.rankAfter) {
      rankCopy = `排名上升 ${payment.rankBefore - payment.rankAfter} 位 · 第 ${payment.rankAfter} 名`;
    } else if (payment.rankAfter > 10) {
      rankCopy = `本周第 ${payment.rankAfter} 名 · 已接住 ${payment.billCountThisWeek} 笔`;
    } else {
      rankCopy = `本周第 ${payment.rankAfter} 名 · 已接住 ${payment.billCountThisWeek} 笔`;
    }

    return `<div class="success-view">
      <div class="success-mark">${icon('i-check')}</div>
      <p class="modal-kicker" style="justify-content:center">BILL SETTLED · ${esc(bill.code)}</p>
      <h2>这张账单，<br>被你接住了。</h2>
      <p>${esc(bill.owner.name)} 的「${esc(bill.title)}」已结清。<br>善意不必相识，刚好看见就好。</p>
      <div class="success-receipt">
        <div class="success-receipt__amount"><span>本次支付</span><strong>${money(payment.amount)}</strong></div>
        <div class="success-receipt__row"><span>账单</span><strong>${esc(bill.title)}</strong></div>
        <div class="success-receipt__row"><span>来自</span><strong>${esc(bill.owner.name)}</strong></div>
        <div class="success-receipt__row"><span>类别</span><strong>${esc(bill.category)}</strong></div>
      </div>
      <div class="rank-up">${icon('i-arrow-up')}<span>${rankCopy}</span><strong>${money(payment.spentThisWeek)}</strong></div>
      <div class="success-actions">
        <button class="btn btn--ghost" type="button" data-action="draw-another">再翻一张</button>
        <button class="btn btn--ink" type="button" data-action="go" data-route="leaderboard">查看榜单 ${icon('i-arrow')}</button>
      </div>
      <p class="modal-disclaimer">演示支付已完成记录，不会产生真实扣款。</p>
    </div>`;
  }

  function launchConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    const colors = ['#a6402d', '#ad8852', '#1d3a31', '#d8bc8d', '#f2ede2'];
    for (let index = 0; index < 42; index += 1) {
      const piece = document.createElement('span');
      piece.className = 'confetti';
      piece.style.setProperty('--confetti-color', colors[index % colors.length]);
      piece.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 560)}px`);
      piece.style.setProperty('--y', `${Math.round(270 + Math.random() * 300)}px`);
      piece.style.setProperty('--rotate', `${Math.round(Math.random() * 720 - 360)}deg`);
      piece.style.setProperty('--duration', `${1.5 + Math.random() * 1.2}s`);
      piece.style.setProperty('--delay', `${Math.random() * 0.25}s`);
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3200);
  }

  function openPublish() {
    if (!state.me || state.me.role !== 'commoner') return;
    if ((state.stats?.myPendingCount || 0) >= 3) {
      toast('最多同时保留 3 张待结清账单，先等其中一张遇见善意吧。', 'error');
      return;
    }
    state.modal = { type: 'publish', category: '餐饮' };
    openModal(renderPublishForm(), { wide: true, label: '发布账单' });
  }

  function renderPublishForm() {
    return `<p class="modal-kicker"><span class="live-dot"></span> NEW BILL · ${esc(state.week?.rangeLabel || '')}</p>
      <h2 class="modal-title">发布一张账单</h2>
      <p class="modal-lede">写下它本来的样子。它会在某次随机翻页里，遇见一个刚好看见的人。</p>
      <form class="publish-form" id="publishForm" novalidate>
        <div class="form-field">
          <label>这是一张什么账单？</label>
          <div class="category-grid" role="group" aria-label="账单分类">
            ${CATEGORY_NAMES.map((category) => `<button class="category-chip ${category === '餐饮' ? 'is-active' : ''}" type="button" data-action="choose-category" data-category="${category}" aria-pressed="${category === '餐饮'}">${icon(CATEGORIES[category].icon)}${category}</button>`).join('')}
          </div>
        </div>
        <div class="form-row">
          <div class="form-field amount-field">
            <label for="billAmount">金额 <span>1–50,000 元</span></label>
            <span class="currency">¥</span>
            <input id="billAmount" name="amount" type="number" min="1" max="50000" step="0.01" inputmode="decimal" placeholder="0.00">
          </div>
          <div class="form-field">
            <label for="billCity">城市 <span>只展示城市</span></label>
            <select id="billCity" class="select-input">
              ${CITIES.map((city) => `<option value="${city}" ${city === (state.me?.city || '上海') ? 'selected' : ''}>${city}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-field">
          <label for="billTitle">给它起个名字 <span>2–30 字</span></label>
          <input id="billTitle" name="title" type="text" maxlength="30" placeholder="比如：给妈妈换一副老花镜">
        </div>
        <div class="form-field">
          <label for="billNote">想说点什么 <span>可选 · 最多 120 字</span></label>
          <textarea id="billNote" name="note" maxlength="120" placeholder="不用解释太多，写它本来的样子就好。"></textarea>
          <span class="char-count" id="noteCount">0 / 120</span>
        </div>
        <label class="switch-row" for="billAnonymous">
          <span class="switch-copy"><strong>匿名发布</strong><small>付款人只会看到“匿名平民”，不展示昵称首字。</small></span>
          <input id="billAnonymous" type="checkbox">
          <span class="switch-track" aria-hidden="true"></span>
        </label>
        <div class="privacy-note">${icon('i-lock')}默认只展示昵称首字；开启匿名后只显示“匿名平民”。请勿填写真实姓名、手机号、住址或微信号。</div>
        <p class="field-error" id="publishError" role="alert"></p>
        <div class="modal-actions">
          <button class="btn btn--ghost" type="button" data-action="close-modal">先不发布</button>
          <button class="btn btn--ink" type="submit">把这张账单放上去 ${icon('i-arrow')}</button>
        </div>
      </form>`;
  }

  async function submitPublish(form) {
    if (!state.me || state.me.role !== 'commoner') return;
    const errorEl = $('#publishError', form);
    const category = $('.category-chip.is-active', form)?.dataset.category || '';
    const amount = Number($('#billAmount', form).value);
    const title = $('#billTitle', form).value.trim();
    const note = $('#billNote', form).value.trim();
    const city = $('#billCity', form).value;
    const anonymous = $('#billAnonymous', form).checked;
    const submit = $('button[type="submit"]', form);

    const fail = (message) => {
      if (errorEl) errorEl.textContent = message;
    };

    if (!category) return fail('请选择账单分类。');
    if (!Number.isFinite(amount) || amount < 1 || amount > 50000) return fail('金额需要在 1 到 50,000 元之间。');
    if (Array.from(title).length < 2) return fail('请给这张账单起一个至少 2 个字的名字。');

    submit.disabled = true;
    submit.classList.add('btn--loading');
    if (errorEl) errorEl.textContent = '';

    try {
      await api('/api/bills', {
        method: 'POST',
        body: JSON.stringify({ category, title, amount, note, city, anonymous }),
      });
      closeModal();
      state.billTab = 'pending';
      toast('账单已放上去，正在等一个刚好路过的人。', 'success');
      await refreshState({ render: true, silent: false });
    } catch (error) {
      fail(error.message || '发布失败，请稍后再试。');
      submit.disabled = false;
      submit.classList.remove('btn--loading');
    }
  }

  function openWithdrawConfirm(id) {
    const bill = state.myBills.find((item) => item.id === id);
    if (!bill) return;
    openModal(`<p class="modal-kicker">WITHDRAW</p>
      <h2 class="modal-title">撤回这张账单？</h2>
      <p class="modal-lede">「${esc(bill.title)}」将从等待列表里消失。撤回后，可以重新发布。</p>
      <div class="modal-actions">
        <button class="btn btn--ghost" type="button" data-action="close-modal">再想想</button>
        <button class="btn btn--red" type="button" data-action="withdraw-confirm" data-id="${esc(bill.id)}">确认撤回</button>
      </div>`, { sheet: true, label: '撤回账单' });
  }

  async function withdrawBill(id, button) {
    button.disabled = true;
    button.classList.add('btn--loading');
    try {
      await api(`/api/bills/${encodeURIComponent(id)}`, { method: 'DELETE' });
      closeModal();
      toast('账单已撤回。', 'success');
      await refreshState({ render: true, silent: false });
    } catch (error) {
      toast(error.message || '撤回失败，请稍后再试。', 'error');
      button.disabled = false;
      button.classList.remove('btn--loading');
    }
  }

  function openProfile() {
    if (!state.me) return;
    const me = state.me;
    const stats = state.stats || {};
    const rich = me.role === 'rich';
    const position = state.myPosition || { rank: null, amount: 0, billCount: 0 };
    const statCells = rich
      ? `<div class="profile-stat"><strong>${money(position.amount)}</strong><span>本周送出</span></div>
         <div class="profile-stat"><strong>${position.rank ? `第 ${position.rank}` : '—'}</strong><span>本周排名</span></div>
         <div class="profile-stat"><strong>${position.billCount || 0}</strong><span>本周接住</span></div>`
      : `<div class="profile-stat"><strong>${stats.myPendingCount || 0}</strong><span>待结清</span></div>
         <div class="profile-stat"><strong>${stats.myReceivedCount || 0}</strong><span>累计被接住</span></div>
         <div class="profile-stat"><strong>${money(stats.myReceivedAmount || 0)}</strong><span>收到的善意</span></div>`;

    openModal(`<p class="modal-kicker"><span class="live-dot"></span> ACCOUNT · ${formatJoined(me.createdAt)}</p>
      <div class="profile-head">
        ${avatar(me.name, me.hue, 'avatar--lg')}
        <div>
          <h2 class="profile-head__name">${esc(me.name)}</h2>
          <div class="profile-head__meta"><span class="tag ${rich ? 'tag--moss' : 'tag--red'}">${roleLabel(me.role)}</span><span>${state.publicMode ? '公开体验' : me.seed ? '演示账号' : '本机账号'}</span><span>加入于 ${formatJoined(me.createdAt)}</span></div>
        </div>
      </div>
      <div class="profile-stats">${statCells}</div>
      <div class="profile-menu">
        <button class="profile-menu__item" type="button" data-action="logout">${icon('i-switch')}<span>切换身份</span><small>退出当前账号</small>${icon('i-chevron')}</button>
        ${state.publicMode ? '' : `<button class="profile-menu__item profile-menu__item--danger" type="button" data-action="open-reset">${icon('i-refresh')}<span>重置演示数据</span><small>恢复初始状态</small>${icon('i-chevron')}</button>`}
      </div>
      <div class="profile-disclaimer">${state.publicMode
        ? '公开体验模式：所有内容公开可见，支付为模拟，不会产生真实扣款；服务重启后会恢复演示数据。请勿填写真实姓名、电话、住址等敏感信息。'
        : '予光目前是产品原型。登录、支付与排行榜数据均保存在本机，不会产生真实扣款。正式上线前需要接入短信/微信登录、支付通道与风控审核。'}</div>`, { sheet: true, label: '我的账户' });
  }

  function openResetConfirm() {
    openModal(`<p class="modal-kicker">RESET</p>
      <h2 class="modal-title">恢复演示数据？</h2>
      <p class="modal-lede">会清空本机新发布的账单与支付记录，恢复初始演示内容，并退出登录。这个操作不可撤销。</p>
      <div class="modal-actions">
        <button class="btn btn--ghost" type="button" data-action="close-modal">先不重置</button>
        <button class="btn btn--red" type="button" data-action="reset-confirm">确认重置</button>
      </div>`, { sheet: true, label: '重置演示数据' });
  }

  async function resetDemo(button) {
    button.disabled = true;
    button.classList.add('btn--loading');
    try {
      await api('/api/reset-demo', { method: 'POST' });
      history.replaceState(null, '', '/');
      window.location.assign('/');
    } catch (error) {
      toast(error.message || '重置失败，请稍后再试。', 'error');
      button.disabled = false;
      button.classList.remove('btn--loading');
    }
  }

  async function logout() {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (_) {
      // Local UI should still sign out.
    }
    closeModal();
    showAuth();
    history.replaceState(null, '', '/');
    toast('已退出当前身份。', 'success');
  }

  function toast(message, tone = 'default') {
    if (!els.toastRoot) return;
    while (els.toastRoot.children.length >= 3) {
      els.toastRoot.firstElementChild.remove();
    }
    const element = document.createElement('div');
    element.className = `toast ${tone === 'error' ? 'toast--error' : tone === 'success' ? 'toast--success' : ''}`;
    const iconName = tone === 'error' ? 'i-close' : tone === 'success' ? 'i-check' : 'i-spark';
    element.innerHTML = icon(iconName);
    const text = document.createElement('span');
    text.textContent = message;
    element.appendChild(text);
    els.toastRoot.appendChild(element);
    setTimeout(() => {
      element.classList.add('is-leaving');
      setTimeout(() => element.remove(), 280);
    }, 3000);
  }

  function updateCountdown() {
    const target = $('#lbCountdown');
    if (target && state.week) target.innerHTML = countdownHtml(state.week.end);
    if (state.week && Date.now() >= state.week.end) {
      refreshState({ render: true, silent: true });
    }
  }

  function scrollToTopIfRoute(route) {
    if (state.route === route) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(route) {
    if (route === 'profile') {
      openProfile();
      return;
    }
    const next = route === 'leaderboard' ? 'leaderboard' : 'home';
    closeModal({ restore: false });
    if (location.hash === `#/${next}`) {
      applyRoute(next, { scroll: true });
    } else {
      location.hash = `/${next}`;
      scrollToTopIfRoute(next);
    }
  }

  // -------------------------------------------------------
  // Events
  // -------------------------------------------------------

  function bindEvents() {
    document.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      switch (action) {
        case 'choose-role':
          chooseRole(target.dataset.role);
          break;
        case 'demo-login':
          demoLogin(target.dataset.role, target);
          break;
        case 'go':
          event.preventDefault();
          go(target.dataset.route);
          break;
        case 'draw':
          event.preventDefault();
          openDraw();
          break;
        case 'open-filters':
          event.preventDefault();
          openFilters();
          break;
        case 'choose-filter':
          updateFilterChip(target.dataset.group, target.dataset.value);
          break;
        case 'apply-filters':
          applyFilters();
          break;
        case 'reset-filters':
          resetFilters(false);
          break;
        case 'reset-filters-apply':
          resetFilters(true);
          setTimeout(() => openDraw(), 150);
          break;
        case 'open-history':
          openHistory();
          break;
        case 'open-thanks':
          openThanks(target.dataset.id);
          break;
        case 'open-report':
          openReport(target.dataset.id);
          break;
        case 'choose-report-reason':
          $$('.report-form .filter-chip').forEach((chip) => {
            const active = chip === target;
            chip.classList.toggle('is-active', active);
            chip.setAttribute('aria-pressed', String(active));
          });
          break;
        case 'submit-report':
          submitReport(target.dataset.id, target);
          break;
        case 'draw-reroll': {
          const bill = currentDrawBill();
          const next = pickRandomBill(bill?.id);
          if (!next) {
            toast('暂时没有更多账单了。', 'error');
            break;
          }
          state.modal = { type: 'draw', stage: 'bill', billId: next.id };
          state.previewId = next.id;
          setModalBody(renderDrawBill(next));
          break;
        }
        case 'draw-pay-start': {
          const bill = currentDrawBill();
          if (!bill) break;
          state.modal.stage = 'confirm';
          setModalBody(renderDrawConfirm(bill));
          break;
        }
        case 'draw-back': {
          const bill = currentDrawBill();
          if (!bill) break;
          state.modal.stage = 'bill';
          setModalBody(renderDrawBill(bill));
          break;
        }
        case 'draw-confirm':
          confirmPayment(target);
          break;
        case 'draw-another':
          closeModal({ restore: false });
          setTimeout(() => openDraw(), 130);
          break;
        case 'publish':
          event.preventDefault();
          openPublish();
          break;
        case 'choose-category':
          event.preventDefault();
          {
            const form = target.closest('#publishForm');
            if (form) {
              $$('.category-chip', form).forEach((chip) => {
                const active = chip === target;
                chip.classList.toggle('is-active', active);
                chip.setAttribute('aria-pressed', String(active));
              });
              const error = $('#publishError', form);
              if (error) error.textContent = '';
            }
          }
          break;
        case 'bill-tab':
          state.billTab = target.dataset.tabName === 'paid' ? 'paid' : 'pending';
          renderHome();
          applyRoute(state.route, { scroll: false });
          break;
        case 'withdraw':
          openWithdrawConfirm(target.dataset.id);
          break;
        case 'withdraw-confirm':
          withdrawBill(target.dataset.id, target);
          break;
        case 'open-profile':
          event.preventDefault();
          openProfile();
          break;
        case 'logout':
          logout();
          break;
        case 'open-reset':
          openResetConfirm();
          break;
        case 'reset-confirm':
          resetDemo(target);
          break;
        case 'close-modal':
          closeModal();
          break;
        default:
          break;
      }
    });

    document.addEventListener('submit', (event) => {
      if (event.target.id === 'loginForm') {
        event.preventDefault();
        submitLogin();
      }
      if (event.target.id === 'publishForm') {
        event.preventDefault();
        submitPublish(event.target);
      }
      if (event.target.id === 'thanksForm') {
        event.preventDefault();
        submitThanks(event.target);
      }
    });

    document.addEventListener('input', (event) => {
      if (event.target.id === 'loginName') {
        if (els.loginError) els.loginError.textContent = '';
      }
      if (event.target.id === 'billNote') {
        const counter = $('#noteCount');
        if (counter) counter.textContent = `${Array.from(event.target.value).length} / 120`;
      }
      if (event.target.closest('#publishForm')) {
        const error = $('#publishError');
        if (error) error.textContent = '';
      }
      if (event.target.id === 'thanksMessage') {
        const error = $('#thanksError');
        if (error) error.textContent = '';
      }
      if (event.target.id === 'reportNote') {
        const error = $('#reportError');
        if (error) error.textContent = '';
      }
    });

    document.addEventListener('keydown', (event) => {
      const dialog = $('.modal-panel', els.modalRoot);
      if (event.key === 'Escape' && dialog) {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key === 'Tab' && dialog) {
        const focusable = $$('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]', dialog)
          .filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-action="draw"][role="button"]')) {
        event.preventDefault();
        openDraw();
      }
    });

    window.addEventListener('hashchange', () => {
      applyRoute(routeFromHash(), { scroll: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.me) {
        refreshState({ render: true, silent: true });
      }
    });
  }

  async function boot() {
    bindEvents();
    const params = new URLSearchParams(location.search);
    if (params.get('screenshot') === '1') {
      document.documentElement.classList.add('screenshot-mode');
    }
    loadPublicStats();

    const demo = params.get('demo');
    state.route = initialRoute();

    let data = null;
    try {
      data = await tryGetState();
    } catch (error) {
      toast('暂时连不上服务器，请确认服务已启动。', 'error');
    }

    if (!data && demo) {
      try {
        await api('/api/login/demo', {
          method: 'POST',
          body: JSON.stringify({ role: demo === 'commoner' ? 'commoner' : 'rich' }),
        });
        data = await tryGetState();
        const url = new URL(location.href);
        url.searchParams.delete('demo');
        url.searchParams.delete('view');
        history.replaceState(null, '', `${url.pathname}${url.search}`);
      } catch (error) {
        toast(error.message || '演示账号暂时不可用', 'error');
      }
    }

    if (data) {
      applyState(data);
      if (!location.hash && state.route === 'leaderboard') {
        history.replaceState(null, '', `${location.pathname}${location.search}#/leaderboard`);
      }
      render();
      if (params.get('screenshot') !== '1') connectSSE();
      if (state.route === 'leaderboard') applyRoute('leaderboard', { scroll: false });
    } else {
      showAuth();
    }

    state.clockTimer = setInterval(updateCountdown, 1000);
    setInterval(() => {
      if (state.me && document.visibilityState === 'visible' && state.route === 'leaderboard') {
        refreshState({ render: true, silent: true });
      }
    }, 30000);
  }

  boot();
})();
