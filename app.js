/* ============================================================
   LeadMapper — Main Application Logic
   Uses Apify Google Maps Scraper (compass/crawler-google-places)
   ============================================================ */

'use strict';

// ─── State ──────────────────────────────────────────────────
const state = {
  leads: [],
  filteredLeads: [],
  currentView: 'grid',
  minRating: 0,
  isLoading: false,
  outreachTemplate: '',
  removeDuplicates: true,
  contactedPhones: new Set(),
  currentOutreachLead: null,
  supabaseUrl: '',
  supabaseKey: '',
};

const ACTOR_ID = 'compass~crawler-google-places';
const POLL_INTERVAL_MS = 4000;
const MAX_POLL_RETRIES = 90; // ~6 minutes

// ─── DOM References ──────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initRangeSlider();
  initStarRating();
  initApiKeyToggle();
  initSidebarToggle();

  // Restore saved API key
  const saved = localStorage.getItem('apify_api_key');
  if (saved) $('apifyApiKey').value = saved;

  // Restore sidebar state
  if (localStorage.getItem('sidebar_collapsed') === 'true') {
    document.body.classList.add('sidebar-collapsed');
  }

  // Restore Template and Deduplication state
  const savedTemplate = localStorage.getItem('outreach_template');
  if (savedTemplate) {
    $('outreachTemplate').value = savedTemplate;
    state.outreachTemplate = savedTemplate;
  }
  
  const savedDedup = localStorage.getItem('remove_duplicates');
  if (savedDedup !== null) {
    const isDedup = savedDedup === 'true';
    $('removeDuplicatesToggle').checked = isDedup;
    state.removeDuplicates = isDedup;
  }
  
  // Setup outreach listeners
  $('outreachTemplate').addEventListener('input', (e) => {
    state.outreachTemplate = e.target.value;
    localStorage.setItem('outreach_template', state.outreachTemplate);
  });

  $('removeDuplicatesToggle').addEventListener('change', (e) => {
    state.removeDuplicates = e.target.checked;
    localStorage.setItem('remove_duplicates', state.removeDuplicates);
    if(state.leads.length > 0) filterLeads(); // re-filter if leads exist
  });

  // Restore Contacted history
  const savedContacted = localStorage.getItem('contacted_phones');
  if (savedContacted) {
    try {
      state.contactedPhones = new Set(JSON.parse(savedContacted));
    } catch(e) {}
  }

  // Supabase Restores & Listeners
  const savedSbUrl = localStorage.getItem('supabase_url');
  const savedSbKey = localStorage.getItem('supabase_key');
  if (savedSbUrl) {
    $('supabaseUrl').value = savedSbUrl;
    state.supabaseUrl = savedSbUrl;
  }
  if (savedSbKey) {
    $('supabaseKey').value = savedSbKey;
    state.supabaseKey = savedSbKey;
  }

  $('supabaseUrl').addEventListener('input', (e) => {
    state.supabaseUrl = e.target.value.trim();
    localStorage.setItem('supabase_url', state.supabaseUrl);
    fetchContactedFromDB(); // Attempt sync when updated
    fetchSearchHistoryFromDB();
  });
  $('supabaseKey').addEventListener('input', (e) => {
    state.supabaseKey = e.target.value.trim();
    localStorage.setItem('supabase_key', state.supabaseKey);
    fetchContactedFromDB(); // Attempt sync when updated
    fetchSearchHistoryFromDB();
  });
  
  // Toggle DB key visibility
  $('toggleDbKey').addEventListener('click', () => {
    const input = $('supabaseKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Initial sync attempt
  if (state.supabaseUrl && state.supabaseKey) {
    fetchContactedFromDB();
    fetchSearchHistoryFromDB();
  }
});

// ─── Range Slider ────────────────────────────────────────────
function initRangeSlider() {
  const slider = $('maxResultsSlider');
  const valueLabel = $('rangeValue');

  const updateSlider = () => {
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    const val = parseInt(slider.value);
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--range-pct', `${pct}%`);
    valueLabel.textContent = val;
  };

  slider.addEventListener('input', updateSlider);
  updateSlider();
}

// ─── Star Rating Buttons ─────────────────────────────────────
function initStarRating() {
  const btns = document.querySelectorAll('.star-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.minRating = parseFloat(btn.dataset.value);
    });
  });
}

