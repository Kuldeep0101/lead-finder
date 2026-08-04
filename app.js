// ============================================
// LeadMapper — Core Application Logic
// ============================================

const DEFAULT_SUPABASE_URL = 'https://wgfteclxeqsrormimttj.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZnRlY2x4ZXFzcm9ybWltdHRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NDczNDUsImV4cCI6MjEwMTMyMzM0NX0.9mozUxN2cPCsrHsU4jtOWOIPGukLJmyWokg7I_wG13Y';
const ACTOR_ID = 'compass~crawler-google-places';

const DEFAULT_NICHES = {
  coaching: {
    id: 'coaching',
    name: 'Coaching Institutes',
    icon: '🎓',
    defaultQuery: 'IAS Coaching Institute',
    defaultLocation: 'Delhi, India',
    template: 'Hi [Name], I noticed your coaching institute in [Location]. We help top institutes acquire 20+ new student enrollments monthly. Are you taking on new batches this month?',
    followup: 'Hi [Name], following up on my previous note. Would love to share how we helped similar institutes scale student intake.'
  },
  makeup: {
    id: 'makeup',
    name: 'Bridal & Spa',
    icon: '💄',
    defaultQuery: 'Bridal Makeup Artist',
    defaultLocation: 'Mumbai, India',
    template: 'Hi [Name], loved your portfolio! We help premium bridal makeup artists book 15+ high-ticket bridal bookings every month. Do you have availability for upcoming wedding dates?',
    followup: 'Hi [Name], floating this to top of your inbox. We have 3 qualified bridal leads looking for artists in [Location] this month.'
  },
  cardenting: {
    id: 'cardenting',
    name: 'Car Decoration & Denting',
    icon: '🚗',
    defaultQuery: 'Car Denting Painting Workshop',
    defaultLocation: 'Bangalore, India',
    template: 'Hi [Name], saw your workshop listing. We send 25+ car repair & detailing customers directly to auto garages in [Location]. Open to taking more car repair jobs?',
    followup: 'Hi [Name], checking in quickly. Would you be open to a 2-min chat on getting more daily car detailing & denting jobs?'
  }
};

const state = {
  activeNiche: 'coaching',
  customNiches: [],
  leads: [],
  filteredLeads: [],
  followups: [],
  closedDeals: [],
  contactedPhones: new Set(),
  currentView: 'empty', // 'empty', 'grid', 'table', 'followups', 'closed'
  minRating: 3,
  hasPhoneOnly: false,
  minReviews15: false,
  onlyWithoutWebsite: false,
  onlyContacted: false,
  removeDuplicates: true,
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseKey: DEFAULT_SUPABASE_KEY,
  apifyApiKey: ''
};

const $ = (id) => document.getElementById(id);

// ─── Toast Notifications ─────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─── Niche Configuration Helper ──────────────────────────────
function getNicheConfig(nicheKey) {
  if (DEFAULT_NICHES[nicheKey]) return DEFAULT_NICHES[nicheKey];
  const custom = state.customNiches.find(c => c.id === nicheKey);
  if (custom) return custom;
  return DEFAULT_NICHES.coaching;
}

// ─── Auth Logic ──────────────────────────────────────────────
function checkAuth() {
  const isAuth = localStorage.getItem('leadmapper_authenticated') === 'true';
  const overlay = $('authOverlay');
  const header = $('header');

  if (isAuth) {
    if (overlay) overlay.classList.add('hidden');
    if (header) header.classList.remove('hidden');
  } else {
    if (overlay) overlay.classList.remove('hidden');
    if (header) header.classList.add('hidden');
  }
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const user = $('authUsername').value.trim();
  const pass = $('authPassword').value.trim();

  if (user === 'kennyS007' && pass === 'Ayushman@123') {
    localStorage.setItem('leadmapper_authenticated', 'true');
    checkAuth();
    showToast('🔓 Welcome, kennyS007!');
  } else {
    $('authError').classList.remove('hidden');
    $('authErrorMsg').textContent = 'Invalid credentials. Please try again.';
  }
}

function handleLogout() {
  localStorage.removeItem('leadmapper_authenticated');
  checkAuth();
  showToast('🔒 Signed out');
}

