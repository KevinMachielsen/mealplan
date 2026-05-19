// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
}

function formatDateShort(date) {
  return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function isToday(date) {
  const today = new Date();
  const d = new Date(date);
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(mins) {
  if (!mins) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} u ${m} min` : `${h} u`;
}

function imgEl(recipe, cls = '') {
  if (recipe.image) {
    return `<img src="${escapeHtml(recipe.image)}" class="${cls}" alt="${escapeHtml(recipe.name)}" loading="lazy" onerror="this.parentNode.innerHTML=this.parentNode.dataset.placeholder">`;
  }
  return '';
}

function recipeEmoji(recipe) {
  const tags = (recipe.tags || []).join(' ').toLowerCase() + (recipe.name || '').toLowerCase();
  if (tags.includes('soep') || tags.includes('soup')) return '🍲';
  if (tags.includes('pasta') || tags.includes('spaghetti')) return '🍝';
  if (tags.includes('salade') || tags.includes('salad')) return '🥗';
  if (tags.includes('pizza')) return '🍕';
  if (tags.includes('vis') || tags.includes('fish') || tags.includes('zalm')) return '🐟';
  if (tags.includes('kip') || tags.includes('chicken')) return '🍗';
  if (tags.includes('vlees') || tags.includes('beef') || tags.includes('rund')) return '🥩';
  if (tags.includes('taart') || tags.includes('cake') || tags.includes('dessert')) return '🍰';
  if (tags.includes('ontbijt') || tags.includes('breakfast')) return '🥞';
  return '🍽️';
}

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  view: 'recipes',
  viewStack: [],
  recipes: [],
  pantry: [],
  settings: {},
  weekStart: getMonday(new Date()),
  mealplan: null,
  searchQuery: '',
  filterTag: '',
  selectionMode: false,
  selectedIds: new Set(),
  pantryVisible: false,
  shoppingChecked: new Set(),
  shoppingItems: [],
  toastTimer: null
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = '', duration = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type;
  el.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
const Modal = {
  open(title, bodyHtml, opts = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.remove('hidden');
    if (opts.onOpen) opts.onOpen();
  },
  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
};

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(view, params = {}) {
  if (view !== state.view) state.viewStack.push(state.view);
  state.view = view;
  state.viewParams = params;
  render();
}

function goBack() {
  const prev = state.viewStack.pop();
  if (prev) {
    state.view = prev;
    state.viewParams = {};
    render();
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  const views = { recipes: renderRecipes, weekmenu: renderWeekMenu, shopping: renderShopping, pantry: renderPantry, settings: renderSettings };

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });

  const mainViews = ['recipes', 'weekmenu', 'shopping', 'pantry', 'settings'];
  const isMainView = mainViews.includes(state.view);
  document.getElementById('back-btn').classList.toggle('hidden', isMainView || state.viewStack.length === 0);

  const fab = document.getElementById('fab');
  if (fab) fab.remove();

  const fn = views[state.view];
  if (fn) fn();
  else if (state.view === 'recipe-detail') renderRecipeDetail(state.viewParams.id);
  else if (state.view === 'recipe-form') renderRecipeForm(state.viewParams);
}

// ─── Recipes View ─────────────────────────────────────────────────────────────
function renderRecipes() {
  document.getElementById('page-title').textContent = 'Recepten';
  document.getElementById('header-actions').innerHTML = `
    <button class="icon-btn" id="toggle-pantry-filter" title="Filter op voorraad">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
    </button>`;

  const allTags = [...new Set(state.recipes.flatMap(r => r.tags || []))].slice(0, 12);
  const filtered = getFilteredRecipes();

  const tagsHtml = allTags.length ? `
    <div class="chips" style="padding:8px 12px;gap:6px;overflow-x:auto;flex-wrap:nowrap;white-space:nowrap;scrollbar-width:none;">
      <button class="chip ${!state.filterTag ? 'active' : ''}" data-tag="">Alle</button>
      ${allTags.map(t => `<button class="chip ${state.filterTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
    </div>` : '';

  const recipesHtml = filtered.length
    ? `<div class="recipe-grid">${filtered.map(r => renderRecipeCard(r)).join('')}</div>`
    : `<div class="empty-state">
        <div class="empty-state-icon">📖</div>
        <h3>${state.searchQuery || state.filterTag ? 'Geen recepten gevonden' : 'Nog geen recepten'}</h3>
        <p>${state.searchQuery || state.filterTag ? 'Probeer andere zoektermen of filters' : 'Voeg je eerste recept toe via de + knop'}</p>
       </div>`;

  document.getElementById('main-content').innerHTML = `
    <div class="search-bar">
      <div class="search-input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" class="search-input" id="search-input" placeholder="Zoek recepten..." value="${escapeHtml(state.searchQuery)}">
      </div>
    </div>
    ${tagsHtml}
    ${state.pantryVisible ? `<div style="padding:4px 12px;"><span style="font-size:12px;background:#E8F5E9;color:#2E7D32;padding:3px 10px;border-radius:20px;font-weight:600;">🥕 Filter: in voorraad</span></div>` : ''}
    ${recipesHtml}`;

  // FAB
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.id = 'fab';
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  fab.addEventListener('click', () => openAddRecipeModal());
  document.getElementById('app').appendChild(fab);

  // Selection toolbar
  if (state.selectionMode && state.selectedIds.size > 0) {
    renderSelectionToolbar();
  }

  // Events
  document.getElementById('search-input').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderRecipes();
  });

  document.getElementById('toggle-pantry-filter')?.addEventListener('click', () => {
    state.pantryVisible = !state.pantryVisible;
    renderRecipes();
  });

  document.querySelectorAll('.chip[data-tag]').forEach(chip => {
    chip.addEventListener('click', () => {
      state.filterTag = chip.dataset.tag;
      renderRecipes();
    });
  });

  document.querySelectorAll('.recipe-card').forEach(card => {
    card.addEventListener('click', e => {
      if (state.selectionMode) {
        toggleRecipeSelection(parseInt(card.dataset.id));
      } else {
        navigate('recipe-detail', { id: parseInt(card.dataset.id) });
      }
    });
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (!state.selectionMode) {
        state.selectionMode = true;
        state.selectedIds.add(parseInt(card.dataset.id));
        renderRecipes();
      }
    });
  });
}

function getFilteredRecipes() {
  let list = state.recipes;
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (state.filterTag) {
    list = list.filter(r => (r.tags || []).includes(state.filterTag));
  }
  if (state.pantryVisible) {
    list = list.filter(r => calculateCoverage(r, state.pantry) >= 50);
  }
  return list;
}