// ─── API Key Toggle ───────────────────────────────────────────
function initApiKeyToggle() {
  const btn = $('toggleApiKey');
  const input = $('apifyApiKey');
  btn.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.innerHTML = isPassword
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>`;
  });
}

// ─── Sidebar Toggle ───────────────────────────────────────────
function initSidebarToggle() {
  const btn = $('sidebarToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');
    localStorage.setItem('sidebar_collapsed', isCollapsed);
  });
}

// ─── Main: Generate Leads ────────────────────────────────────
async function generateLeads() {
  const apiKey = $('apifyApiKey').value.trim();
  const searchQuery = $('searchQuery').value.trim();
  const locationQuery = $('locationQuery').value.trim();
  const maxResults = parseInt($('maxResultsSlider').value);
  const language = $('languageSelect').value;

  // Validation
  if (!apiKey) return showToast('⚠️ Please enter your Apify API key', 'warning');
  if (!searchQuery) return showToast('⚠️ Please enter a search query', 'warning');
  if (!locationQuery) return showToast('⚠️ Please enter a location', 'warning');

  // Save key locally
  localStorage.setItem('apify_api_key', apiKey);

  // Update UI to loading
  state.isLoading = true;
  showState('loading');
  setBtnLoading(true);

  const searchString = `${searchQuery} in ${locationQuery}`;

  try {
    // Step 1: Start the Apify actor run
    activateStep(1);
    setProgress(10);

    const runId = await startApifyRun(apiKey, {
      searchStringsArray: [searchString],
      locationQuery: locationQuery,
      maxCrawledPlacesPerSearch: maxResults,
      language: language,
      includeWebResults: false,
    });

    // Step 2: Poll for completion
    activateStep(2);
    setProgress(25);

    const datasetId = await pollForCompletion(apiKey, runId);

    // Step 3: Fetch results
    activateStep(3);
    setProgress(75);

    const rawLeads = await fetchDataset(apiKey, datasetId);

    // Step 4: Process
    activateStep(4);
    setProgress(90);

    await sleep(600);

    const processed = processLeads(rawLeads);

    // Filter by min rating
    state.leads = processed;
    state.filteredLeads = applyRatingFilter(processed);

    setProgress(100);
    await sleep(400);

    // Show results
    renderGridView();
    renderTableView();
    updateResultsMeta(searchQuery, locationQuery, state.filteredLeads.length);
    $('totalCountText').textContent = `${state.filteredLeads.length} leads found`;

    showState('results');
    setBtnLoading(false);
    state.isLoading = false;

    showToast(`✅ Found ${state.filteredLeads.length} leads!`);

    // Save to search history if Supabase is connected
    if (state.supabaseUrl && state.supabaseKey) {
      saveSearchToDB(searchQuery, locationQuery);
    }

  } catch (err) {
    console.error(err);
    setBtnLoading(false);
    state.isLoading = false;
    showError(err.message || 'An unexpected error occurred. Please check your API key and try again.');
  }
}

// ─── Apify API Calls ─────────────────────────────────────────
async function startApifyRun(apiKey, input) {
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${apiKey}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    if (resp.status === 401) throw new Error('Invalid Apify API key. Please check and try again.');
    if (resp.status === 402) throw new Error('Apify account has insufficient credits. Please top up.');
    throw new Error(errBody?.error?.message || `Apify API error (${resp.status})`);
  }

  const data = await resp.json();
  return data.data.id;
}

async function pollForCompletion(apiKey, runId) {
  const url = `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`;
  let retries = 0;

  while (retries < MAX_POLL_RETRIES) {
    await sleep(POLL_INTERVAL_MS);
    retries++;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to poll run status (${resp.status})`);

    const data = await resp.json();
    const status = data.data.status;

    // Update progress during polling
    const prog = 25 + Math.min(50, retries * 1.5);
    setProgress(prog);

    if (status === 'SUCCEEDED') {
      return data.data.defaultDatasetId;
    }
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${status.toLowerCase()}. Please try again with a smaller result count.`);
    }
    // RUNNING or READY – keep polling
  }

  throw new Error('Timed out waiting for Apify to finish. Try requesting fewer results.');
}

async function fetchDataset(apiKey, datasetId) {
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&format=json&clean=true`;
  const resp = await fetch(url);

  if (!resp.ok) throw new Error(`Failed to fetch dataset (${resp.status})`);

  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