// ─── View Switching Engine ───────────────────────────────────
function setView(viewName) {
  state.currentView = viewName;
  console.log(`[LeadMapper View] setView -> "${viewName}"`);

  if ($('navMobileSelect')) {
    $('navMobileSelect').value = (viewName === 'table') ? 'grid' : viewName;
  }

  // Sections
  const emptyState = $('emptyState');
  const resultsArea = $('resultsArea');
  const followupsArea = $('followupsArea');
  const closedDealsArea = $('closedDealsArea');
  const loadingState = $('loadingState');
  const errorState = $('errorState');

  // Hide all sections first
  [emptyState, resultsArea, followupsArea, closedDealsArea, loadingState, errorState].forEach(el => {
    if (el) el.classList.add('hidden');
  });

  // Nav tabs active states
  ['tabSearch', 'tabResults', 'tabFollowups', 'tabClosedDeals'].forEach(id => {
    if ($(id)) $(id).classList.remove('active');
  });

  const grid = $('leadsGrid');
  const table = $('tableWrapper');
  const gridBtn = $('viewGrid');
  const tableBtn = $('viewTable');

  if (viewName === 'empty') {
    if (emptyState) emptyState.classList.remove('hidden');
    if ($('tabSearch')) $('tabSearch').classList.add('active');
  } else if (viewName === 'grid' || viewName === 'table') {
    if (resultsArea) resultsArea.classList.remove('hidden');
    if ($('tabResults')) $('tabResults').classList.add('active');

    if (viewName === 'grid') {
      if (grid) grid.classList.remove('hidden');
      if (table) table.classList.add('hidden');
      if (gridBtn) gridBtn.classList.add('active');
      if (tableBtn) tableBtn.classList.remove('active');
    } else {
      if (grid) grid.classList.add('hidden');
      if (table) table.classList.remove('hidden');
      if (tableBtn) tableBtn.classList.add('active');
      if (gridBtn) gridBtn.classList.remove('active');
    }

    renderGridView();
    renderTableView();
  } else if (viewName === 'followups') {
    if (followupsArea) followupsArea.classList.remove('hidden');
    if ($('tabFollowups')) $('tabFollowups').classList.add('active');
    fetchFollowUpsFromDB();
  } else if (viewName === 'closed') {
    if (closedDealsArea) closedDealsArea.classList.remove('hidden');
    if ($('tabClosedDeals')) $('tabClosedDeals').classList.add('active');
    fetchFollowUpsFromDB();
  }
}

// ─── Workspace Switcher ──────────────────────────────────────
function renderNichePills() {
  const container = $('nicheBar');
  const mobileSelect = $('nicheMobileSelect');

  const defaultKeys = ['coaching', 'makeup', 'cardenting'];
  let html = defaultKeys.map(key => {
    const config = DEFAULT_NICHES[key];
    const activeClass = state.activeNiche === key ? 'active' : '';
    return `<button class="niche-pill ${activeClass}" onclick="switchNiche('${key}')"><span>${config.icon}</span> ${config.name}</button>`;
  }).join('');

  state.customNiches.forEach(custom => {
    const activeClass = state.activeNiche === custom.id ? 'active' : '';
    html += `<button class="niche-pill ${activeClass}" onclick="switchNiche('${custom.id}')"><span>${custom.icon}</span> ${custom.name}</button>`;
  });

  html += `<button class="niche-pill" onclick="promptAddNewNiche()"><span>➕</span> Add Niche</button>`;
  html += `<button class="niche-pill" onclick="openImportModal()"><span>📥</span> Import Dataset</button>`;

  if (container) container.innerHTML = html;

  if (mobileSelect) {
    let mobileOptions = defaultKeys.map(key => {
      const config = DEFAULT_NICHES[key];
      const selected = state.activeNiche === key ? 'selected' : '';
      return `<option value="${key}" ${selected}>${config.icon} ${config.name}</option>`;
    }).join('');

    state.customNiches.forEach(custom => {
      const selected = state.activeNiche === custom.id ? 'selected' : '';
      mobileOptions += `<option value="${custom.id}" ${selected}>${custom.icon} ${custom.name}</option>`;
    });
    mobileSelect.innerHTML = mobileOptions;
  }
}