function renderRecipeCard(recipe) {
  const coverage = state.pantry.length ? calculateCoverage(recipe, state.pantry) : null;
  const isSelected = state.selectedIds.has(recipe.id);
  const emoji = recipeEmoji(recipe);
  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  const imgHtml = recipe.image
    ? `<img src="${escapeHtml(recipe.image)}" class="recipe-card-img" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const placeholder = `<div class="recipe-card-img-placeholder" style="${recipe.image ? 'display:none' : ''}">${emoji}</div>`;

  const coverBadge = coverage !== null
    ? `<span class="coverage-badge ${coverage >= 80 ? 'high' : coverage >= 40 ? 'medium' : ''}">${coverage}%</span>` : '';

  const selectBadge = state.selectionMode
    ? `<div class="recipe-card-select ${isSelected ? 'checked' : ''}">
        ${isSelected ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
       </div>` : '';

  return `
    <div class="recipe-card" data-id="${recipe.id}">
      ${imgHtml}${placeholder}
      ${coverBadge}${selectBadge}
      <div class="recipe-card-body">
        <div class="recipe-card-name">${escapeHtml(recipe.name)}</div>
        <div class="recipe-card-meta">
          ${recipe.servings ? `<span>👤 ${recipe.servings}</span>` : ''}
          ${totalTime ? `<span>⏱ ${formatDuration(totalTime)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function toggleRecipeSelection(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  if (state.selectedIds.size === 0) state.selectionMode = false;
  renderRecipes();
}

function renderSelectionToolbar() {
  const existing = document.getElementById('select-toolbar');
  if (existing) existing.remove();

  const toolbar = document.createElement('div');
  toolbar.className = 'select-toolbar';
  toolbar.id = 'select-toolbar';
  toolbar.innerHTML = `
    <span>${state.selectedIds.size} geselecteerd</span>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm" id="distribute-btn">📅 Verdeel over week</button>
      <button class="btn btn-sm" id="cancel-select-btn">Annuleer</button>
    </div>`;
  document.getElementById('app').appendChild(toolbar);

  document.getElementById('cancel-select-btn').addEventListener('click', () => {
    state.selectionMode = false;
    state.selectedIds.clear();
    renderRecipes();
  });

  document.getElementById('distribute-btn').addEventListener('click', distributeSelectedOverWeek);
}

async function distributeSelectedOverWeek() {
  const ids = [...state.selectedIds];
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const plan = state.mealplan || await DB.getMealPlan(weekKey(state.weekStart));

  ids.forEach((id, i) => {
    const day = days[i % 7];
    if (!plan.days[day].includes(id)) plan.days[day].push(id);
  });

  state.mealplan = plan;
  await DB.saveMealPlan(plan);

  state.selectionMode = false;
  state.selectedIds.clear();
  showToast(`${ids.length} recepten verdeeld over het weekmenu`, 'success');
  renderRecipes();
}

// ─── Recipe Detail View ───────────────────────────────────────────────────────
async function renderRecipeDetail(id) {
  document.getElementById('page-title').textContent = '';
  document.getElementById('header-actions').innerHTML = `
    <button class="icon-btn" id="edit-recipe-btn" title="Bewerken">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    </button>
    <button class="icon-btn danger" id="delete-recipe-btn" title="Verwijderen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
    </button>`;

  const recipe = await DB.getRecipe(id);
  if (!recipe) { goBack(); return; }

  document.getElementById('page-title').textContent = recipe.name;

  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
  const emoji = recipeEmoji(recipe);

  const imgHtml = recipe.image
    ? `<img src="${escapeHtml(recipe.image)}" class="recipe-hero" alt="${escapeHtml(recipe.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const placeholderHtml = `<div class="recipe-hero-placeholder" style="${recipe.image ? 'display:none' : ''}">${emoji}</div>`;

  const metaItems = [
    recipe.servings ? `<div class="recipe-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> ${recipe.servings} personen</div>` : '',
    recipe.prepTime ? `<div class="recipe-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Prep: ${formatDuration(recipe.prepTime)}</div>` : '',
    recipe.cookTime ? `<div class="recipe-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M12 2v4M16 2v4M2 10h20M4 10v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10"/></svg> Koken: ${formatDuration(recipe.cookTime)}</div>` : ''
  ].filter(Boolean).join('');

  const tagsHtml = (recipe.tags || []).length
    ? `<div class="chips" style="margin-top:8px">${recipe.tags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>` : '';

  const sourceHtml = recipe.source
    ? `<a href="${escapeHtml(recipe.source)}" target="_blank" rel="noopener" class="recipe-source-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
        Bekijk origineel recept
       </a>` : '';

  const ingredientsHtml = (recipe.ingredients || []).map(ing => {
    const parsed = typeof ing === 'string' ? parseIngredientText(ing) : ing;
    const inPantry = state.pantry.some(p =>
      normalizeIngredientName(p.name).includes(normalizeIngredientName(parsed.name || '')) ||
      normalizeIngredientName(parsed.name || '').includes(normalizeIngredientName(p.name))
    );
    return `<li class="ingredient-item">
      <span class="ingredient-amount">${escapeHtml(parsed.amount ? formatAmount(parsed.amount, parsed.unit) : (parsed.unit || ''))}</span>
      <span style="flex:1">${escapeHtml(parsed.name || parsed.raw || (typeof ing === 'string' ? ing : ''))}</span>
      ${inPantry ? '<span class="in-pantry-badge">✓ in huis</span>' : ''}
    </li>`;
  }).join('');

  const instructionsHtml = (recipe.instructions || []).map((step, i) => {
    const isBold = step.startsWith('**') && step.endsWith('**');
    if (isBold) return `<li style="font-weight:700;padding:12px 0;border-bottom:1px solid var(--border);font-size:15px">${escapeHtml(step.slice(2, -2))}</li>`;
    return `<li class="instruction-item">
      <div class="instruction-num">${i + 1}</div>
      <p class="instruction-text">${escapeHtml(step)}</p>
    </li>`;
  }).join('');

  document.getElementById('main-content').innerHTML = `
    ${imgHtml}${placeholderHtml}
    <div class="recipe-detail-content">
      ${recipe.description ? `<p style="color:var(--text-secondary);font-size:15px;margin-top:16px;line-height:1.6">${escapeHtml(recipe.description)}</p>` : ''}
      <div class="recipe-meta-row" style="margin-top:12px">${metaItems}</div>
      ${sourceHtml}${tagsHtml}

      ${recipe.ingredients?.length ? `
      <div class="recipe-section">
        <div class="recipe-section-title">Ingrediënten</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:13px;color:var(--text-secondary)">Porties aanpassen:</span>
          <div class="servings-control">
            <button class="servings-btn" id="serv-minus">−</button>
            <span class="servings-num" id="serv-count">${recipe.servings || 4}</span>
            <button class="servings-btn" id="serv-plus">+</button>
          </div>
        </div>
        <ul class="ingredient-list" id="ingredient-list">${ingredientsHtml}</ul>
      </div>` : ''}

      ${recipe.instructions?.length ? `
      <div class="recipe-section">
        <div class="recipe-section-title">Bereidingswijze</div>
        <ol class="instruction-list">${instructionsHtml}</ol>
      </div>` : ''}
    </div>

    <div class="recipe-actions">
      <button class="btn btn-primary" style="flex:1" id="add-to-day-btn">📅 Toevoegen aan dag</button>
      <button class="btn btn-secondary" id="add-to-shopping-btn">🛒 Naar boodschappenlijst</button>
    </div>`;

  // Servings scaler
  let currentServings = recipe.servings || 4;
  const originalIngredients = recipe.ingredients ? [...recipe.ingredients] : [];

  function updateServings(newServings) {
    if (newServings < 1) return;
    const ratio = newServings / (recipe.servings || 4);
    currentServings = newServings;
    document.getElementById('serv-count').textContent = newServings;

    const scaled = originalIngredients.map(ing => {
      const parsed = typeof ing === 'string' ? parseIngredientText(ing) : ing;
      if (parsed.amount) parsed.amount = parseFloat((parsed.amount * ratio).toFixed(2));
      return parsed;
    });

    document.getElementById('ingredient-list').innerHTML = scaled.map((parsed, i) => {
      const inPantry = state.pantry.some(p =>
        normalizeIngredientName(p.name).includes(normalizeIngredientName(parsed.name || '')) ||
        normalizeIngredientName(parsed.name || '').includes(normalizeIngredientName(p.name))
      );
      return `<li class="ingredient-item">
        <span class="ingredient-amount">${escapeHtml(parsed.amount ? formatAmount(parsed.amount, parsed.unit) : (parsed.unit || ''))}</span>
        <span style="flex:1">${escapeHtml(parsed.name || parsed.raw || '')}</span>
        ${inPantry ? '<span class="in-pantry-badge">✓ in huis</span>' : ''}
      </li>`;
    }).join('');
  }

  document.getElementById('serv-minus')?.addEventListener('click', () => updateServings(currentServings - 1));
  document.getElementById('serv-plus')?.addEventListener('click', () => updateServings(currentServings + 1));

  document.getElementById('add-to-day-btn').addEventListener('click', () => openAddToDayModal(recipe));
  document.getElementById('add-to-shopping-btn').addEventListener('click', async () => {
    await addRecipeToShopping(recipe);
    showToast('Ingrediënten toegevoegd aan boodschappenlijst', 'success');
  });

  document.getElementById('edit-recipe-btn').addEventListener('click', () =>
    navigate('recipe-form', { id: recipe.id })
  );

  document.getElementById('delete-recipe-btn').addEventListener('click', () => {
    Modal.open('Recept verwijderen', `
      <p>Weet je zeker dat je <strong>${escapeHtml(recipe.name)}</strong> wil verwijderen?</p>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn-secondary btn-full" id="cancel-del">Annuleer</button>
        <button class="btn btn-danger btn-full" id="confirm-del">Verwijderen</button>
      </div>`);
    document.getElementById('cancel-del').addEventListener('click', Modal.close);
    document.getElementById('confirm-del').addEventListener('click', async () => {
      await DB.deleteRecipe(id);
      state.recipes = state.recipes.filter(r => r.id !== id);
      Modal.close();
      goBack();
      showToast('Recept verwijderd');
    });
  });
}

function openAddToDayModal(recipe) {
  const days = [
    { key: 'mon', label: 'Maandag' }, { key: 'tue', label: 'Dinsdag' },
    { key: 'wed', label: 'Woensdag' }, { key: 'thu', label: 'Donderdag' },
    { key: 'fri', label: 'Vrijdag' }, { key: 'sat', label: 'Zaterdag' },
    { key: 'sun', label: 'Zondag' }
  ];

  Modal.open('Toevoegen aan dag', `
    <p style="color:var(--text-secondary);font-size:14px;margin-bottom:16px">Kies een dag voor <strong>${escapeHtml(recipe.name)}</strong></p>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${days.map(d => `<button class="btn btn-secondary" data-day="${d.key}">${d.label}</button>`).join('')}
    </div>`);

  document.querySelectorAll('[data-day]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const day = btn.dataset.day;
      const plan = state.mealplan || await DB.getMealPlan(weekKey(state.weekStart));
      if (!plan.days[day].includes(recipe.id)) plan.days[day].push(recipe.id);
      state.mealplan = plan;
      await DB.saveMealPlan(plan);
      Modal.close();
      showToast(`${recipe.name} toegevoegd aan ${btn.textContent}`, 'success');
    });
  });
}