// ─── Data Processing ─────────────────────────────────────────
function processLeads(raw) {
  return raw.map((item, idx) => ({
    num: idx + 1,
    name: item.title || item.displayName?.text || 'Unknown Business',
    category: item.categoryName || item.primaryTypeDisplayName?.text || item.types?.[0] || '—',
    rating: item.totalScore ?? item.rating ?? null,
    reviewsCount: item.reviewsCount ?? item.userRatingCount ?? 0,
    phone: item.phone || item.internationalPhoneNumber || null,
    website: cleanUrl(item.website || item.websiteUri || null),
    address: item.address || item.formattedAddress || item.vicinity || '—',
    googleMapsUrl: item.url || item.googleMapsUrl || null,
    lat: item.location?.lat ?? item.latitude ?? null,
    lng: item.location?.lng ?? item.longitude ?? null,
  }));
}

function cleanUrl(url) {
  if (!url) return null;
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function applyRatingFilter(leads) {
  if (!state.minRating) return leads;
  return leads.filter(l => l.rating !== null && l.rating >= state.minRating);
}

// ─── Rendering ────────────────────────────────────────────────
function renderGridView() {
  const grid = $('leadsGrid');
  grid.innerHTML = '';

  state.filteredLeads.forEach((lead, i) => {
    const card = createLeadCard(lead, i);
    card.style.animationDelay = `${Math.min(i * 40, 600)}ms`;
    grid.appendChild(card);
  });
}

function createLeadCard(lead, idx) {
  const card = document.createElement('div');
  card.className = 'lead-card';

  const ratingHtml = lead.rating !== null
    ? `<div class="card-rating">
        ${buildStars(lead.rating)}
        <span class="rating-label">${lead.rating.toFixed(1)}</span>
        <span class="reviews-count">(${lead.reviewsCount.toLocaleString()} reviews)</span>
      </div>`
    : `<div class="card-rating"><span style="color:var(--text-muted);font-size:0.78rem">No rating</span></div>`;

  const phoneHtml = lead.phone
    ? `<div class="card-detail-row">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.42C1.38 2.18 2.22 1 3.46 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        ${lead.phone}
      </div>`
    : '';

  const isContacted = lead.phone && state.contactedPhones.has(lead.phone);

  const waBtn = lead.phone 
    ? (isContacted 
      ? `<button class="card-action-btn contacted-btn" onclick="openWhatsApp('${lead.phone}', ${idx})">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg> Contacted
        </button>`
      : `<button class="card-action-btn whatsapp-btn" onclick="openWhatsApp('${lead.phone}', ${idx})">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
          </svg> WhatsApp
        </button>`)
    : '';

  const websiteHtml = lead.website
    ? `<div class="card-detail-row">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <a href="https://${lead.website}" target="_blank" rel="noopener" title="${lead.website}">${truncate(lead.website, 30)}</a>
      </div>`
    : '';

  const addressHtml = lead.address && lead.address !== '—'
    ? `<div class="card-detail-row">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        ${truncate(lead.address, 45)}
      </div>`
    : '';

  const mapsBtn = lead.googleMapsUrl
    ? `<button class="card-action-btn" onclick="openUrl('${lead.googleMapsUrl}')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg> Maps
      </button>`
    : '';

  const callBtn = lead.phone
    ? `<button class="card-action-btn phone-btn" onclick="copyText('${lead.phone}', 'Phone copied!')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.42C1.38 2.18 2.22 1 3.46 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg> Copy #
      </button>`
    : '';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-name">${escapeHtml(lead.name)}</span>
      <span class="card-num">#${lead.num}</span>
    </div>
    ${lead.category !== '—' ? `<span class="card-category">${escapeHtml(lead.category)}</span>` : ''}
    ${ratingHtml}
    <div class="card-details">
      ${phoneHtml}
      ${websiteHtml}
      ${addressHtml}
    </div>
    ${(mapsBtn || callBtn || waBtn) ? `<div class="card-actions">${waBtn}${callBtn}${mapsBtn}</div>` : ''}
  `;

  return card;
}

function renderTableView() {
  const tbody = $('leadsTableBody');
  tbody.innerHTML = '';

  state.filteredLeads.forEach(lead => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-num">${lead.num}</td>
      <td class="td-name">${escapeHtml(lead.name)}</td>
      <td>${escapeHtml(lead.category)}</td>
      <td class="td-rating">${lead.rating !== null ? lead.rating.toFixed(1) + ' ★' : '—'}</td>
      <td>${lead.reviewsCount ? lead.reviewsCount.toLocaleString() : '—'}</td>
      <td>${lead.phone ? escapeHtml(lead.phone) : '—'}</td>
      <td class="td-link">${lead.website ? `<a href="https://${lead.website}" target="_blank" rel="noopener">${truncate(lead.website, 25)}</a>` : '—'}</td>
      <td title="${escapeHtml(lead.address)}">${truncate(escapeHtml(lead.address), 40)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function buildStars(rating) {
  const full = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.3;
  const empty = 5 - full - (hasHalf ? 1 : 0);
  let html = '<div class="stars-visual">';
  for (let i = 0; i < full; i++) html += '<span class="star filled">★</span>';
  if (hasHalf) html += '<span class="star half">★</span>';
  for (let i = 0; i < empty; i++) html += '<span class="star empty">★</span>';
  html += '</div>';
  return html;
}

// ─── View Toggle ─────────────────────────────────────────────
function setView(view) {
  state.currentView = view;
  const grid = $('leadsGrid');
  const table = $('tableWrapper');
  const gridBtn = $('viewGrid');
  const tableBtn = $('viewTable');

  if (view === 'grid') {
    grid.classList.remove('hidden');
    table.classList.add('hidden');
    gridBtn.classList.add('active');
    tableBtn.classList.remove('active');
  } else {
    grid.classList.add('hidden');
    table.classList.remove('hidden');
    tableBtn.classList.add('active');
    gridBtn.classList.remove('active');
  }
}

// ─── Filter ───────────────────────────────────────────────────
function filterLeads() {
  const query = $('filterInput').value.toLowerCase();
  
  let processedList = state.leads;

  // Deduplication Logic
  if (state.removeDuplicates) {
    const uniqueMap = new Map();
    processedList.forEach(lead => {
      if (!lead.phone) {
        // If no phone, treat it as unique or depending on strategy, we keep it. We'll keep it using its internal ID (num).
        uniqueMap.set(`nophone_${lead.num}`, lead);
      } else {
        const existing = uniqueMap.get(lead.phone);
        if (!existing) {
          uniqueMap.set(lead.phone, lead);
        } else {
          // Both have same phone. Keep the one with more reviews/better score
          const existingScore = (existing.reviewsCount || 0) * (existing.rating || 1);
          const currentScore = (lead.reviewsCount || 0) * (lead.rating || 1);
          if (currentScore > existingScore) {
             uniqueMap.set(lead.phone, lead);
          }
        }
      }
    });
    processedList = Array.from(uniqueMap.values());
  }


  state.filteredLeads = processedList
    .filter(l => state.minRating === 0 || (l.rating !== null && l.rating >= state.minRating))
    .filter(l => {
      if (!query) return true;
      return (
        l.name.toLowerCase().includes(query) ||
        l.category.toLowerCase().includes(query) ||
        l.address.toLowerCase().includes(query) ||
        (l.phone && l.phone.includes(query))
      );
    });

  // Need to update the visual 'num' after filtering dynamically
  state.filteredLeads = state.filteredLeads.map((l, i) => ({ ...l, num: i + 1 }));

  renderGridView();
  renderTableView();
  $('totalCountText').textContent = `${state.filteredLeads.length} leads found`;
}

// ─── Outreach Engine ──────────────────────────────────────────
function generateMessageTemplate(lead) {
  let template = state.outreachTemplate || 'Hi [Name], I noticed your business on Google Maps.';
  
  const safeStr = (val) => val ? String(val) : '';
  
  template = template.replace(/\[Name\]/ig, safeStr(lead.name));
  template = template.replace(/\[Category\]/ig, safeStr(lead.category));
  template = template.replace(/\[Reviews\]/ig, safeStr(lead.reviewsCount));
  
  const ratingStr = lead.rating !== null ? lead.rating.toFixed(1) : '';
  template = template.replace(/\[Stars\]/ig, ratingStr);

  return template;
}

function openWhatsApp(phone, leadIdx) {
  
  if (!state.outreachTemplate) {
    showToast('⚠️ Please write a WhatsApp Template first!', 'warning');
    // Briefly highlight the textarea
    const ta = $('outreachTemplate');
    if (!document.body.classList.contains('sidebar-collapsed')) {
       ta.focus();
       ta.style.borderColor = 'var(--accent-rose)';
       setTimeout(() => ta.style.borderColor = '', 1500);
    }
    return;
  }

  // Get the actual filtered lead
  const lead = state.filteredLeads[leadIdx];
  if (!lead) return; // defensive
  
  state.currentOutreachLead = lead;

  // Format phone number (remove non-digits, keep leading + if exists)
  let cleanPhone = phone.replace(/[^\d+]/g, '');
  
  // Basic sanitization
  if (!cleanPhone.startsWith('+')) cleanPhone = cleanPhone.replace(/^0+/, ''); 

  // Pre-fill modal
  $('modalPhone').value = cleanPhone;
  $('modalMessage').value = generateMessageTemplate(lead);
  
  $('outreachModal').classList.remove('hidden');
}

function closeOutreachModal() {
  $('outreachModal').classList.add('hidden');
  state.currentOutreachLead = null;
}

function confirmSendMessage() {
  if (!state.currentOutreachLead) return;

  const finalPhone = $('modalPhone').value.trim().replace(/[^\d+]/g, '');
  const finalMessage = $('modalMessage').value;

  // Mark as contacted locally immediately for snappy UI
  if (state.currentOutreachLead.phone) {
    const leadPhone = state.currentOutreachLead.phone;
    state.contactedPhones.add(leadPhone);
    localStorage.setItem('contacted_phones', JSON.stringify([...state.contactedPhones]));
    
    // Also save to Supabase if configured
    if (state.supabaseUrl && state.supabaseKey) {
      markContactedInDB(state.currentOutreachLead);
    }
    
    renderGridView();
    renderTableView();
  }

  closeOutreachModal();

  const encodedMsg = encodeURIComponent(finalMessage);
  openUrl(`https://wa.me/${finalPhone}?text=${encodedMsg}`);
}

// ─── Cloud Database (Supabase) ────────────────────────────────
async function fetchContactedFromDB() {
  if (!state.supabaseUrl || !state.supabaseKey) return;
  
  try {
    const res = await fetch(`${state.supabaseUrl}/rest/v1/contacted_leads?select=phone`, {
      method: 'GET',
      headers: {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      data.forEach(row => {
        if (row.phone) state.contactedPhones.add(row.phone);
      });
      // Save merged remote state down to local storage
      localStorage.setItem('contacted_phones', JSON.stringify([...state.contactedPhones]));
      
      // Update UI if we are on the results screen
      if (state.filteredLeads.length) {
        renderGridView();
        renderTableView();
      }
    }
  } catch (err) {
    console.warn('Supabase sync failed (fetch):', err);
  }
}

async function markContactedInDB(lead) {
  if (!state.supabaseUrl || !state.supabaseKey) return;

  try {
    await fetch(`${state.supabaseUrl}/rest/v1/contacted_leads`, {
      method: 'POST',
      headers: {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates' // Prevents error if phone already exists (needs unique constraint on DB)
      },
      body: JSON.stringify({ 
        phone: lead.phone,
        name: lead.name,
        contacted_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.warn('Supabase sync failed (post):', err);
  }
}

async function fetchSearchHistoryFromDB() {
  if (!state.supabaseUrl || !state.supabaseKey) return;
  
  try {
    const res = await fetch(`${state.supabaseUrl}/rest/v1/search_history?select=*&order=created_at.desc&limit=5`, {
      method: 'GET',
      headers: {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      renderSearchHistory(data);
    }
  } catch (err) {
    console.warn('Supabase search history fetch failed:', err);
  }
}

async function saveSearchToDB(query, location) {
  if (!state.supabaseUrl || !state.supabaseKey) return;

  try {
    await fetch(`${state.supabaseUrl}/rest/v1/search_history`, {
      method: 'POST',
      headers: {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        search_query: query,
        location_query: location
      })
    });
    // refresh history list after saving
    fetchSearchHistoryFromDB();
  } catch (err) {
    console.warn('Supabase search history save failed:', err);
  }
}

function renderSearchHistory(historyItems) {
  const container = $('recentSearchesSection');
  const list = $('recentSearchesList');
  
  if (!historyItems || historyItems.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  list.innerHTML = '';
  container.classList.remove('hidden');

  historyItems.forEach(item => {
    const pill = document.createElement('div');
    pill.className = 'search-pill';
    
    // Calculate relative time or simple date formatting
    const date = new Date(item.created_at);
    const dateStr = date.toLocaleDateString();

    pill.innerHTML = `
      <div class="search-pill-query">${escapeHtml(item.search_query)}</div>
      <div class="search-pill-meta">
        <span class="location-text">
          <svg width="10" height="10" style="margin-right:2px; vertical-align:middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          ${escapeHtml(item.location_query)}
        </span>
        <span class="time-text">${dateStr}</span>
      </div>
    `;

    // Click to replay search
    pill.addEventListener('click', () => {
      $('searchQuery').value = item.search_query;
      $('locationQuery').value = item.location_query;
      // highlight them briefly
      $('searchQuery').style.borderColor = 'var(--accent-secondary)';
      $('locationQuery').style.borderColor = 'var(--accent-secondary)';
      setTimeout(() => {
        $('searchQuery').style.borderColor = '';
        $('locationQuery').style.borderColor = '';
      }, 800);
    });

    list.appendChild(pill);
  });
}

// ─── Export to CSV ────────────────────────────────────────────
function exportCSV() {
  if (!state.filteredLeads.length) return showToast('No leads to export');

  const headers = ['#', 'Name', 'Category', 'Rating', 'Reviews', 'Phone', 'Website', 'Address', 'Google Maps URL'];
  const rows = state.filteredLeads.map(l => [
    l.num,
    csvEscape(l.name),
    csvEscape(l.category),
    l.rating !== null ? l.rating.toFixed(1) : '',
    l.reviewsCount ?? '',
    csvEscape(l.phone ?? ''),
    csvEscape(l.website ? `https://${l.website}` : ''),
    csvEscape(l.address),
    csvEscape(l.googleMapsUrl ?? ''),
  ]);

  const csvStr = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const qry = $('searchQuery').value.replace(/\s+/g, '_');
  const loc = $('locationQuery').value.replace(/\s+/g, '_');
  a.download = `leads_${qry}_${loc}_${datestamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('📥 CSV exported successfully!');
}

// ─── UI State Helpers ─────────────────────────────────────────
function showState(which) {
  ['emptyState', 'loadingState', 'resultsArea', 'errorState'].forEach(id => {
    $(id).classList.add('hidden');
  });
  const map = { empty: 'emptyState', loading: 'loadingState', results: 'resultsArea', error: 'errorState' };
  $(map[which]).classList.remove('hidden');
}

function setBtnLoading(loading) {
  const btn = $('generateBtn');
  btn.disabled = loading;
  $('btnContent').classList.toggle('hidden', loading);
  $('btnLoader').classList.toggle('hidden', !loading);
}

function setProgress(pct) {
  $('progressBar').style.width = `${pct}%`;
}

function activateStep(num) {
  for (let i = 1; i <= 4; i++) {
    const el = $(`step${i}`);
    if (i < num) {
      el.classList.remove('active');
      el.classList.add('done');
    } else if (i === num) {
      el.classList.add('active');
      el.classList.remove('done');
    } else {
      el.classList.remove('active', 'done');
    }
  }
}

function updateResultsMeta(query, location, count) {
  $('resultsTitle').textContent = `${count} Leads Found`;
  $('resultsSubtitle').textContent = `"${query}" in ${location}`;
}

function showError(msg) {
  $('errorMessage').textContent = msg;
  showState('error');
}

function resetToEmpty() {
  state.leads = [];
  state.filteredLeads = [];
  $('filterInput').value = '';
  $('totalCountText').textContent = '0 leads found';
  showState('empty');
}

// ─── Toast ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const toast = $('toast');
  $('toastMessage').textContent = msg;
  toast.classList.remove('hidden', 'show');
  void toast.offsetWidth; // reflow
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Utility ──────────────────────────────────────────────────
function copyText(text, successMsg = 'Copied!') {
  navigator.clipboard.writeText(text).then(() => showToast(successMsg));
}

function openUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function escapeHtml(str) {
  if (!str || str === '—') return str || '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function csvEscape(val) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function datestamp() {
  return new Date().toISOString().slice(0, 10);
}
