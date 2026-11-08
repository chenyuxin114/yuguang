(() => {
  'use strict';

  const TOKEN_KEY = 'yg_admin_token';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || '',
    data: null,
    tab: 'open',
    busy: false,
    timer: null,
  };

  const els = {
    gate: $('#adminGate'),
    panel: $('#adminPanel'),
    login: $('#adminLogin'),
    token: $('#adminToken'),
    error: $('#adminError'),
    stats: $('#adminStats'),
    content: $('#adminContent'),
    sync: $('#adminSync'),
    openCount: $('#openCount'),
    hiddenCount: $('#hiddenCount'),
    refresh: $('#adminRefresh'),
    logout: $('#adminLogout'),
    toast: $('#adminToast'),
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function money(amount) {
    return `¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(amount) || 0)}`;
  }

  function formatTime(ts) {
    if (!ts) return '—';
    const date = new Date(ts);
    return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function toast(message, tone = 'default') {
    const element = document.createElement('div');
    element.className = `toast ${tone === 'error' ? 'toast--error' : tone === 'success' ? 'toast--success' : ''}`;
    const span = document.createElement('span');
    span.textContent = message;
    element.appendChild(span);
    els.toast.appendChild(element);
    setTimeout(() => {
      element.classList.add('is-leaving');
      setTimeout(() => element.remove(), 250);
    }, 2800);
  }

  function showGate(message = '') {
    els.gate.hidden = false;
    els.panel.hidden = true;
    if (message) els.error.textContent = message;
  }

  function showPanel() {
    els.gate.hidden = true;
    els.panel.hidden = false;
    els.error.textContent = '';
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'X-Admin-Token': state.token,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }
    if (!response.ok) {
      const error = new Error(data?.error || `请求失败（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function load({ quiet = false } = {}) {
    if (!state.token) {
      showGate();
      return;
    }
    try {
      const data = await request('/api/admin/state');
      state.data = data;
      showPanel();
      render();
      els.sync.textContent = `已连接 · ${formatTime(data.serverNow)}`;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        sessionStorage.removeItem(TOKEN_KEY);
        state.token = '';
        showGate(error.message);
        return;
      }
      if (!quiet) toast(error.message || '审核台暂时连不上。', 'error');
      els.sync.textContent = '连接失败';
    }
  }

  function render() {
    const stats = state.data?.stats || {};
    els.stats.innerHTML = [
      ['待处理举报', stats.openReports || 0],
      ['已隐藏账单', stats.hiddenBills || 0],
      ['等待中的账单', stats.pendingBills || 0],
      ['全站账单', stats.totalBills || 0],
    ].map(([label, value], index) => `<div class="admin-stat ${index === 0 ? 'admin-stat--accent' : ''}"><strong>${value}</strong><span>${label}</span></div>`).join('');

    els.openCount.textContent = String(stats.openReports || 0);
    els.hiddenCount.textContent = String(stats.hiddenBills || 0);
    $$('.admin-tab').forEach((tab) => {
      const active = tab.dataset.tab === state.tab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    if (state.tab === 'open') renderOpenReports();
    else if (state.tab === 'hidden') renderHiddenBills();
    else renderResolved();
  }

  function renderOpenReports() {
    const reports = (state.data?.reports || []).filter((report) => report.status === 'open');
    if (!reports.length) {
      els.content.innerHTML = `<div class="admin-empty"><span>✓</span><h2>暂时没有待处理举报</h2><p>新的举报会自动出现在这里。当前没有需要处理的账单。</p></div>`;
      return;
    }
    els.content.innerHTML = `<div class="admin-report-list">${reports.map((report) => {
      const bill = report.bill;
      return `<article class="admin-report">
        <div class="admin-report__top">
          <span class="admin-badge admin-badge--alert">待处理</span>
          <span>${formatTime(report.createdAt)}</span>
        </div>
        <div class="admin-report__main">
          <div>
            <h2>${bill ? esc(bill.title) : '账单已删除'}</h2>
            <p class="admin-report__meta">${bill ? `${esc(bill.category)} · ${esc(bill.city)} · ${money(bill.amount)} · 发布者 ${esc(bill.ownerName)}` : '原始账单不存在'}</p>
            <p class="admin-report__reason"><strong>举报原因</strong>${esc(report.reason)}</p>
            <p class="admin-report__by">举报人：${esc(report.reporterName)} · ${bill ? `${bill.openReports} 条待处理举报` : ''}</p>
          </div>
          <div class="admin-report__actions">
            ${bill ? `<button class="btn btn--red btn--sm" type="button" data-action="hide-report" data-id="${esc(report.id)}">隐藏账单</button>` : ''}
            <button class="btn btn--ghost btn--sm" type="button" data-action="dismiss-report" data-id="${esc(report.id)}">忽略举报</button>
          </div>
        </div>
      </article>`;
    }).join('')}</div>`;
  }

  function renderHiddenBills() {
    const bills = state.data?.hiddenBills || [];
    if (!bills.length) {
      els.content.innerHTML = `<div class="admin-empty"><span>✓</span><h2>没有隐藏中的账单</h2><p>被隐藏的账单会从富人端的随机池里消失。</p></div>`;
      return;
    }
    els.content.innerHTML = `<div class="admin-bill-list">${bills.map((bill) => `<article class="admin-bill">
      <div>
        <h2>${esc(bill.title)}</h2>
        <p>${esc(bill.category)} · ${esc(bill.city)} · ${money(bill.amount)} · ${esc(bill.status === 'paid' ? '已结清' : '等待中')}</p>
        <p class="admin-bill__reason">${esc(bill.hiddenReason || '管理员隐藏')} · 发布者 ${esc(bill.ownerName)} · ${bill.openReports} 条待处理举报</p>
      </div>
      <div class="admin-report__actions">
        <button class="btn btn--ghost btn--sm" type="button" data-action="restore-bill" data-id="${esc(bill.id)}">恢复展示</button>
        <button class="btn btn--danger-outline btn--sm" type="button" data-action="delete-bill" data-id="${esc(bill.id)}">永久删除</button>
      </div>
    </article>`).join('')}</div>`;
  }

  function renderResolved() {
    const reports = state.data?.recentResolved || [];
    if (!reports.length) {
      els.content.innerHTML = `<div class="admin-empty"><span>✓</span><h2>还没有处理记录</h2><p>处理过的举报会保留在这里，方便回溯。</p></div>`;
      return;
    }
    els.content.innerHTML = `<div class="admin-resolved-list">${reports.map((report) => `<div class="admin-resolved">
      <span class="admin-badge ${report.status === 'resolved' ? '' : 'admin-badge--muted'}">${report.resolution === 'hide' ? '已隐藏' : '已忽略'}</span>
      <div><strong>${report.bill ? esc(report.bill.title) : '账单已删除'}</strong><small>${esc(report.reason)} · ${formatTime(report.resolvedAt || report.createdAt)}</small></div>
      <span>${report.bill ? money(report.bill.amount) : ''}</span>
    </div>`).join('')}</div>`;
  }

  async function act(button, action, path, body) {
    if (state.busy) return;
    state.busy = true;
    button.disabled = true;
    try {
      state.data = await request(path, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        body: action === 'delete' ? undefined : JSON.stringify(body || {}),
      });
      render();
      toast('审核状态已更新。', 'success');
    } catch (error) {
      toast(error.message || '操作失败，请稍后再试。', 'error');
      button.disabled = false;
    } finally {
      state.busy = false;
    }
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) {
      state.tab = tab.dataset.tab;
      render();
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'hide-report') {
      act(button, 'hide', `/api/admin/reports/${encodeURIComponent(id)}`, { action: 'hide' });
    } else if (action === 'dismiss-report') {
      act(button, 'dismiss', `/api/admin/reports/${encodeURIComponent(id)}`, { action: 'dismiss' });
    } else if (action === 'restore-bill') {
      act(button, 'restore', `/api/admin/bills/${encodeURIComponent(id)}/visibility`, { hidden: false });
    } else if (action === 'delete-bill') {
      if (!window.confirm('确定永久删除这张账单吗？同时会清掉相关举报。')) return;
      act(button, 'delete', `/api/admin/bills/${encodeURIComponent(id)}`);
    }
  });

  els.login.addEventListener('submit', (event) => {
    event.preventDefault();
    const token = els.token.value.trim();
    if (!token) {
      els.error.textContent = '请输入审核口令。';
      return;
    }
    state.token = token;
    sessionStorage.setItem(TOKEN_KEY, token);
    load();
  });

  els.refresh.addEventListener('click', () => load());
  els.logout.addEventListener('click', () => {
    sessionStorage.removeItem(TOKEN_KEY);
    state.token = '';
    state.data = null;
    showGate('已退出审核台。');
  });

  if (state.token) {
    els.token.value = state.token;
    load();
  } else {
    showGate();
  }

  state.timer = setInterval(() => {
    if (state.token && document.visibilityState === 'visible') load({ quiet: true });
  }, 15_000);
})();