function loadNicheTemplates(nicheKey) {
  const config = getNicheConfig(nicheKey);
  const savedTpl = localStorage.getItem(`outreach_template_${nicheKey}`) || config.template || 'Hi [Name], reaching out regarding your business...';
  const savedFol = localStorage.getItem(`outreach_followup_template_${nicheKey}`) || config.followup || 'Hi [Name], following up on my previous note...';

  state.outreachTemplate = savedTpl;
  state.outreachFollowupTemplate = savedFol;

  if ($('outreachTemplate')) $('outreachTemplate').value = savedTpl;
  if ($('outreachFollowupTemplate')) $('outreachFollowupTemplate').value = savedFol;
}

function switchNiche(nicheKey) {
  state.activeNiche = nicheKey;
  renderNichePills();

  const config = getNicheConfig(nicheKey);
  if ($('activeNicheBadge')) $('activeNicheBadge').textContent = `${config.icon} ${config.name} Workspace`;
  if ($('searchQuery')) $('searchQuery').value = config.defaultQuery;
  if ($('locationQuery')) $('locationQuery').value = config.defaultLocation;
  if ($('crmNicheTitle')) $('crmNicheTitle').textContent = config.name;

  loadNicheTemplates(nicheKey);
  restoreActiveSession();
  fetchScrapedLeadsFromDB();
  fetchFollowUpsFromDB();
  showToast(`Active workspace: ${config.name}`);
}

function promptAddNewNiche() {
  const name = prompt('Enter new workspace name (e.g. Real Estate):');
  if (!name || !name.trim()) return;
  const icon = prompt('Enter an emoji icon (e.g. 🏠):') || '🏢';
  const cleanId = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  const newNiche = {
    id: cleanId,
    name: name.trim(),
    icon: icon.trim(),
    defaultQuery: `${name.trim()} businesses`,
    defaultLocation: 'Mumbai, India'
  };

  state.customNiches.push(newNiche);
  localStorage.setItem('custom_niches', JSON.stringify(state.customNiches));
  switchNiche(cleanId);
}

// ─── Filtering Logic ─────────────────────────────────────────
function getWebsiteStatus(website) {
  if (!website) return { isPoor: true, type: 'none', label: 'No Website', badgeClass: 'no-website-tag' };

  const w = String(website).toLowerCase().trim();
  if (w === '' || w === 'none' || w === 'n/a' || w === 'null' || w === 'no website' || w === '—') {
    return { isPoor: true, type: 'none', label: 'No Website', badgeClass: 'no-website-tag' };
  }

  const poorSubdomains = [
    '.business.site',
    '.wixsite.com',
    '.site123.me',
    '.wordpress.com',
    '.weebly.com',
    '.blogspot.com',
    '.jimdosite.com'
  ];

  const matched = poorSubdomains.find(sub => w.includes(sub));
  if (matched) {
    return { isPoor: true, type: 'subdomain', label: `Subdomain (${matched})`, badgeClass: 'poor-website-tag' };
  }

  return { isPoor: false, type: 'custom', label: 'Custom Website', badgeClass: '' };
}

function hasNoWebsite(website) {
  return getWebsiteStatus(website).isPoor;
}

function filterLeads() {
  const query = $('filterInput') ? $('filterInput').value.toLowerCase().trim() : '';
  let list = state.leads || [];

  if (state.removeDuplicates) {
    const map = new Map();
    list.forEach(lead => {
      if (!lead.phone) {
        map.set(`no_phone_${lead.num}`, lead);
      } else {
        if (!map.has(lead.phone)) map.set(lead.phone, lead);
      }
    });
    list = Array.from(map.values());
  }

  state.filteredLeads = list.filter(l => {
    if (state.minRating > 0 && (l.rating === null || l.rating < state.minRating)) return false;
    if (state.hasPhoneOnly && (!l.phone || !l.phone.trim())) return false;
    if (state.minReviews15 && l.reviewsCount < 15) return false;
    if (state.onlyWithoutWebsite && !hasNoWebsite(l.website)) return false;
    if (state.onlyContacted && (!l.phone || !state.contactedPhones.has(l.phone))) return false;
    if (query) {
      const matchName = l.name.toLowerCase().includes(query);
      const matchCategory = l.category.toLowerCase().includes(query);
      const matchAddress = l.address.toLowerCase().includes(query);
      const matchPhone = l.phone && l.phone.includes(query);
      if (!matchName && !matchCategory && !matchAddress && !matchPhone) return false;
    }
    return true;
  }).map((l, i) => ({ ...l, num: i + 1 }));

  renderGridView();
  renderTableView();

  if ($('scrapedNavBadge')) $('scrapedNavBadge').textContent = state.leads.length;
  if ($('resultsSubtitle')) $('resultsSubtitle').textContent = `${state.filteredLeads.length} leads matching filters`;
}