async function addRecipeToShopping(recipe) {
  const key = `custom_shopping_${Date.now()}`;
  const existing = JSON.parse(localStorage.getItem('extra_shopping') || '[]');
  existing.push(...(recipe.ingredients || []));
  localStorage.setItem('extra_shopping', JSON.stringify(existing));
}

// ─── Recipe Form ──────────────────────────────────────────────────────────────
async function renderRecipeForm(params = {}) {
  const isEdit = !!params.id;
  let recipe = isEdit ? await DB.getRecipe(params.id) : null;

  if (isEdit && !recipe) { goBack(); return; }

  const defaultRecipe = recipe || {
    name: '', description: '', image: '', source: '',
    prepTime: '', cookTime: '', servings: 4,
    ingredients: [], instructions: [], tags: []
  };

  document.getElementById('page-title').textContent = isEdit ? 'Recept bewerken' : 'Nieuw recept';
  document.getElementById('header-actions').innerHTML = '';

  let currentIngredients = [...(defaultRecipe.ingredients || [])];
  let currentInstructions = [...(defaultRecipe.instructions || [])];
  let currentTags = [...(defaultRecipe.tags || [])];
  let currentImage = defaultRecipe.image || '';
  let scrapeStatus = '';

  function buildForm() {
    const imgHtml = currentImage
      ? `<div class="image-preview-wrap">
          <img src="${escapeHtml(currentImage)}" class="image-preview" alt="Preview">
          <button class="image-remove-btn" id="remove-img"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
         </div>`
      : `<div class="image-upload-area" id="upload-area">
          <div class="upload-icon">📷</div>
          <p>Tik om foto te uploaden</p>
          <input type="file" id="img-file" accept="image/*" style="display:none">
         </div>`;

    const ingredientsHtml = currentIngredients.map((ing, i) => {
      const parsed = typeof ing === 'string' ? parseIngredientText(ing) : ing;
      return `<div class="ingredient-editor-item" data-ing-idx="${i}">
        <input type="text" class="form-input amount-input" placeholder="Hoev." value="${escapeHtml(parsed.amount !== null && parsed.amount !== undefined ? String(parsed.amount) : '')}" data-field="amount">
        <input type="text" class="form-input unit-input" placeholder="Eenheid" value="${escapeHtml(parsed.unit || '')}" data-field="unit">
        <input type="text" class="form-input" placeholder="Ingrediënt" value="${escapeHtml(parsed.name || parsed.raw || (typeof ing === 'string' ? ing : ''))}" data-field="name" style="flex:1">
        <button class="icon-btn danger del-ing-btn" data-idx="${i}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
    }).join('');

    const instructionsHtml = currentInstructions.map((step, i) => `
      <div class="ingredient-editor-item" data-inst-idx="${i}">
        <span style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i + 1}</span>
        <textarea class="form-input" rows="2" style="flex:1;resize:vertical" data-field="step">${escapeHtml(step)}</textarea>
        <button class="icon-btn danger del-inst-btn" data-idx="${i}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');

    document.getElementById('main-content').innerHTML = `
      <div style="padding:12px 12px 120px">
        ${!isEdit ? `
        <div class="form-group">
          <label class="form-label">Importeer</label>
          <div class="tabs" style="margin-bottom:12px">
            <button class="tab active" id="tab-url">Van website</button>
            <button class="tab" id="tab-text">Tekst plakken</button>
          </div>

          <div id="import-url-panel">
            <div style="display:flex;gap:8px">
              <input type="url" class="form-input" id="import-url" placeholder="https://..." style="flex:1">
              <button class="btn btn-outline" id="import-btn">Importeer</button>
            </div>
            <div id="scrape-status"></div>
          </div>

          <div id="import-text-panel" class="hidden">
            <textarea class="form-textarea" id="paste-text" rows="9"
              placeholder="Kopieer alle tekst van de receptenpagina (Ctrl+A, Ctrl+C) en plak die hier..."></textarea>
            <button class="btn btn-outline btn-full" id="parse-text-btn" style="margin-top:8px">Analyseer tekst</button>
            <div id="parse-status"></div>
          </div>
        </div>
        <div style="text-align:center;color:var(--text-secondary);font-size:13px;margin:-4px 0 12px">— of vul handmatig in —</div>` : ''}

        <div class="form-group">
          <label class="form-label">Foto</label>
          ${imgHtml}
        </div>

        <div class="form-group">
          <label class="form-label">Naam recept *</label>
          <input type="text" class="form-input" id="recipe-name" placeholder="Bijv. Pasta Bolognese" value="${escapeHtml(defaultRecipe.name)}">
        </div>

        <div class="form-group">
          <label class="form-label">Beschrijving</label>
          <textarea class="form-textarea" id="recipe-desc" placeholder="Korte omschrijving...">${escapeHtml(defaultRecipe.description || '')}</textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Voorbereidingstijd (min)</label>
            <input type="number" class="form-input" id="recipe-prep" placeholder="15" value="${defaultRecipe.prepTime || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Kooktijd (min)</label>
            <input type="number" class="form-input" id="recipe-cook" placeholder="30" value="${defaultRecipe.cookTime || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Porties</label>
            <input type="number" class="form-input" id="recipe-servings" placeholder="4" value="${defaultRecipe.servings || 4}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Tags (kommagescheiden)</label>
          <input type="text" class="form-input" id="recipe-tags" placeholder="pasta, Italiaans, snel" value="${escapeHtml(currentTags.join(', '))}">
        </div>

        <div class="form-group">
          <label class="form-label">Ingrediënten</label>
          <div id="ingredients-list">${ingredientsHtml}</div>
          <button class="btn btn-outline btn-sm" id="add-ing-btn" style="margin-top:8px">+ Ingrediënt toevoegen</button>
          <div style="margin-top:8px">
            <label class="form-label">Plak ingrediëntenlijst</label>
            <textarea class="form-textarea" id="bulk-ingredients" placeholder="Plak hier een lijst met ingrediënten (één per regel)..." rows="4"></textarea>
            <button class="btn btn-outline btn-sm btn-full" id="parse-bulk-btn" style="margin-top:4px">Verwerken</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Bereidingswijze</label>
          <div id="instructions-list">${instructionsHtml}</div>
          <button class="btn btn-outline btn-sm" id="add-inst-btn" style="margin-top:8px">+ Stap toevoegen</button>
        </div>

        <div style="display:flex;gap:8px;position:fixed;bottom:var(--nav-height);left:0;right:0;padding:12px;background:var(--surface);border-top:1px solid var(--border);z-index:5">
          <button class="btn btn-secondary" style="flex:0 0 auto" id="cancel-form-btn">Annuleer</button>
          <button class="btn btn-primary btn-full" id="save-recipe-btn">Opslaan</button>
        </div>
      </div>`;

    attachFormEvents();
  }

  function attachFormEvents() {
    // Image upload
    document.getElementById('upload-area')?.addEventListener('click', () =>
      document.getElementById('img-file').click()
    );
    document.getElementById('img-file')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        currentImage = evt.target.result;
        buildForm();
      };
      reader.readAsDataURL(file);
    });
    document.getElementById('remove-img')?.addEventListener('click', () => {
      currentImage = '';
      buildForm();
    });

    // Tab switching
    document.getElementById('tab-url')?.addEventListener('click', () => {
      document.getElementById('tab-url').classList.add('active');
      document.getElementById('tab-text').classList.remove('active');
      document.getElementById('import-url-panel').classList.remove('hidden');
      document.getElementById('import-text-panel').classList.add('hidden');
    });
    document.getElementById('tab-text')?.addEventListener('click', () => {
      document.getElementById('tab-text').classList.add('active');
      document.getElementById('tab-url').classList.remove('active');
      document.getElementById('import-text-panel').classList.remove('hidden');
      document.getElementById('import-url-panel').classList.add('hidden');
    });

    // URL import
    document.getElementById('import-btn')?.addEventListener('click', async () => {
      const url = document.getElementById('import-url').value.trim();
      if (!url) return;
      const statusEl = document.getElementById('scrape-status');
      statusEl.innerHTML = '<div class="scraper-status loading"><div class="spinner"></div>Bezig met importeren...</div>';

      try {
        const data = await Scraper.scrape(url);
        defaultRecipe.name = data.name;
        defaultRecipe.description = data.description;
        defaultRecipe.image = data.image;
        defaultRecipe.source = data.source;
        defaultRecipe.prepTime = data.prepTime;
        defaultRecipe.cookTime = data.cookTime;
        defaultRecipe.servings = data.servings;
        currentIngredients = data.ingredients;
        currentInstructions = data.instructions;
        currentTags = data.tags;
        currentImage = data.image;
        statusEl.innerHTML = '<div class="scraper-status success">✓ Recept succesvol geïmporteerd!</div>';
        buildForm();
      } catch (e) {
        statusEl.innerHTML = `<div class="scraper-status error">✗ ${escapeHtml(e.message)}</div>`;
      }
    });

    // Text paste import
    document.getElementById('parse-text-btn')?.addEventListener('click', () => {
      const text = document.getElementById('paste-text').value.trim();
      const statusEl = document.getElementById('parse-status');
      if (!text) { statusEl.innerHTML = '<div class="scraper-status error">Plak eerst tekst in het veld.</div>'; return; }

      const data = TextParser.parse(text);
      const ingCount = data.ingredients.length;
      const stepCount = data.instructions.length;

      if (!data.name && ingCount === 0 && stepCount === 0) {
        statusEl.innerHTML = '<div class="scraper-status error">Kon geen recept herkennen in deze tekst. Probeer meer tekst te plakken, inclusief de koppen "Ingrediënten" en "Bereiding".</div>';
        return;
      }

      defaultRecipe.name = data.name || defaultRecipe.name;
      defaultRecipe.prepTime = data.prepTime || defaultRecipe.prepTime;
      defaultRecipe.cookTime = data.cookTime || defaultRecipe.cookTime;
      defaultRecipe.servings = data.servings || defaultRecipe.servings;
      currentIngredients = ingCount ? data.ingredients : currentIngredients;
      currentInstructions = stepCount ? data.instructions : currentInstructions;

      statusEl.innerHTML = `<div class="scraper-status success">✓ Gevonden: ${ingCount} ingrediënten, ${stepCount} stappen${data.name ? ` — "${escapeHtml(data.name)}"` : ''}. Controleer het resultaat hieronder.</div>`;
      buildForm();
    });

    // Delete ingredient
    document.querySelectorAll('.del-ing-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentIngredients.splice(parseInt(btn.dataset.idx), 1);
        buildForm();
      });
    });

    // Delete instruction
    document.querySelectorAll('.del-inst-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentInstructions.splice(parseInt(btn.dataset.idx), 1);
        buildForm();
      });
    });

    // Add ingredient
    document.getElementById('add-ing-btn')?.addEventListener('click', () => {
      currentIngredients.push({ amount: null, unit: '', name: '' });
      buildForm();
      const items = document.querySelectorAll('.ingredient-editor-item [data-field="name"]');
      items[items.length - 1]?.focus();
    });

    // Add instruction
    document.getElementById('add-inst-btn')?.addEventListener('click', () => {
      currentInstructions.push('');
      buildForm();
      const textareas = document.querySelectorAll('#instructions-list textarea');
      textareas[textareas.length - 1]?.focus();
    });

    // Bulk ingredient parse
    document.getElementById('parse-bulk-btn')?.addEventListener('click', () => {
      const text = document.getElementById('bulk-ingredients').value.trim();
      if (!text) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      currentIngredients.push(...lines);
      document.getElementById('bulk-ingredients').value = '';
      buildForm();
    });

    // Save
    document.getElementById('save-recipe-btn').addEventListener('click', async () => {
      // Collect current form values
      const name = document.getElementById('recipe-name').value.trim();
      if (!name) { showToast('Voer een naam in', 'error'); return; }

      // Collect ingredients from form
      const ingItems = document.querySelectorAll('[data-ing-idx]');
      const ingredients = Array.from(ingItems).map(item => {
        const amount = item.querySelector('[data-field="amount"]').value.trim();
        const unit = item.querySelector('[data-field="unit"]').value.trim();
        const name = item.querySelector('[data-field="name"]').value.trim();
        if (!name) return null;
        return { amount: amount ? parseFloat(amount.replace(',', '.')) : null, unit, name };
      }).filter(Boolean);

      // Collect instructions
      const instItems = document.querySelectorAll('#instructions-list textarea');
      const instructions = Array.from(instItems).map(t => t.value.trim()).filter(Boolean);

      const tags = document.getElementById('recipe-tags').value
        .split(',').map(t => t.trim()).filter(Boolean);

      const toSave = {
        ...(isEdit ? recipe : {}),
        id: isEdit ? recipe.id : undefined,
        name,
        description: document.getElementById('recipe-desc').value.trim(),
        image: currentImage,
        source: defaultRecipe.source || '',
        prepTime: parseInt(document.getElementById('recipe-prep').value) || 0,
        cookTime: parseInt(document.getElementById('recipe-cook').value) || 0,
        servings: parseInt(document.getElementById('recipe-servings').value) || 4,
        ingredients,
        instructions,
        tags
      };

      const savedId = await DB.saveRecipe(toSave);
      state.recipes = await DB.getRecipes();
      showToast(isEdit ? 'Recept bijgewerkt' : 'Recept opgeslagen', 'success');
      navigate('recipe-detail', { id: isEdit ? recipe.id : savedId });
    });

    document.getElementById('cancel-form-btn').addEventListener('click', goBack);
  }

  buildForm();
}

function openAddRecipeModal() {
  navigate('recipe-form', {});
}

// ─── Week Menu View ────────────────────────────────────────────────────────────
async function renderWeekMenu() {
  document.getElementById('page-title').textContent = 'Weekmenu';
  document.getElementById('header-actions').innerHTML = `
    <button class="icon-btn" id="shuffle-week-btn" title="Vul week met random recepten">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
    </button>
    <button class="icon-btn" id="gen-shopping-btn" title="Maak boodschappenlijst">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    </button>`;

  const plan = state.mealplan = await DB.getMealPlan(weekKey(state.weekStart));

  const days = [
    { key: 'mon', label: 'Maandag' }, { key: 'tue', label: 'Dinsdag' },
    { key: 'wed', label: 'Woensdag' }, { key: 'thu', label: 'Donderdag' },
    { key: 'fri', label: 'Vrijdag' }, { key: 'sat', label: 'Zaterdag' },
    { key: 'sun', label: 'Zondag' }
  ];

  const weekEnd = addDays(state.weekStart, 6);
  const weekLabel = `${formatDateShort(state.weekStart)} – ${formatDateShort(weekEnd)}`;

  const daysHtml = days.map((d, i) => {
    const dayDate = addDays(state.weekStart, i);
    const isT = isToday(dayDate);
    const recipeIds = plan.days[d.key] || [];
    const recipes = recipeIds.map(id => state.recipes.find(r => r.id === id)).filter(Boolean);

    const recipesHtml = recipes.length
      ? recipes.map(r => {
          const emoji = recipeEmoji(r);
          const imgHtml = r.image
            ? `<img src="${escapeHtml(r.image)}" class="day-recipe-thumb" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : '';
          const phHtml = `<div class="day-recipe-thumb-placeholder" style="${r.image ? 'display:none' : ''}">${emoji}</div>`;
          return `<div class="day-recipe-item" data-recipe-id="${r.id}" data-day="${d.key}">
            ${imgHtml}${phHtml}
            <span class="day-recipe-name">${escapeHtml(r.name)}</span>
            <button class="icon-btn danger remove-from-day" data-recipe-id="${r.id}" data-day="${d.key}" style="width:32px;height:32px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>`;
        }).join('')
      : `<div class="day-empty">Geen gerecht gepland</div>`;

    return `<div class="day-card">
      <div class="day-header ${isT ? 'day-today' : ''}">
        <span class="day-name">${d.label}${isT ? ' ☀️' : ''}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="day-date">${formatDateShort(dayDate)}</span>
          <button class="icon-btn add-to-day-btn" data-day="${d.key}" style="width:32px;height:32px;color:var(--primary)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      <div class="day-recipes">${recipesHtml}</div>
    </div>`;
  }).join('');

  document.getElementById('main-content').innerHTML = `
    <div class="week-header">
      <button class="icon-btn" id="prev-week">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="week-label">${weekLabel}</span>
      <button class="icon-btn" id="next-week">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="week-days">${daysHtml}</div>
    <div class="week-actions">
      <button class="btn btn-secondary" style="flex:1" id="clear-week-btn">🗑 Leegmaken</button>
      <button class="btn btn-primary" style="flex:2" id="auto-plan-btn">🎲 Vul week willekeurig</button>
    </div>`;

  document.getElementById('prev-week').addEventListener('click', () => {
    state.weekStart = addDays(state.weekStart, -7);
    state.mealplan = null;
    renderWeekMenu();
  });

  document.getElementById('next-week').addEventListener('click', () => {
    state.weekStart = addDays(state.weekStart, 7);
    state.mealplan = null;
    renderWeekMenu();
  });

  document.querySelectorAll('.add-to-day-btn').forEach(btn => {
    btn.addEventListener('click', () => openPickRecipeForDay(btn.dataset.day));
  });

  document.querySelectorAll('.remove-from-day').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const day = btn.dataset.day;
      const recipeId = parseInt(btn.dataset.recipeId);
      plan.days[day] = plan.days[day].filter(id => id !== recipeId);
      state.mealplan = plan;
      await DB.saveMealPlan(plan);
      renderWeekMenu();
    });
  });

  document.querySelectorAll('.day-recipe-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.remove-from-day')) return;
      navigate('recipe-detail', { id: parseInt(item.dataset.recipeId) });
    });
  });

  document.getElementById('auto-plan-btn').addEventListener('click', () => fillWeekRandom(false));
  document.getElementById('shuffle-week-btn').addEventListener('click', () => fillWeekRandom(false));

  document.getElementById('clear-week-btn').addEventListener('click', async () => {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    days.forEach(d => { plan.days[d] = []; });
    state.mealplan = plan;
    await DB.saveMealPlan(plan);
    renderWeekMenu();
  });

  document.getElementById('gen-shopping-btn').addEventListener('click', () => {
    navigate('shopping');
  });
}