function toggleNoWebsiteFilter() {
  state.onlyWithoutWebsite = !state.onlyWithoutWebsite;
  if ($('toolbarNoWebsiteBtn')) $('toolbarNoWebsiteBtn').classList.toggle('active', state.onlyWithoutWebsite);
  filterLeads();
}

function toggleContactedFilter() {
  state.onlyContacted = !state.onlyContacted;
  if ($('toolbarContactedBtn')) $('toolbarContactedBtn').classList.toggle('active', state.onlyContacted);
  filterLeads();
}

// ─── Rendering Engine ────────────────────────────────────────
function renderGridView() {
  const grid = $('leadsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!state.filteredLeads || state.filteredLeads.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:40px; background:#fff; border-radius:12px; border:1px solid #e2e8f0;">
        <div style="font-size:2rem; margin-bottom:8px;">🔍</div>
        <h3 style="font-size:1.1rem; font-weight:700;">No leads match filters</h3>
        <p style="font-size:0.85rem; color:#64748b; margin-bottom:16px;">Try clearing search or filter toggles.</p>
        <button class="secondary-btn" onclick="resetFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  state.filteredLeads.forEach((lead, idx) => {
    const card = document.createElement('div');
    card.className = 'lead-card';
    
    const isContacted = lead.phone && state.contactedPhones.has(lead.phone);
    const waClass = isContacted ? 'contacted-btn' : 'whatsapp-btn';
    const waText = isContacted ? '✓ Contacted' : '💬 WhatsApp';

    const webStatus = getWebsiteStatus(lead.website);
    let webHtml = '';
    if (webStatus.type === 'none') {
      webHtml = `<div class="card-detail-row">🌐 <span class="no-website-tag">No Website</span></div>`;
    } else if (webStatus.type === 'subdomain') {
      webHtml = `<div class="card-detail-row">🌐 <a href="https://${lead.website}" target="_blank">${truncate(lead.website, 22)}</a> <span class="poor-website-tag">Subdomain</span></div>`;
    } else {
      webHtml = `<div class="card-detail-row">🌐 <a href="https://${lead.website}" target="_blank">${truncate(lead.website, 28)}</a></div>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <span class="card-name">${escapeHtml(lead.name)}</span>
        <span class="card-num">#${lead.num}</span>
      </div>
      <span class="card-category">${escapeHtml(lead.category)}</span>
      <div class="card-rating">
        ⭐ <b>${lead.rating ? lead.rating.toFixed(1) : 'N/A'}</b> (${lead.reviewsCount || 0} reviews)
      </div>
      <div class="card-details">
        ${lead.phone ? `<div class="card-detail-row">📞 ${lead.phone}</div>` : ''}
        ${webHtml}
        <div class="card-detail-row">📍 ${truncate(lead.address, 35)}</div>
      </div>
      <div class="card-actions">
        ${lead.phone ? `<button class="card-action-btn ${waClass}" onclick="openWhatsApp('${lead.phone}', ${idx})">${waText}</button>` : ''}
        ${lead.googleMapsUrl ? `<button class="card-action-btn" onclick="window.open('${lead.googleMapsUrl}', '_blank')">📍 Maps</button>` : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderTableView() {
  const tbody = $('leadsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.filteredLeads.forEach(lead => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${lead.num}</td>
      <td><b>${escapeHtml(lead.name)}</b></td>
      <td>${escapeHtml(lead.category)}</td>
      <td>⭐ ${lead.rating ? lead.rating.toFixed(1) : 'N/A'}</td>
      <td>${lead.reviewsCount || 0}</td>
      <td>${lead.phone || '—'}</td>
      <td>${lead.website ? `<a href="https://${lead.website}" target="_blank">${truncate(lead.website, 24)}</a>` : '—'}</td>
      <td>${truncate(lead.address, 30)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFollowUpsView() {
  const grid = $('followupsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!state.followups || state.followups.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; padding:30px; text-align:center; background:#fff; border-radius:12px; border:1px solid #e2e8f0; color:#64748b;">No contacted leads found yet. Click WhatsApp on any scraped lead to start outreach!</div>`;
    return;
  }

  const now = new Date();

  state.followups.forEach(item => {
    const card = document.createElement('div');
    card.className = 'followup-card';
    
    const contactedDate = item.contacted_at ? new Date(item.contacted_at) : new Date();
    const diffMs = now - contactedDate;
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = Math.floor(diffHours / 24);
    
    let badgeHtml = '';
    let actionBtnHtml = '';

    if (diffDays < 3) {
      const daysLeft = 3 - diffDays;
      const hoursLeft = Math.ceil(72 - diffHours);
      const waitStr = daysLeft > 1 ? `${daysLeft}d left` : `${hoursLeft}h left`;
      
      badgeHtml = `<span class="status-pill waiting">⏳ Contacted (${diffDays}d ago)</span>`;
      actionBtnHtml = `<button class="card-action-btn disabled-btn" disabled title="Follow-up unlocks after 3 days of waiting">⏳ Follow up (${waitStr})</button>`;
    } else if (diffDays < 7) {
      badgeHtml = `<span class="status-pill ready">💬 Ready for Follow-up (${diffDays}d ago)</span>`;
      actionBtnHtml = `<button class="card-action-btn whatsapp-btn" onclick="openFollowupWhatsApp('${item.phone}', '${escapeHtml(item.name || 'Lead')}', 'followup')">💬 Follow up</button>`;
    } else {
      badgeHtml = `<span class="status-pill urgent">🔥 Final Followup (${diffDays}d ago)</span>`;
      actionBtnHtml = `<button class="card-action-btn warning-btn" onclick="openFollowupWhatsApp('${item.phone}', '${escapeHtml(item.name || 'Lead')}', 'final')">🔥 Send Final Followup</button>`;
    }

    const cleanPhone = (item.phone || '').replace(/[^0-9]/g, '');

    card.innerHTML = `
      <div class="card-header">
        <span class="card-name">${escapeHtml(item.name || 'Lead')}</span>
        ${badgeHtml}
      </div>
      <div class="card-details">
        <div class="card-detail-row">📞 ${item.phone}</div>
        <div class="card-detail-row">🕒 Last Outreach: ${contactedDate.toLocaleDateString()} (${diffDays} days ago)</div>
      </div>
      <div class="card-actions">
        ${actionBtnHtml}
        <div class="card-dropdown-wrapper">
          <button class="card-action-btn dots-btn" onclick="toggleCardDropdown(event, '${cleanPhone}')" title="More options">
            ⋮
          </button>
          <div class="card-dropdown-menu hidden" id="dropdown-${cleanPhone}">
            <button class="dropdown-item" onclick="markDealClosed('${item.phone}')">
              ⭐ Mark as Won Deal
            </button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function toggleCardDropdown(e, cleanPhone) {
  e.stopPropagation();
  const menuId = `dropdown-${cleanPhone}`;
  const targetMenu = $(menuId);

  document.querySelectorAll('.card-dropdown-menu').forEach(el => {
    if (el.id !== menuId) el.classList.add('hidden');
  });

  if (targetMenu) {
    targetMenu.classList.toggle('hidden');
  }
}

document.addEventListener('click', () => {
  document.querySelectorAll('.card-dropdown-menu').forEach(el => {
    el.classList.add('hidden');
  });
});

async function openFollowupWhatsApp(phone, leadName, type) {
  if (!phone) return;
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const config = getNicheConfig(state.activeNiche);

  let message = '';
  if (type === 'final') {
    message = `Hi ${leadName}, final check-in from my side. Should I close your file for now or are you still open to discussing acquiring new clients for your business?`;
  } else {
    message = config.followup ? config.followup.replace(/\[Name\]/g, leadName) : `Hi ${leadName}, following up on my previous note. Would love to connect regarding your business.`;
  }

  const url = `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');

  // Reset timer on outreach send by updating contacted_at in Supabase
  if (state.supabaseUrl && state.supabaseKey) {
    try {
      await fetch(`${state.supabaseUrl}/rest/v1/contacted_leads?phone=eq.${cleanPhone}`, {
        method: 'PATCH',
        headers: {
          'apikey': state.supabaseKey,
          'Authorization': `Bearer ${state.supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contacted_at: new Date().toISOString()
        })
      });
      fetchFollowUpsFromDB();
    } catch(e) {}
  }
}

function renderClosedDealsView() {
  const grid = $('closedDealsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!state.closedDeals || state.closedDeals.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; padding:30px; text-align:center; background:#fff; border-radius:12px; border:1px solid #e2e8f0; color:#64748b;">No won deals logged yet. Move leads from Contacted CRM to Closed Deals!</div>`;
    return;
  }

  state.closedDeals.forEach(item => {
    const card = document.createElement('div');
    card.className = 'lead-card';
    card.innerHTML = `
      <div class="card-header">
        <span class="card-name">🏆 ${escapeHtml(item.name || 'Won Client')}</span>
      </div>
      <div class="card-details">
        <div class="card-detail-row">📞 ${item.phone}</div>
        <div class="card-detail-row">🎉 Closed deal in ${getNicheConfig(state.activeNiche).name}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function initStarPicker() {
  const container = $('starPicker');
  if (!container) return;

  const stars = container.querySelectorAll('.star-btn');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      const rating = parseInt(star.getAttribute('data-rating'));
      if (state.minRating === rating) {
        state.minRating = 0;
      } else {
        state.minRating = rating;
      }

      stars.forEach(s => {
        const r = parseInt(s.getAttribute('data-rating'));
        if (r <= state.minRating) s.classList.add('active');
        else s.classList.remove('active');
      });

      filterLeads();
    });
  });

  stars.forEach(s => {
    const r = parseInt(s.getAttribute('data-rating'));
    if (r <= state.minRating) s.classList.add('active');
    else s.classList.remove('active');
  });
}

function resetFilters() {
  state.minRating = 3;
  state.hasPhoneOnly = false;
  state.minReviews15 = false;
  state.onlyWithoutWebsite = false;
  state.onlyContacted = false;

  if ($('filterInput')) $('filterInput').value = '';
  if ($('toolbarNoWebsiteBtn')) $('toolbarNoWebsiteBtn').classList.remove('active');
  if ($('toolbarContactedBtn')) $('toolbarContactedBtn').classList.remove('active');
  if ($('onlyWithoutWebsiteToggle')) $('onlyWithoutWebsiteToggle').checked = false;
  if ($('onlyContactedToggle')) $('onlyContactedToggle').checked = false;
  if ($('hasPhoneOnlyToggle')) $('hasPhoneOnlyToggle').checked = false;
  if ($('minReviewsToggle')) $('minReviewsToggle').checked = false;

  const container = $('starPicker');
  if (container) {
    const stars = container.querySelectorAll('.star-btn');
    stars.forEach(s => {
      const r = parseInt(s.getAttribute('data-rating'));
      if (r <= state.minRating) s.classList.add('active');
      else s.classList.remove('active');
    });
  }

  filterLeads();
}

// ─── WhatsApp & Outreach Handler ─────────────────────────────
function openWhatsApp(phone, leadIndex) {
  if (!phone) return;
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  state.contactedPhones.add(cleanPhone);
  if ($('contactedNavBadge')) $('contactedNavBadge').textContent = state.contactedPhones.size;

  const lead = leadIndex !== undefined ? state.filteredLeads[leadIndex] : null;
  const config = getNicheConfig(state.activeNiche);
  let template = config.template || 'Hi [Name], reaching out regarding your business...';

  if (lead) {
    template = template.replace(/\[Name\]/g, lead.name)
                       .replace(/\[Location\]/g, lead.address || 'your city');
  }

  const url = `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(template)}`;
  window.open(url, '_blank');

  // Push to Supabase contacted_leads
  saveContactedToDB(lead ? lead.name : 'Outreach Lead', cleanPhone);
  filterLeads();
}

async function saveContactedToDB(name, phone) {
  if (!state.supabaseUrl || !state.supabaseKey) return;
  try {
    await fetch(`${state.supabaseUrl}/rest/v1/contacted_leads`, {
      method: 'POST',
      headers: {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        phone: phone,
        name: name,
        niche: state.activeNiche,
        contacted_at: new Date().toISOString(),
        status: 'contacted'
      })
    });
    fetchFollowUpsFromDB();
  } catch(e) {}
}

async function markDealClosed(phone) {
  if (!state.supabaseUrl || !state.supabaseKey) return;
  try {
    await fetch(`${state.supabaseUrl}/rest/v1/contacted_leads?phone=eq.${phone}`, {
      method: 'PATCH',
      headers: {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'closed' })
    });
    showToast('🎉 Lead marked as Won Deal!');
    fetchFollowUpsFromDB();
  } catch(e) {}
}

// ─── Database Sync Handlers ──────────────────────────────────
async function fetchScrapedLeadsFromDB() {
  if (!state.supabaseUrl || !state.supabaseKey) return false;

  try {
    const nicheFilter = state.activeNiche === 'coaching'
      ? `or=(niche.eq.coaching,niche.is.null)`
      : `niche=eq.${state.activeNiche}`;

    let res = await fetch(`${state.supabaseUrl}/rest/v1/scraped_leads?select=*&${nicheFilter}&order=created_at.desc&limit=300`, {
      method: 'GET',
      headers: {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`
      }
    });

    if (!res.ok) {
      res = await fetch(`${state.supabaseUrl}/rest/v1/scraped_leads?select=*&order=created_at.desc&limit=300`, {
        method: 'GET',
        headers: {
          'apikey': state.supabaseKey,
          'Authorization': `Bearer ${state.supabaseKey}`
        }
      });
    }

    if (res.ok) {
      const data = await res.json();
      // Strictly scope to current workspace niche in JS memory
      const nicheLeads = (data || []).filter(d => {
        if (state.activeNiche === 'coaching') {
          return !d.niche || d.niche === 'coaching';
        }
        return d.niche === state.activeNiche;
      });

      state.leads = nicheLeads.map((d, idx) => ({
        num: idx + 1,
        name: d.name || 'Unknown Business',
        category: d.category || '—',
        rating: d.rating ? parseFloat(d.rating) : null,
        reviewsCount: d.reviews_count || 0,
        phone: d.phone || null,
        website: d.website || null,
        address: d.address || '—',
        googleMapsUrl: d.google_maps_url || null,
        niche: d.niche || state.activeNiche
      }));

      filterLeads();
      if ($('scrapedNavBadge')) $('scrapedNavBadge').textContent = state.leads.length;
      saveActiveSession(`Cloud DB`, 'Supabase', state.leads);
      return true;
    }
  } catch (err) {
    console.warn('Supabase fetch error:', err);
  }
  return false;
}

async function fetchFollowUpsFromDB() {
  if (!state.supabaseUrl || !state.supabaseKey) return;
  try {
    let res = await fetch(`${state.supabaseUrl}/rest/v1/contacted_leads?select=*&order=contacted_at.asc`, {
      method: 'GET',
      headers: {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      data.forEach(row => { if (row.phone) state.contactedPhones.add(row.phone); });

      // Strictly scope contacted CRM and closed deals to current workspace niche
      state.followups = (data || []).filter(d => {
        if (d.status === 'closed') return false;
        if (state.activeNiche === 'coaching') return !d.niche || d.niche === 'coaching';
        return d.niche === state.activeNiche;
      });

      state.closedDeals = (data || []).filter(d => {
        if (d.status !== 'closed') return false;
        if (state.activeNiche === 'coaching') return !d.niche || d.niche === 'coaching';
        return d.niche === state.activeNiche;
      });

      renderFollowUpsView();
      renderClosedDealsView();

      if ($('contactedNavBadge')) $('contactedNavBadge').textContent = state.followups.length;
      if ($('closedNavBadge')) $('closedNavBadge').textContent = state.closedDeals.length;
      if ($('followupsSubtitle')) $('followupsSubtitle').textContent = `${state.followups.length} leads in ${getNicheConfig(state.activeNiche).name} outreach pipeline`;
      if ($('closedDealsSubtitle')) $('closedDealsSubtitle').textContent = `${state.closedDeals.length} won deals in ${getNicheConfig(state.activeNiche).name}`;
    }
  } catch(e) {}
}

function saveActiveSession(query, location, leads) {
  try {
    const sessionData = { query, location, leads, timestamp: Date.now(), niche: state.activeNiche };
    localStorage.setItem(`leadmapper_active_session_${state.activeNiche}`, JSON.stringify(sessionData));
  } catch (e) {}
}

function restoreActiveSession() {
  const saved = localStorage.getItem(`leadmapper_active_session_${state.activeNiche}`);
  if (!saved) {
    state.leads = [];
    state.filteredLeads = [];
    if ($('scrapedNavBadge')) $('scrapedNavBadge').textContent = '0';
    return false;
  }
  try {
    const session = JSON.parse(saved);
    if (session && session.leads && Array.isArray(session.leads) && session.leads.length > 0) {
      state.leads = session.leads;
      filterLeads();
      return true;
    }
  } catch (e) {}
  return false;
}

// ─── Export CSV ──────────────────────────────────────────────
function exportCSV() {
  if (!state.filteredLeads.length) return showToast('No leads to export');
  const headers = ['#', 'Name', 'Category', 'Rating', 'Reviews', 'Phone', 'Website', 'Address'];
  const rows = state.filteredLeads.map(l => [
    l.num,
    `"${(l.name || '').replace(/"/g, '""')}"`,
    `"${(l.category || '').replace(/"/g, '""')}"`,
    l.rating || '',
    l.reviewsCount || 0,
    `"${l.phone || ''}"`,
    `"${l.website || ''}"`,
    `"${(l.address || '').replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `leads_${state.activeNiche}.csv`;
  a.click();
  showToast('📥 Exported CSV successfully!');
}

// ─── Settings Modal ──────────────────────────────────────────
function openSettingsModal() {
  if ($('apifyApiKey')) $('apifyApiKey').value = state.apifyApiKey;
  if ($('supabaseUrl')) $('supabaseUrl').value = state.supabaseUrl;
  if ($('supabaseKey')) $('supabaseKey').value = state.supabaseKey;
  if ($('settingsModal')) $('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  if ($('settingsModal')) $('settingsModal').classList.add('hidden');
}

function saveSettings() {
  state.apifyApiKey = $('apifyApiKey').value.trim();
  state.supabaseUrl = $('supabaseUrl').value.trim();
  state.supabaseKey = $('supabaseKey').value.trim();

  localStorage.setItem('apify_api_key', state.apifyApiKey);
  localStorage.setItem('supabase_url', state.supabaseUrl);
  localStorage.setItem('supabase_key', state.supabaseKey);

  closeSettingsModal();
  showToast('⚙️ Settings saved!');
  fetchScrapedLeadsFromDB();
  fetchFollowUpsFromDB();
}

function openImportModal() {
  const ds = prompt('Enter Apify Dataset ID to import:');
  if (ds && ds.trim()) {
    showToast(`Importing dataset ${ds.trim()}...`);
  }
}

// ─── Helper Utils ────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '…' : str;
}

// ─── App Initialization ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  const savedKey = localStorage.getItem('apify_api_key');
  if (savedKey) state.apifyApiKey = savedKey;

  const savedSbUrl = localStorage.getItem('supabase_url');
  if (savedSbUrl) state.supabaseUrl = savedSbUrl;

  const savedSbKey = localStorage.getItem('supabase_key');
  if (savedSbKey) state.supabaseKey = savedSbKey;

  renderNichePills();
  loadNicheTemplates(state.activeNiche);
  initStarPicker();

  // Explicitly clear any browser autofilled text in search filter
  if ($('filterInput')) $('filterInput').value = '';

  const slider = $('maxResultsSlider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      if ($('rangeValue')) $('rangeValue').textContent = e.target.value;
    });
  }

  $('outreachTemplate')?.addEventListener('input', (e) => {
    state.outreachTemplate = e.target.value;
    localStorage.setItem(`outreach_template_${state.activeNiche}`, state.outreachTemplate);
  });

  $('outreachFollowupTemplate')?.addEventListener('input', (e) => {
    state.outreachFollowupTemplate = e.target.value;
    localStorage.setItem(`outreach_followup_template_${state.activeNiche}`, state.outreachFollowupTemplate);
  });

  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const header = $('header');
    if (!header) return;

    if (currentScrollY > 40 && currentScrollY > lastScrollY) {
      header.classList.add('header-hidden');
    } else {
      header.classList.remove('header-hidden');
    }
    lastScrollY = currentScrollY;
  });

  const restored = restoreActiveSession();
  fetchScrapedLeadsFromDB();
  fetchFollowUpsFromDB();

  // If restored, show results view, otherwise launcher
  if (restored) {
    setView('grid');
  } else {
    setView('empty');
  }
});