function openPickRecipeForDay(day) {
  const dayLabels = { mon: 'Maandag', tue: 'Dinsdag', wed: 'Woensdag', thu: 'Donderdag', fri: 'Vrijdag', sat: 'Zaterdag', sun: 'Zondag' };
  let search = '';

  function getFilteredList() {
    if (!search) return state.recipes;
    const q = search.toLowerCase();
    return state.recipes.filter(r => r.name.toLowerCase().includes(q));
  }

  function buildContent() {
    const list = getFilteredList();
    const items = list.map(r => `
      <div class="day-recipe-item pick-recipe-item" data-id="${r.id}" style="cursor:pointer">
        ${r.image ? `<img src="${escapeHtml(r.image)}" class="day-recipe-thumb" alt="" onerror="this.style.display='none'">` : `<div class="day-recipe-thumb-placeholder">${recipeEmoji(r)}</div>`}
        <span class="day-recipe-name">${escapeHtml(r.name)}</span>
      </div>`).join('');

    return `
      <div class="search-input-wrap" style="margin-bottom:12px;background:var(--surface2);border-radius:var(--radius-xl);padding:0 14px;display:flex;gap:8px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:var(--text-secondary)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="search" id="pick-search" placeholder="Zoek recept..." value="${escapeHtml(search)}" style="flex:1;border:none;background:none;font-size:15px;padding:10px 0;color:var(--text);outline:none">
      </div>
      <div id="pick-list" style="max-height:60vh;overflow-y:auto">${list.length ? items : '<p style="text-align:center;color:var(--text-secondary);padding:20px">Geen recepten gevonden</p>'}</div>`;
  }

  Modal.open(`Recept voor ${dayLabels[day]}`, buildContent());

  function attachPickEvents() {
    document.getElementById('pick-search').addEventListener('input', e => {
      search = e.target.value;
      document.getElementById('pick-list').innerHTML = '';
      const list = getFilteredList();
      document.getElementById('pick-list').innerHTML = list.map(r => `
        <div class="day-recipe-item pick-recipe-item" data-id="${r.id}" style="cursor:pointer">
          ${r.image ? `<img src="${escapeHtml(r.image)}" class="day-recipe-thumb" alt="" onerror="this.style.display='none'">` : `<div class="day-recipe-thumb-placeholder">${recipeEmoji(r)}</div>`}
          <span class="day-recipe-name">${escapeHtml(r.name)}</span>
        </div>`).join('');
      attachPickItemEvents();
    });
    attachPickItemEvents();
  }

  function attachPickItemEvents() {
    document.querySelectorAll('.pick-recipe-item').forEach(item => {
      item.addEventListener('click', async () => {
        const recipeId = parseInt(item.dataset.id);
        const plan = state.mealplan || await DB.getMealPlan(weekKey(state.weekStart));
        if (!plan.days[day].includes(recipeId)) plan.days[day].push(recipeId);
        state.mealplan = plan;
        await DB.saveMealPlan(plan);
        Modal.close();
        renderWeekMenu();
      });
    });
  }

  attachPickEvents();
}

async function fillWeekRandom(onlyEmpty = false) {
  if (state.recipes.length === 0) { showToast('Voeg eerst recepten toe', 'error'); return; }

  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const plan = state.mealplan || await DB.getMealPlan(weekKey(state.weekStart));

  // Shuffle recipes; if we have ≥7 avoid repeats, otherwise allow wrap-around
  const shuffled = [...state.recipes].sort(() => Math.random() - 0.5);
  let pool = [...shuffled];
  let filled = 0;

  days.forEach(day => {
    if (onlyEmpty && plan.days[day]?.length > 0) return;
    if (pool.length === 0) pool = [...shuffled]; // refill if fewer than 7 recipes
    plan.days[day] = [pool.shift().id];
    filled++;
  });

  state.mealplan = plan;
  await DB.saveMealPlan(plan);
  showToast(`${filled} dagen gevuld met willekeurige recepten`, 'success');
  renderWeekMenu();
}

// ─── Shopping List View ───────────────────────────────────────────────────────
async function renderShopping() {
  document.getElementById('page-title').textContent = 'Boodschappenlijst';
  document.getElementById('header-actions').innerHTML = `
    <button class="icon-btn" id="export-todoist-btn" title="Exporteer naar Todoist">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
    </button>`;

  const plan = await DB.getMealPlan(weekKey(state.weekStart));
  const allRecipeIds = Object.values(plan.days).flat();
  const weekRecipes = allRecipeIds.map(id => state.recipes.find(r => r.id === id)).filter(Boolean);

  // Extra items from "add to shopping" button on recipe detail
  const extraItems = JSON.parse(localStorage.getItem('extra_shopping') || '[]');

  const allIngredientArrays = [
    ...weekRecipes.map(r => r.ingredients || []),
    ...(extraItems.length ? [extraItems] : [])
  ];

  let items = aggregateIngredients(allIngredientArrays);

  // Sort alphabetically
  items = items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nl'));

  // Mark pantry items
  items = items.map(item => {
    const inPantry = state.pantry.some(p => {
      const pn = normalizeIngredientName(p.name);
      const inn = normalizeIngredientName(item.name || '');
      return pn === inn || pn.includes(inn) || inn.includes(pn);
    });
    return { ...item, inPantry };
  });

  state.shoppingItems = items;

  function buildContent(showPantry) {
    if (items.length === 0) {
      return `<div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <h3>Geen boodschappen</h3>
        <p>Voeg recepten toe aan je weekmenu om automatisch een boodschappenlijst te maken.</p>
        <button class="btn btn-primary" id="go-to-week">Naar weekmenu</button>
      </div>`;
    }

    const visible = showPantry ? items : items.filter(i => !i.inPantry);
    const pantryCount = items.filter(i => i.inPantry).length;

    const listHtml = visible.map((item, i) => {
      const checked = state.shoppingChecked.has(item.name);
      const displayAmount = item.amount ? formatAmount(item.amount, item.unit) : (item.unit || '');
      return `<div class="shopping-item ${checked ? 'checked' : ''} ${item.inPantry ? 'in-pantry' : ''}" data-idx="${i}" data-name="${escapeHtml(item.name)}">
        <div class="shopping-check ${checked ? 'checked' : ''}">
          ${checked ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </div>
        <span class="shopping-item-text">${escapeHtml(item.name)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          ${item.inPantry ? '<span class="in-pantry-badge">in huis</span>' : ''}
          ${displayAmount ? `<span class="shopping-item-amount">${escapeHtml(displayAmount)}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    return `
      <div class="shopping-toolbar">
        <button class="btn btn-sm ${!showPantry ? 'btn-primary' : 'btn-secondary'}" id="hide-pantry-btn">
          Verberg in huis (${pantryCount})
        </button>
        <button class="btn btn-sm btn-secondary" id="clear-checked-btn">Wis afgevinkten</button>
      </div>
      <div class="shopping-section">${listHtml}</div>`;
  }

  let showPantryItems = false;
  document.getElementById('main-content').innerHTML = buildContent(showPantryItems);

  document.getElementById('go-to-week')?.addEventListener('click', () => navigate('weekmenu'));

  function attachShoppingEvents() {
    document.getElementById('hide-pantry-btn')?.addEventListener('click', () => {
      showPantryItems = !showPantryItems;
      document.getElementById('main-content').innerHTML = buildContent(showPantryItems);
      attachShoppingEvents();
    });

    document.getElementById('clear-checked-btn')?.addEventListener('click', () => {
      state.shoppingChecked.clear();
      document.getElementById('main-content').innerHTML = buildContent(showPantryItems);
      attachShoppingEvents();
    });

    document.querySelectorAll('.shopping-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        if (state.shoppingChecked.has(name)) state.shoppingChecked.delete(name);
        else state.shoppingChecked.add(name);
        document.getElementById('main-content').innerHTML = buildContent(showPantryItems);
        attachShoppingEvents();
      });
    });
  }

  attachShoppingEvents();

  document.getElementById('export-todoist-btn').addEventListener('click', openTodoistExport);
}

async function openTodoistExport() {
  const token = await DB.getSetting('todoist_token');
  const projectId = await DB.getSetting('todoist_project_id');

  if (!token) {
    Modal.open('Todoist koppeling', `
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:16px">
        Voer je Todoist API token in om de boodschappenlijst te exporteren. Je vindt dit in Todoist → Instellingen → Integraties → API token.
      </p>
      <div class="form-group">
        <label class="form-label">API Token</label>
        <input type="password" class="form-input" id="td-token" placeholder="Jouw Todoist API token">
      </div>
      <button class="btn btn-primary btn-full" id="save-td-token">Opslaan & doorgaan</button>`);

    document.getElementById('save-td-token').addEventListener('click', async () => {
      const t = document.getElementById('td-token').value.trim();
      if (!t) return;
      await DB.setSetting('todoist_token', t);
      Modal.close();
      openTodoistExport();
    });
    return;
  }

  const unchecked = state.shoppingItems.filter(i => !state.shoppingChecked.has(i.name) && !i.inPantry);

  Modal.open('Exporteer naar Todoist', `
    <p style="color:var(--text-secondary);font-size:14px;margin-bottom:16px">
      ${unchecked.length} items worden toegevoegd aan Todoist.
    </p>
    <div class="form-group">
      <label class="form-label">Project (optioneel)</label>
      <select class="form-select" id="td-project">
        <option value="">Inbox</option>
      </select>
    </div>
    <button class="btn btn-primary btn-full" id="do-export">Exporteren</button>`);

  // Load projects
  try {
    const projects = await Todoist.getProjects(token);
    const select = document.getElementById('td-project');
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === projectId) opt.selected = true;
      select.appendChild(opt);
    });
  } catch {}

  document.getElementById('do-export').addEventListener('click', async () => {
    const pid = document.getElementById('td-project').value;
    await DB.setSetting('todoist_project_id', pid);
    document.getElementById('do-export').disabled = true;
    document.getElementById('do-export').textContent = 'Bezig...';

    try {
      const exportItems = unchecked.map(i => ({
        ...i,
        displayAmount: i.amount ? formatAmount(i.amount, i.unit) : (i.unit || ''),
        checked: false
      }));
      const { count, errors } = await Todoist.exportShoppingList(token, pid || null, exportItems);
      Modal.close();
      if (errors.length) {
        showToast(`${count} items geëxporteerd, ${errors.length} mislukt`, 'error', 4000);
      } else {
        showToast(`${count} items toegevoegd aan Todoist`, 'success');
      }
    } catch (e) {
      showToast(e.message, 'error');
      document.getElementById('do-export').disabled = false;
      document.getElementById('do-export').textContent = 'Exporteren';
    }
  });
}

// ─── Pantry View ──────────────────────────────────────────────────────────────
async function renderPantry() {
  document.getElementById('page-title').textContent = 'Voorraad thuis';
  document.getElementById('header-actions').innerHTML = '';

  function buildContent() {
    const listHtml = state.pantry.length
      ? state.pantry.map(item => `
        <div class="pantry-item">
          <div style="flex:1">
            <div class="pantry-item-name">${escapeHtml(item.name)}</div>
            ${item.amount ? `<div class="pantry-item-amount">${escapeHtml(String(item.amount))}${item.unit ? ' ' + item.unit : ''}</div>` : ''}
          </div>
          <button class="icon-btn danger" data-del-pantry="${item.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>`).join('')
      : `<div class="empty-state">
          <div class="empty-state-icon">🥕</div>
          <h3>Geen voorraad ingevoerd</h3>
          <p>Voeg ingrediënten toe die je thuis hebt. De app gebruikt dit om te laten zien welke recepten je al bijna kunt maken.</p>
         </div>`;

    return `
      <div style="background:var(--surface);border-bottom:1px solid var(--border);padding:12px">
        <div style="display:flex;gap:8px">
          <input type="text" class="form-input" id="pantry-name" placeholder="Ingrediënt" style="flex:2">
          <input type="text" class="form-input" id="pantry-amount" placeholder="Hoev." style="flex:1">
          <input type="text" class="form-input" id="pantry-unit" placeholder="Eenheid" style="flex:1">
        </div>
        <button class="btn btn-primary btn-full" id="add-pantry-btn" style="margin-top:8px">+ Toevoegen aan voorraad</button>
      </div>
      <div class="pantry-list">${listHtml}</div>`;
  }

  document.getElementById('main-content').innerHTML = buildContent();

  function attachPantryEvents() {
    document.getElementById('add-pantry-btn').addEventListener('click', async () => {
      const name = document.getElementById('pantry-name').value.trim();
      if (!name) { showToast('Voer een naam in', 'error'); return; }
      const amount = document.getElementById('pantry-amount').value.trim();
      const unit = document.getElementById('pantry-unit').value.trim();
      await DB.savePantryItem({ name, amount: amount ? parseFloat(amount) : null, unit });
      state.pantry = await DB.getPantry();
      document.getElementById('pantry-name').value = '';
      document.getElementById('pantry-amount').value = '';
      document.getElementById('pantry-unit').value = '';
      document.getElementById('main-content').innerHTML = buildContent();
      attachPantryEvents();
    });

    document.querySelectorAll('[data-del-pantry]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await DB.deletePantryItem(parseInt(btn.dataset.delPantry));
        state.pantry = await DB.getPantry();
        document.getElementById('main-content').innerHTML = buildContent();
        attachPantryEvents();
      });
    });

    // Allow pressing Enter in pantry name field
    document.getElementById('pantry-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('add-pantry-btn').click();
    });
  }

  attachPantryEvents();
}

// ─── Settings View ─────────────────────────────────────────────────────────────
async function renderSettings() {
  document.getElementById('page-title').textContent = 'Instellingen';
  document.getElementById('header-actions').innerHTML = '';

  const settings = await DB.getAllSettings();

  document.getElementById('main-content').innerHTML = `
    <div style="padding:12px">
      <div class="section-title" style="padding-left:4px">Todoist koppeling</div>
      <div class="settings-section">
        <div class="settings-item" id="set-todoist-token">
          <div>
            <div class="settings-item-label">API Token</div>
            <div class="settings-item-value">${settings.todoist_token ? '●●●●●●●● (ingesteld)' : 'Niet ingesteld'}</div>
          </div>
          <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      <div class="section-title" style="padding-left:4px;margin-top:8px">Gegevens</div>
      <div class="settings-section">
        <div class="settings-item" id="export-data-btn">
          <span class="settings-item-label">📤 Exporteer alle data</span>
          <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="settings-item" id="import-data-btn">
          <span class="settings-item-label">📥 Importeer data</span>
          <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="settings-item danger" id="clear-data-btn">
          <span class="settings-item-label" style="color:var(--danger)">🗑️ Verwijder alle data</span>
        </div>
      </div>

      <div class="section-title" style="padding-left:4px;margin-top:8px">App</div>
      <div class="settings-section">
        <div class="settings-item">
          <div>
            <div class="settings-item-label">Versie</div>
            <div class="settings-item-value">1.0.0</div>
          </div>
        </div>
        <div class="settings-item" id="install-pwa-btn">
          <span class="settings-item-label">📱 Installeer op dit apparaat</span>
          <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      <input type="file" id="import-file" accept=".json" style="display:none">
    </div>`;

  document.getElementById('set-todoist-token').addEventListener('click', () => {
    Modal.open('Todoist API Token', `
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:16px">
        Vind je token in Todoist → Instellingen → Integraties → API token.
      </p>
      <div class="form-group">
        <input type="password" class="form-input" id="new-td-token" placeholder="Todoist API token" value="${escapeHtml(settings.todoist_token || '')}">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-full" id="clear-td-token">Wissen</button>
        <button class="btn btn-primary btn-full" id="save-td-token">Opslaan</button>
      </div>`);

    document.getElementById('save-td-token').addEventListener('click', async () => {
      const t = document.getElementById('new-td-token').value.trim();
      await DB.setSetting('todoist_token', t);
      Modal.close();
      showToast('Token opgeslagen', 'success');
      renderSettings();
    });

    document.getElementById('clear-td-token').addEventListener('click', async () => {
      await DB.setSetting('todoist_token', '');
      Modal.close();
      renderSettings();
    });
  });

  document.getElementById('export-data-btn').addEventListener('click', async () => {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mealplan-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data geëxporteerd', 'success');
  });

  document.getElementById('import-data-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await DB.importAll(data);
      state.recipes = await DB.getRecipes();
      state.pantry = await DB.getPantry();
      state.settings = await DB.getAllSettings();
      showToast('Data succesvol geïmporteerd', 'success');
      renderSettings();
    } catch (err) {
      showToast('Fout bij importeren: ' + err.message, 'error', 4000);
    }
    e.target.value = '';
  });

  document.getElementById('clear-data-btn').addEventListener('click', () => {
    Modal.open('Alle data verwijderen', `
      <p style="color:var(--danger);font-weight:600;margin-bottom:8px">⚠️ Let op!</p>
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:20px">Dit verwijdert alle recepten, het weekmenu en je voorraad permanent. Maak eerst een export als back-up.</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-full" id="cancel-clear">Annuleer</button>
        <button class="btn btn-danger btn-full" id="confirm-clear">Verwijder alles</button>
      </div>`);
    document.getElementById('cancel-clear').addEventListener('click', Modal.close);
    document.getElementById('confirm-clear').addEventListener('click', async () => {
      await DB.importAll({ version: 1, recipes: [], mealplans: [], pantry: [], settings: [] });
      state.recipes = [];
      state.pantry = [];
      state.mealplan = null;
      Modal.close();
      showToast('Alle data verwijderd');
      renderSettings();
    });
  });

  // PWA install
  const installBtn = document.getElementById('install-pwa-btn');
  if (window._pwaInstallPrompt) {
    installBtn.addEventListener('click', async () => {
      window._pwaInstallPrompt.prompt();
      const { outcome } = await window._pwaInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        window._pwaInstallPrompt = null;
        showToast('App geïnstalleerd!', 'success');
      }
    });
  } else {
    installBtn.querySelector('.settings-item-label').textContent = '📱 App installeren (gebruik "Toevoegen aan beginscherm" in je browser)';
  }
}

// ─── Initialization ───────────────────────────────────────────────────────────
async function init() {
  // Load initial data
  [state.recipes, state.pantry, state.settings] = await Promise.all([
    DB.getRecipes(),
    DB.getPantry(),
    DB.getAllSettings()
  ]);

  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      state.viewStack = [];
      state.selectionMode = false;
      state.selectedIds.clear();
      navigate(btn.dataset.view);
    });
  });

  document.getElementById('back-btn').addEventListener('click', goBack);

  document.getElementById('modal-close').addEventListener('click', Modal.close);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) Modal.close();
  });

  // PWA install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window._pwaInstallPrompt = e;
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
}

init();
