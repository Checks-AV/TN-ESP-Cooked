/* ============================================================
   OVERCOOKED — TICKET RAIL GAME
   Client-side JavaScript
   ============================================================ */

// ============================================================
// ICONS
// ============================================================
const ICONS = {
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1.2 3.2-2 4.4-2 7.6a4 4 0 0 0 8 0c0-1.2-.6-2.2-1.1-3.2 1.3.1 3.1 2.2 3.1 5.2a6 6 0 0 1-12 0c0-4.3 3.2-5.6 4-9.6z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01z"/></svg>',
  starOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/></svg>',
  hat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.5a5 5 0 0 1 3.5-8.9 3 3 0 0 1 5.9 1A4 4 0 0 1 17 12.5"/><path d="M6.5 12.5h11L17 20H7z"/></svg>',
  plate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 12.6a10 10 0 0 1 14.2 0"/><path d="M8.2 16a5.4 5.4 0 0 1 7.6 0"/><line x1="12" y1="19.5" x2="12" y2="19.6"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h7l-1 8 10-13h-7z"/></svg>'
};

function ic(name, extraClass) {
  return `<span class="icon${extraClass ? ' ' + extraClass : ''}">${ICONS[name]}</span>`;
}

function withIcon(name, text) {
  return `${ic(name)}<span>${text}</span>`;
}

// ============================================================
// DOM REFERENCES
// ============================================================
document.getElementById('chefIconSlot').innerHTML = ICONS.hat;
document.getElementById('plateBadgeSlot').innerHTML = ICONS.plate;
document.getElementById('serviceLabelSlot').innerHTML = withIcon('clock', 'Service Time');

const rail = document.getElementById('rail');
const emptyMsg = document.getElementById('emptyMsg');
const statusMsg = document.getElementById('statusMsg');
const serviceTimeEl = document.getElementById('serviceTime');
const serviceFillEl = document.getElementById('serviceFill');
const toastEl = document.getElementById('toast');
const overlay = document.getElementById('overlay');
const controllerStatus = document.getElementById('controllerStatus');
const playAgainBtn = document.getElementById('playAgainBtn');

playAgainBtn.innerHTML = withIcon('refresh', 'New Service');

// ============================================================
// STATE
// ============================================================
let recipes = [];
let orderCounter = 0;
let activeOrders = [];
let score = 0, served = 0, missed = 0, failed = 0;
let running = false, paused = false;
let serviceRemaining = 300;
let totalServiceTime = 300;
let spawnTimeout = null;
let mainTickInterval = null;
let minOrdersCheckInterval = null;
let recipesLoaded = false;
let recipesLoading = false;
let pauseStartedAt = null;
let isPeakActive = false;

// Combo streak: counts consecutive completed orders (no fail/miss in between).
// Resets to 0 the moment an order fails or is missed. Feeds the combo
// multiplier layer of the scoring formula (see completeOrder()).
let comboStreak = 0;

let params = {
  spawnMin: 6,
  spawnMax: 11,
  prepTime: 22,
  rampFactor: 0.92,
  totalTime: 300,
  peakEnabled: false,
  peakInterval: 45,
  peakDuration: 12,
  peakIntensity: 0.4,
  peakBurstSize: 2,
  concurrencyMin: 2,
  concurrencyMax: 5,
  chaos: 0.3,
  minOrdersAlways: 1,

  // Ticket display toggles
  showIngredients: true,
  showIngredientSteps: true,

  // Scoring engine weights (see completeOrder() for the full formula)
  basePointsPerSecond: 4,
  difficultyIngredientWeight: 0.1,
  difficultyStepWeight: 0.05,
  minPayoutFraction: 0.2,
  comboMultiplierStep: 0.1,
  comboMaxMultiplier: 2.0,
};

let peakUntil = 0;
let nextPeakAt = 0;
let manualPeakUntil = 0;
let manualPeakInterval = null;

// Leaderboard state
let isSubmitting = false;

// ============================================================
// HELPERS
// ============================================================
function updateStatusPillLabel() {
  controllerStatus.innerHTML = withIcon('clock', 'Idle');
}
updateStatusPillLabel();

function showToast(text, kind, iconName) {
  toastEl.innerHTML = `${ic(iconName || (kind === 'good' ? 'star' : kind === 'bad' ? 'x' : 'bolt'))}<span>${text}</span>`;
  toastEl.className = 'toast ' + kind;
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1400);
}

function nextOrderNumber() {
  orderCounter += 1;
  return '#' + String(orderCounter).padStart(2, '0');
}

function updateServiceClock() {
  const m = Math.floor(Math.max(0, serviceRemaining) / 60).toString().padStart(2, '0');
  const s = Math.floor(Math.max(0, serviceRemaining) % 60).toString().padStart(2, '0');
  serviceTimeEl.textContent = `${m}:${s}`;
  serviceFillEl.style.width = Math.max(0, (serviceRemaining / totalServiceTime) * 100) + '%';
}

function updateStats() {
  document.getElementById('statScore').innerHTML = `${ic('star')}<span>${score}</span>`;
  document.getElementById('statServed').innerHTML = `${ic('check')}<span>${served}</span>`;
  document.getElementById('statMissed').innerHTML = `${ic('clock')}<span>${missed}</span>`;
  document.getElementById('statFailed').innerHTML = `${ic('x')}<span>${failed}</span>`;
}

function updateStatusPill() {
  const inManualPeak = Date.now() < manualPeakUntil;
  const inAutoPeak = params.peakEnabled && Date.now() < peakUntil;
  const inPeak = inManualPeak || inAutoPeak;
  isPeakActive = inPeak;

  if (running && !paused && inManualPeak) {
    controllerStatus.innerHTML = withIcon('bolt', '🔥 Manual Peak!');
    controllerStatus.className = 'status-pill manual-peak';
    serviceFillEl.classList.add('peak');
  } else if (running && !paused && inAutoPeak) {
    controllerStatus.innerHTML = withIcon('bolt', 'Peak Hour!');
    controllerStatus.className = 'status-pill peak';
    serviceFillEl.classList.add('peak');
  } else if (running && !paused) {
    controllerStatus.innerHTML = withIcon('flame', 'Cooking');
    controllerStatus.className = 'status-pill running';
    serviceFillEl.classList.remove('peak');
  } else if (running && paused) {
    controllerStatus.innerHTML = withIcon('pause', 'Paused');
    controllerStatus.className = 'status-pill paused';
    serviceFillEl.classList.remove('peak');
  } else if (serviceRemaining <= 0 && running === false) {
    controllerStatus.innerHTML = withIcon('check', 'Done');
    controllerStatus.className = 'status-pill ended';
    serviceFillEl.classList.remove('peak');
  } else {
    controllerStatus.innerHTML = withIcon('clock', 'Idle');
    controllerStatus.className = 'status-pill idle';
    serviceFillEl.classList.remove('peak');
  }
}

function getState() {
  return {
    running,
    paused,
    activeOrders: activeOrders.length,
    score,
    served,
    missed,
    failed,
    serviceRemaining,
    totalServiceTime,
  };
}

// ============================================================
// MINIMUM ORDERS MONITORING
// ============================================================
function startMinOrdersMonitoring() {
  if (minOrdersCheckInterval) clearInterval(minOrdersCheckInterval);
  
  minOrdersCheckInterval = setInterval(() => {
    if (!running || paused) return;
    
    const minOrders = params.minOrdersAlways || 0;
    if (minOrders <= 0) return;
    if (!recipes.length) return;
    
    const activeCount = activeOrders.filter(o => !o.missed && !o.completed && !o.failed).length;
    
    if (activeCount < minOrders) {
      const toSpawn = minOrders - activeCount;
      console.log(`🔄 Min orders check: ${activeCount}/${minOrders}, spawning ${toSpawn}`);
      
      for (let i = 0; i < toSpawn; i++) {
        setTimeout(() => {
          if (running && !paused && recipes.length > 0) {
            const currentActive = activeOrders.filter(o => !o.missed && !o.completed && !o.failed).length;
            if (currentActive < minOrders) {
              spawnSingleOrder();
            }
          }
        }, i * 400);
      }
    }
  }, 1000);
}

function stopMinOrdersMonitoring() {
  if (minOrdersCheckInterval) {
    clearInterval(minOrdersCheckInterval);
    minOrdersCheckInterval = null;
  }
}

function checkMinOrdersAlways() {
  if (!running || paused) return;
  
  const minOrders = params.minOrdersAlways || 0;
  if (minOrders <= 0) return;
  if (!recipes.length) return;
  
  const activeCount = activeOrders.filter(o => !o.missed && !o.completed && !o.failed).length;
  
  if (activeCount < minOrders) {
    const toSpawn = minOrders - activeCount;
    console.log(`🔄 Immediate min orders fill: ${activeCount}/${minOrders}, spawning ${toSpawn}`);
    
    for (let i = 0; i < toSpawn; i++) {
      setTimeout(() => {
        if (running && !paused && recipes.length > 0) {
          const currentActive = activeOrders.filter(o => !o.missed && !o.completed && !o.failed).length;
          if (currentActive < minOrders) {
            spawnSingleOrder();
          }
        }
      }, i * 400);
    }
  }
}

// ============================================================
// CONCURRENCY
// ============================================================
function getConcurrencyMultiplier() {
  const active = activeOrders.filter(o => !o.missed && !o.completed && !o.failed).length;
  const min = params.concurrencyMin || 2;
  const max = params.concurrencyMax || 5;

  if (active < min) {
    const ratio = Math.max(0.2, active / Math.max(1, min));
    return 0.3 + 0.7 * ratio;
  } else if (active > max) {
    const overload = (active - max) / max;
    return Math.max(0.2, 1 - overload * 0.6);
  }
  return 1;
}

// ============================================================
// SCORING ENGINE
// ============================================================
// Four layers, applied in order:
//   1. Base points     — basePointsPerSecond × prepTimeSeconds (the "floor")
//   2. Difficulty       — 1 + ingredientCount*ingredientWeight + totalPrepSteps*stepWeight
//   3. Time factor      — max(minPayoutFraction, 0.4 + 0.6 * (timeRemaining/totalPrepTime))
//   4. Combo multiplier — min(comboCap, 1 + streak*comboStep), reset to streak=0 on any fail/miss
//
// getDifficultyMultiplier() and getBasePoints() are shared between the
// "potential points" shown on a freshly spawned ticket and the actual
// payout computed in completeOrder() once it's served, so both numbers
// come from the same math.
function getBasePoints(recipe, duration) {
  return params.basePointsPerSecond * duration;
}

function getDifficultyMultiplier(recipe) {
  const ingredientCount = (recipe.ingredients || []).length;
  const totalPrepSteps = recipe.totalPrepSteps || 0;
  return 1
    + ingredientCount * (params.difficultyIngredientWeight || 0)
    + totalPrepSteps * (params.difficultyStepWeight || 0);
}

function getComboMultiplier() {
  const cap = params.comboMaxMultiplier || 1;
  return Math.min(cap, 1 + comboStreak * (params.comboMultiplierStep || 0));
}

// ============================================================
// LOAD RECIPES
// ============================================================
async function loadRecipesFromDB() {
  if (recipesLoading) return;
  recipesLoading = true;

  try {
    emptyMsg.className = 'empty-rail loading';
    emptyMsg.innerHTML = `
      <div class="glyph">${ICONS.hat}</div>
      <div class="title">Loading recipes...</div>
      <div class="sub">Getting the kitchen ready.</div>
    `;
    statusMsg.innerHTML = withIcon('refresh', 'Loading recipes...');
    statusMsg.className = 'status-msg';

    const response = await fetch('/api/recipes');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error('No recipes found in database');
    }

    recipes = data.map(recipe => ({
      id: recipe.id,
      name: recipe.name,
      prepTimeSeconds: recipe.prepTimeSeconds || 30,
      ingredients: recipe.ingredients || [],
      prepMethods: recipe.prepMethods || [],
      totalPrepSteps: recipe.totalPrepSteps || 0
    }));

    recipesLoaded = true;
    recipesLoading = false;

    console.log(`Loaded ${recipes.length} recipes`);

    emptyMsg.className = 'empty-rail success';
    emptyMsg.innerHTML = `
      <div class="glyph">${ICONS.ticket}</div>
      <div class="title">${recipes.length} Recipes Ready</div>
      <div class="sub">${recipes.map(r => r.name).join(' • ')}</div>
      <div class="sub" style="margin-top: 10px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color: rgba(255,246,226,0.75);">Waiting for service to start from the control dashboard</div>
    `;
    statusMsg.innerHTML = withIcon('check', `${recipes.length} recipes ready to cook`);
    statusMsg.className = 'status-msg success';

    return true;

  } catch (error) {
    console.error('Error loading recipes:', error);
    recipesLoaded = false;
    recipesLoading = false;

    emptyMsg.className = 'empty-rail error';
    emptyMsg.innerHTML = `
      <div class="glyph">${ICONS.alert}</div>
      <div class="title">Kitchen Trouble</div>
      <div class="sub">${error.message}</div>
      <button class="retry-btn" onclick="loadRecipesFromDB()">${ic('refresh')}<span>Try Again</span></button>
    `;
    statusMsg.innerHTML = withIcon('alert', `Error: ${error.message}`);
    statusMsg.className = 'status-msg error';

    return false;
  }
}

window.loadRecipesFromDB = loadRecipesFromDB;

// ============================================================
// SPAWN ORDERS
// ============================================================
function spawnSingleOrder() {
  if (!running || paused) return;
  if (!recipes.length) return;

  const recipe = recipes[Math.floor(Math.random() * recipes.length)];
  const orderNo = nextOrderNumber();
  const duration = params.prepTime || 30;
  const tilt = (Math.random() * 5 - 2.5).toFixed(1) + 'deg';

  const basePoints = getBasePoints(recipe, duration);
  const difficultyMultiplier = getDifficultyMultiplier(recipe);
  // "Potential" points shown on the ticket — the most this order could pay
  // out (full time remaining, no combo bonus yet). Actual payout is
  // computed in completeOrder() once combo + time factor are known.
  const potentialPoints = Math.round(basePoints * difficultyMultiplier);

  const ingredientList = recipe.ingredients || [];
  const prepList = recipe.prepMethods || [];

  let ingredientListBlock = '';
  if (params.showIngredients) {
    let ingredientsHtml = '';
    if (ingredientList.length > 0) {
      ingredientList.forEach((ing, idx) => {
        const step = prepList[idx] || 'Ready';
        const stepHtml = params.showIngredientSteps
          ? `<span class="steps">${step}</span>`
          : '';
        ingredientsHtml += `
          <div class="ingredient-item">
            <span><span class="status-dot pending" id="dot-${orderNo}-${idx}"></span><span class="name">${ing}</span></span>
            ${stepHtml}
          </div>
        `;
      });
    } else {
      ingredientsHtml = `<div class="ingredient-item"><span class="name">No ingredients listed</span></div>`;
    }
    ingredientListBlock = `<div class="ingredient-list">${ingredientsHtml}</div>`;
  }

  const el = document.createElement('div');
  el.className = 'ticket';
  el.style.setProperty('--tilt', tilt);
  el.id = `ticket-${orderNo}`;
  el.innerHTML = `
    <div class="clip"></div>
    <div class="ticket-body">
      <div class="ticket-head">
        <div class="order-no"><span class="hash">Order</span>${orderNo}</div>
        <div class="status-badge waiting">${ic('clock')}<span>Waiting</span></div>
      </div>
      <div class="dish-name">${recipe.name}</div>
      <div class="points-tag">${ic('star')}<span>Up to +${potentialPoints} pts</span></div>
      ${ingredientListBlock}
      <div class="timer-zone">
        <div class="timer-row"><span class="label">${ic('clock')}<span>Time left</span></span><span class="time-left">${duration}s</span></div>
        <div class="heat-gauge"><div class="heat-fill"></div></div>
      </div>
      <div class="ticket-foot">
        <span class="status-text waiting">${ic('hat')}<span>Waiting on counter</span></span>
      </div>
    </div>
  `;
  rail.appendChild(el);
  emptyMsg.style.display = 'none';

  const order = {
    orderNo,
    recipe,
    duration,
    basePoints,
    difficultyMultiplier,
    points: potentialPoints,
    endsAt: Date.now() + duration * 1000,
    el,
    late: false,
    missed: false,
    completed: false,
    failed: false,
    createdAt: Date.now(),
    ingredientList: ingredientList,
    prepList: prepList,
    received: false,
    validated: false,
    wireOrderNumber: null
  };
  activeOrders.push(order);

  const wireOrderNumber = String(orderCounter).padStart(2, '0');
  order.wireOrderNumber = wireOrderNumber;
  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_number: wireOrderNumber, food_id: recipe.id })
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) {
        console.error(`Failed to register order ${orderNo}:`, data.message || data.error);
      } else {
        console.log(`Order ${orderNo} registered as wire #${wireOrderNumber}`);
      }
    })
    .catch(err => console.error(`Error registering order ${orderNo}:`, err));

  updateStats();

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({
      type: 'order-spawned',
      payload: {
        orderNo,
        wireOrderNumber,
        dish: recipe.name,
        duration,
        points: potentialPoints
      }
    });
    channel.postMessage({ type: 'state-report', payload: getState() });
  } catch(e) {}
}

function spawnOrder() {
  if (!running || paused) return;
  if (!recipes.length) {
    console.warn('No recipes available');
    return;
  }

  const chaos = params.chaos || 0.3;

  let ordersToSpawn = 1;
  if (chaos > 0.1) {
    const multiChance = Math.min(0.8, chaos * 0.6);
    if (Math.random() < multiChance) {
      const maxBurst = 1 + Math.floor(chaos * 4);
      ordersToSpawn = 1 + Math.floor(Math.random() * maxBurst);
    }
  }

  const concurrencyMult = getConcurrencyMultiplier();
  if (concurrencyMult > 1.2 && Math.random() < 0.3) {
    ordersToSpawn += Math.floor(concurrencyMult * 0.5);
  }

  console.log(`🍳 Spawning ${ordersToSpawn} order(s) - Chaos: ${chaos}, Concurrency: ${concurrencyMult.toFixed(2)}`);

  for (let i = 0; i < ordersToSpawn; i++) {
    setTimeout(() => {
      if (!running || paused) return;
      spawnSingleOrder();
    }, i * (200 + Math.random() * 200));
  }
}

function scheduleNextSpawn() {
  if (spawnTimeout) clearTimeout(spawnTimeout);
  if (!running || paused) return;

  const min = params.spawnMin || 6;
  const max = params.spawnMax || 11;
  const progress = 1 - (serviceRemaining / totalServiceTime);
  const ramp = 1 - progress * (1 - (params.rampFactor || 0.92));

  const concurrencyMult = getConcurrencyMultiplier();
  const chaos = params.chaos || 0.3;
  
  const inManualPeak = Date.now() < manualPeakUntil;
  const inAutoPeak = params.peakEnabled && Date.now() < peakUntil;
  const inPeak = inManualPeak || inAutoPeak;
  
  let peakMult = 1;
  if (inManualPeak) {
    peakMult = Math.max(0.1, params.peakIntensity || 0.2);
  } else if (inAutoPeak) {
    peakMult = Math.max(0.1, params.peakIntensity || 0.4);
  }

  let delayMin = Math.max(0.5, min * ramp * peakMult * concurrencyMult);
  let delayMax = Math.max(1, max * ramp * peakMult * concurrencyMult);

  const midpoint = (delayMin + delayMax) / 2;
  const halfRange = (delayMax - delayMin) / 2;
  const adjustedHalfRange = halfRange * (1 + chaos * 0.8);
  delayMin = Math.max(0.3, midpoint - adjustedHalfRange);
  delayMax = midpoint + adjustedHalfRange;

  const chaosJitter = 1 + (Math.random() - 0.5) * chaos * 0.6;
  const baseDelay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000;
  const finalDelay = baseDelay * chaosJitter;

  console.log(`📊 Spawn schedule - Delay: ${(finalDelay/1000).toFixed(2)}s, Chaos: ${chaos}, Concurrency: ${concurrencyMult.toFixed(2)}, Peak: ${peakMult.toFixed(2)}`);

  spawnTimeout = setTimeout(() => {
    spawnOrder();
  }, Math.max(100, finalDelay));
}

// ============================================================
// PEAK HOUR ENGINE
// ============================================================
function scheduleNextPeak() {
  if (!params.peakEnabled) {
    nextPeakAt = 0;
    return;
  }
  const jitter = 0.6 + Math.random() * 0.8;
  nextPeakAt = Date.now() + (params.peakInterval || 45) * 1000 * jitter;
}

function maybeTriggerPeak() {
  if (!running || paused) return;
  
  if (Date.now() < manualPeakUntil) {
    return;
  }
  
  if (!params.peakEnabled || !nextPeakAt) return;

  const now = Date.now();
  if (now >= nextPeakAt && now >= peakUntil) {
    const duration = params.peakDuration || 12;
    peakUntil = now + duration * 1000;

    showToast('Peak hour!', 'peak', 'bolt');
    updateStatusPill();

    const burst = params.peakBurstSize || 0;
    for (let b = 0; b < burst; b++) {
      setTimeout(() => { if (running && !paused) spawnSingleOrder(); }, b * 350);
    }

    scheduleNextSpawn();
    scheduleNextPeak();

    try {
      const channel = new BroadcastChannel('ticket-rail-control');
      channel.postMessage({ type: 'peak-hour', payload: { duration } });
    } catch(e) {}
  }
}

// ============================================================
// MANUAL PEAK
// ============================================================
function triggerManualPeak(duration, burstSize) {
  if (!running || paused) return;
  
  const actualDuration = duration || params.peakDuration || 12;
  const actualBurstSize = burstSize || params.peakBurstSize || 2;
  const actualIntensity = params.peakIntensity || 0.4;
  
  const now = Date.now();
  
  if (manualPeakInterval) {
    clearInterval(manualPeakInterval);
    manualPeakInterval = null;
  }
  
  manualPeakUntil = now + actualDuration * 1000;
  
  showToast(`🔥 Manual Peak! ${actualDuration}s, ${actualBurstSize} bursts`, 'manual-peak', 'bolt');
  updateStatusPill();
  
  for (let b = 0; b < actualBurstSize; b++) {
    setTimeout(() => { 
      if (running && !paused) spawnSingleOrder(); 
    }, b * 200);
  }
  
  manualPeakInterval = setInterval(() => {
    if (!running || paused || Date.now() >= manualPeakUntil) {
      clearInterval(manualPeakInterval);
      manualPeakInterval = null;
      return;
    }
    if (Math.random() < actualIntensity) {
      spawnSingleOrder();
    }
  }, 3000);
  
  if (spawnTimeout) {
    clearTimeout(spawnTimeout);
    scheduleNextSpawn();
  }
  
  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({ 
      type: 'peak-hour', 
      payload: { 
        duration: actualDuration, 
        manual: true, 
        intensity: actualIntensity, 
        burstSize: actualBurstSize,
        peakEnabled: params.peakEnabled
      } 
    });
  } catch(e) {}
  
  setTimeout(() => {
    manualPeakUntil = 0;
    if (manualPeakInterval) {
      clearInterval(manualPeakInterval);
      manualPeakInterval = null;
    }
    updateStatusPill();
    if (spawnTimeout) {
      clearTimeout(spawnTimeout);
      scheduleNextSpawn();
    }
    try {
      const channel = new BroadcastChannel('ticket-rail-control');
      channel.postMessage({ type: 'peak-ended' });
    } catch(e) {}
  }, actualDuration * 1000);
}

// ============================================================
// ORDER PROCESSING
// ============================================================
function processOrderComplete(orderNumber, result) {
  console.log(`Processing order complete: ${orderNumber}`, result);

  const order = activeOrders.find(o =>
      o.orderNo === orderNumber ||
      o.wireOrderNumber === orderNumber ||
      o.orderNo === '#' + String(orderNumber).padStart(2, '0') ||
      o.wireOrderNumber === String(orderNumber).padStart(2, '0')
  );

  if (!order) {
    console.warn(`Order ${orderNumber} not found in active orders`);
    return;
  }

  if (order.completed || order.missed || order.failed) {
    console.log(`Order ${order.orderNo} already processed, skipping`);
    return;
  }

  order.received = true;
  order.validated = true;

  if (result.success) {
    completeOrder(order, result);
  } else {
    failOrder(order, result);
  }
}

function completeOrder(order, result) {
  if (order.missed || order.completed || order.failed) return;
  order.completed = true;

  // ---- Scoring engine (4 layers) ----
  // 1. Base points (already computed at spawn time: basePointsPerSecond × prepTime)
  // 2. Difficulty multiplier (already computed at spawn time from ingredient/step counts)
  // 3. Time factor — rewards speed, floored at minPayoutFraction so a late-but-successful
  //    order is never worth next to nothing
  const now = Date.now();
  const remainingMs = Math.max(0, order.endsAt - now);
  const remainingFrac = Math.max(0, Math.min(1, remainingMs / (order.duration * 1000)));
  const timeFactor = Math.max(params.minPayoutFraction, 0.4 + 0.6 * remainingFrac);

  // 4. Combo multiplier — the volatile "hot streak" layer, applied last.
  //    Increment BEFORE reading so this completion counts toward its own bonus.
  comboStreak += 1;
  const comboMultiplier = getComboMultiplier();

  const earned = Math.max(1, Math.round(order.basePoints * order.difficultyMultiplier * timeFactor * comboMultiplier));
  score += earned;
  served += 1;

  const badge = order.el.querySelector('.status-badge');
  badge.innerHTML = withIcon('check', 'Served');
  badge.className = 'status-badge completed';

  const foot = order.el.querySelector('.ticket-foot .status-text');
  if (foot) {
    foot.innerHTML = withIcon('star', `+${earned} pts`);
    foot.className = 'status-text completed';
  }

  if (result.details && result.details.length > 0) {
    result.details.forEach((detail, idx) => {
      const dot = document.getElementById(`dot-${order.orderNo}-${idx}`);
      if (dot) {
        dot.className = detail.pass ? 'status-dot done' : 'status-dot failed';
      }
    });
  } else {
    order.ingredientList.forEach((_, idx) => {
      const dot = document.getElementById(`dot-${order.orderNo}-${idx}`);
      if (dot) dot.className = 'status-dot done';
    });
  }

  order.el.classList.add('completed');

  showToast(
    comboStreak > 1 ? `+${earned} pts (🔥 x${comboStreak} streak)` : `+${earned} pts`,
    'good',
    'star'
  );
  updateStats();

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({
      type: 'esp-submit-result',
      payload: {
        success: true,
        order_number: order.orderNo,
        food: order.recipe.name,
        score_earned: earned,
        combo_streak: comboStreak,
        details: result.details || []
      }
    });
    channel.postMessage({ type: 'state-report', payload: getState() });
  } catch(e) {}

  setTimeout(() => removeTicket(order), 800);
}

function failOrder(order, result) {
  if (order.missed || order.completed || order.failed) return;
  order.failed = true;
  failed += 1;
  comboStreak = 0; // any fail breaks the streak

  console.log(`Order ${order.orderNo} failed:`, result.message || 'Validation failed');

  const badge = order.el.querySelector('.status-badge');
  badge.innerHTML = withIcon('x', 'Failed');
  badge.className = 'status-badge failed';

  const foot = order.el.querySelector('.ticket-foot .status-text');
  if (foot) {
    const reason = result.message || result.reason || 'Validation failed';
    foot.innerHTML = withIcon('alert', reason);
    foot.className = 'status-text failed';
  }

  if (result.details && result.details.length > 0) {
    result.details.forEach((detail, idx) => {
      const dot = document.getElementById(`dot-${order.orderNo}-${idx}`);
      if (dot) {
        dot.className = detail.pass ? 'status-dot done' : 'status-dot failed';
      }
    });
  } else {
    order.ingredientList.forEach((_, idx) => {
      const dot = document.getElementById(`dot-${order.orderNo}-${idx}`);
      if (dot) dot.className = 'status-dot failed';
    });
  }

  order.el.classList.add('failed');

  showToast('Order failed — streak reset', 'bad', 'x');
  updateStats();

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({
      type: 'esp-submit-result',
      payload: {
        success: false,
        order_number: order.orderNo,
        food: order.recipe.name,
        reason: result.message || 'Validation failed',
        combo_streak: comboStreak,
        details: result.details || []
      }
    });
    channel.postMessage({ type: 'state-report', payload: getState() });
  } catch(e) {}

  setTimeout(() => removeTicket(order), 1500);
}

async function missOrder(order) {
  if (order.missed || order.completed || order.failed) return;

  order.missed = true;
  missed += 1;
  comboStreak = 0; // any miss breaks the streak

  console.log(`Order ${order.orderNo} missed (timed out)`);

  const badge = order.el.querySelector('.status-badge');
  if (badge) {
    badge.innerHTML = withIcon('clock', 'Missed');
    badge.className = 'status-badge missed';
  }

  order.el.classList.add('missed');

  const foot = order.el.querySelector('.ticket-foot .status-text');
  if (foot) {
    foot.innerHTML = withIcon('clock', 'Timed out');
    foot.className = 'status-text missed';
  }

  order.ingredientList.forEach((_, idx) => {
    const dot = document.getElementById(`dot-${order.orderNo}-${idx}`);
    if (dot) dot.className = 'status-dot failed';
  });

  showToast('Order missed — streak reset', 'bad', 'clock');
  updateStats();

  try {
    const response = await fetch('/api/esp/missed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_number: order.wireOrderNumber })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to update missed order');
    }
    console.log(`Order ${order.wireOrderNumber} marked as missed in database`);
  } catch (error) {
    console.error(`Could not mark order ${order.wireOrderNumber} as missed:`, error);
    if (foot) {
      foot.innerHTML = withIcon('alert', 'Missed (update failed)');
    }
  }

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({
      type: 'esp-submit-result',
      payload: {
        success: false,
        result: 'MISSED',
        order_number: order.wireOrderNumber,
        display_order_number: order.orderNo,
        food: order.recipe.name,
        reason: 'Order timed out',
        combo_streak: comboStreak
      }
    });
    channel.postMessage({ type: 'state-report', payload: getState() });
  } catch (error) {
    console.error('Broadcast error:', error);
  }

  setTimeout(() => removeTicket(order), 900);
}

function removeTicket(order) {
  console.log(`Removing ticket ${order.orderNo}`);
  order.el.style.transition = 'opacity 0.3s, transform 0.3s';
  order.el.style.opacity = '0';
  order.el.style.transform = 'translateY(-16px) rotate(var(--tilt))';
  setTimeout(() => {
    order.el.remove();
    activeOrders = activeOrders.filter(o => o !== order);
    console.log(`Ticket ${order.orderNo} removed. ${activeOrders.length} orders remaining`);
    
    if (running && !paused) {
      setTimeout(checkMinOrdersAlways, 100);
    }
    
    if (!activeOrders.length && !running) {
      emptyMsg.style.display = 'block';
      emptyMsg.className = 'empty-rail success';
      emptyMsg.innerHTML = `
        <div class="glyph">${ICONS.ticket}</div>
        <div class="title">${recipes.length} Recipes Ready</div>
        <div class="sub">Start service from the control dashboard</div>
      `;
    }
    if (!activeOrders.length && running) emptyMsg.style.display = 'none';
    updateStats();
  }, 280);
}

// ============================================================
// LEADERBOARD SUBMISSION
// ============================================================
async function submitToLeaderboard(name, score, served, missed, failed) {
  try {
    const response = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.trim(),
        score: score,
        served: served,
        missed: missed,
        failed: failed,
        timestamp: new Date().toISOString()
      })
    });

    const data = await response.json();
    
    if (data.success) {
      showToast('🏆 Score saved to leaderboard!', 'good', 'star');
      console.log('Leaderboard saved:', data);
      return true;
    } else {
      showToast('Failed to save score: ' + (data.message || 'Unknown error'), 'bad', 'x');
      return false;
    }
  } catch (error) {
    console.error('Error submitting to leaderboard:', error);
    showToast('Error saving score. Please try again.', 'bad', 'alert');
    return false;
  }
}

// ============================================================
// HANDLE NAME SUBMISSION
// ============================================================
async function handleScoreSubmit() {
  if (isSubmitting) return;
  
  const nameInput = document.getElementById('playerName');
  const submitBtn = document.getElementById('submitScoreBtn');
  const name = nameInput.value.trim();
  
  if (!name) {
    showToast('Please enter your name', 'info', 'alert');
    nameInput.focus();
    nameInput.style.borderColor = 'var(--tomato)';
    setTimeout(() => {
      nameInput.style.borderColor = '';
    }, 2000);
    return;
  }
  
  if (name.length < 2) {
    showToast('Name must be at least 2 characters', 'info', 'alert');
    nameInput.focus();
    return;
  }
  
  isSubmitting = true;
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Saving...';
  
  const success = await submitToLeaderboard(name, score, served, missed, failed);
  
  if (success) {
    submitBtn.textContent = '✅ Saved!';
    submitBtn.className = 'chef-btn saved';
    nameInput.disabled = true;
    
    // Add view leaderboard link - NOW ABOVE THE NEW SERVICE BUTTON
    const existingLink = document.querySelector('.leaderboard-link');
    if (!existingLink) {
      const link = document.createElement('div');
      link.className = 'leaderboard-link';
      link.style.cssText = 'margin-top: 16px; margin-bottom: 12px;';
      link.innerHTML = `
        <a href="/leaderboards" target="_blank" style="
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--teal-glow);
          font-weight: 700;
          text-decoration: none;
          border: 2px solid var(--teal-glow);
          padding: 10px 20px;
          border-radius: 30px;
          transition: all 0.2s;
          font-size: 14px;
          background: rgba(26,143,140,0.05);
        ">
          🏆 View Full Leaderboard →
        </a>
      `;
      // Insert the link BEFORE the New Service button
      const parent = submitBtn.parentNode;
      parent.insertBefore(link, playAgainBtn);
    }
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = '📤 Try Again';
    submitBtn.className = 'chef-btn';
  }
  
  isSubmitting = false;
}

// ============================================================
// TICK
// ============================================================
function tick() {
  if (!running || paused) return;
  const now = Date.now();

  if (manualPeakUntil > 0 && now >= manualPeakUntil) {
    manualPeakUntil = 0;
    if (manualPeakInterval) {
      clearInterval(manualPeakInterval);
      manualPeakInterval = null;
    }
    updateStatusPill();
    try {
      const channel = new BroadcastChannel('ticket-rail-control');
      channel.postMessage({ type: 'peak-ended' });
    } catch(e) {}
  }

  maybeTriggerPeak();

  for (let i = activeOrders.length - 1; i >= 0; i--) {
    const order = activeOrders[i];
    if (order.missed || order.completed || order.failed) continue;

    const remainingMs = order.endsAt - now;
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    const pct = Math.max(0, Math.min(100, (remainingMs / (order.duration * 1000)) * 100));
    const fill = order.el.querySelector('.heat-fill');
    const timeLeftLabel = order.el.querySelector('.time-left');
    const badge = order.el.querySelector('.status-badge');

    fill.style.width = pct + '%';
    if (remainingMs <= 0) {
      missOrder(order);
    } else {
      timeLeftLabel.textContent = remainingSec + 's';
      if (pct > 50) {
        fill.style.background = 'var(--herb)';
        if (!order.received) {
          badge.className = 'status-badge waiting';
          badge.innerHTML = withIcon('clock', 'Waiting');
        }
      } else if (pct > 20) {
        fill.style.background = 'var(--butter)';
        if (!order.received) {
          badge.className = 'status-badge cooking';
          badge.innerHTML = withIcon('flame', 'Cooking');
        }
      } else {
        fill.style.background = 'var(--tomato)';
        if (!order.received) {
          badge.className = 'status-badge late';
          badge.innerHTML = withIcon('alert', 'Almost late');
        }
      }
    }
  }

  const activeCount = activeOrders.filter(o => !o.missed && !o.completed && !o.failed).length;
  const timeMultiplier = 1 + (activeCount - params.concurrencyMin) * 0.05;
  const clampedMultiplier = Math.max(0.5, Math.min(2, timeMultiplier));

  serviceRemaining -= clampedMultiplier;
  updateServiceClock();

  if (serviceRemaining <= 0) endService('time-up');
  updateStats();
  updateStatusPill();

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({
      type: 'orders-snapshot',
      payload: activeOrders
        .filter(o => !o.missed && !o.completed && !o.failed)
        .map(o => ({
          orderNo: o.orderNo,
          dish: o.recipe.name,
          remaining: Math.max(0, Math.ceil((o.endsAt - Date.now()) / 1000)),
          status: o.received ? 'validating' : 'waiting'
        }))
    });
  } catch(e) {}
}

// ============================================================
// SERVICE LIFECYCLE
// ============================================================
function startService() {
  if (running) return;

  if (!recipesLoaded) {
    statusMsg.innerHTML = withIcon('clock', 'Please wait for recipes to load...');
    statusMsg.className = 'status-msg';
    return;
  }

  if (recipes.length === 0) {
    statusMsg.innerHTML = withIcon('alert', 'No recipes available. Reload the page.');
    statusMsg.className = 'status-msg error';
    return;
  }

  if (serviceRemaining <= 0) {
    resetService().then(() => setTimeout(() => startService(), 100));
    return;
  }

  running = true;
  paused = false;
  pauseStartedAt = null;
  manualPeakUntil = 0;
  if (manualPeakInterval) {
    clearInterval(manualPeakInterval);
    manualPeakInterval = null;
  }
  emptyMsg.style.display = 'none';
  statusMsg.innerHTML = withIcon('flame', "Kitchen's open — fire those tickets!");
  statusMsg.className = 'status-msg success';
  updateStatusPill();

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({ type: 'game-started' });
    channel.postMessage({ type: 'state-report', payload: getState() });
  } catch(e) {}

  startMinOrdersMonitoring();

  scheduleNextPeak();
  scheduleNextSpawn();
  mainTickInterval = setInterval(tick, 1000);
  
  setTimeout(() => { 
    if (running && !paused) {
      spawnOrder();
      setTimeout(checkMinOrdersAlways, 500);
    }
  }, 400);
}

function togglePause() {
  if (!running) return;
  paused = !paused;

  if (paused) {
    pauseStartedAt = Date.now();
    if (spawnTimeout) clearTimeout(spawnTimeout);
    stopMinOrdersMonitoring();
    if (manualPeakInterval) {
      clearInterval(manualPeakInterval);
      manualPeakInterval = null;
    }
  } else if (pauseStartedAt) {
    const pausedMs = Date.now() - pauseStartedAt;
    activeOrders.forEach(o => { o.endsAt += pausedMs; });
    if (peakUntil) peakUntil += pausedMs;
    if (nextPeakAt) nextPeakAt += pausedMs;
    if (manualPeakUntil) manualPeakUntil += pausedMs;
    pauseStartedAt = null;
    startMinOrdersMonitoring();
    if (manualPeakUntil > Date.now()) {
      const remaining = (manualPeakUntil - Date.now()) / 1000;
      const intensity = params.peakIntensity || 0.4;
      manualPeakInterval = setInterval(() => {
        if (!running || paused || Date.now() >= manualPeakUntil) {
          clearInterval(manualPeakInterval);
          manualPeakInterval = null;
          return;
        }
        if (Math.random() < intensity) {
          spawnSingleOrder();
        }
      }, 3000);
    }
  }

  statusMsg.innerHTML = paused ? withIcon('pause', 'Paused — take a break') : withIcon('flame', 'Back to work');
  statusMsg.className = 'status-msg';
  updateStatusPill();

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({ type: 'game-paused', payload: { paused } });
    channel.postMessage({ type: 'state-report', payload: getState() });
  } catch(e) {}

  if (!paused) {
    scheduleNextSpawn();
    setTimeout(checkMinOrdersAlways, 500);
  }
}

function endService(reason) {
  running = false;
  paused = false;
  pauseStartedAt = null;
  manualPeakUntil = 0;
  if (manualPeakInterval) {
    clearInterval(manualPeakInterval);
    manualPeakInterval = null;
  }
  if (spawnTimeout) clearTimeout(spawnTimeout);
  if (mainTickInterval) clearInterval(mainTickInterval);
  stopMinOrdersMonitoring();
  peakUntil = 0;
  nextPeakAt = 0;
  statusMsg.innerHTML = withIcon('check', 'Service complete — nice work, chef');
  statusMsg.className = 'status-msg';
  updateStatusPill();

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({ type: 'state-report', payload: getState() });
  } catch(e) {}

  showGameOver();
}

async function resetService() {
  running = false;
  paused = false;
  pauseStartedAt = null;
  manualPeakUntil = 0;
  comboStreak = 0;
  if (manualPeakInterval) {
    clearInterval(manualPeakInterval);
    manualPeakInterval = null;
  }
  if (spawnTimeout) clearTimeout(spawnTimeout);
  if (mainTickInterval) clearInterval(mainTickInterval);
  stopMinOrdersMonitoring();
  activeOrders.forEach(o => o.el.remove());
  activeOrders = [];
  score = 0; served = 0; missed = 0; failed = 0;
  serviceRemaining = totalServiceTime;
  orderCounter = 0;
  peakUntil = 0;
  nextPeakAt = 0;

  // Reset leaderboard UI state
  const submitBtn = document.getElementById('submitScoreBtn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '📤 Save Score';
    submitBtn.className = 'chef-btn';
  }
  
  const nameInput = document.getElementById('playerName');
  if (nameInput) {
    nameInput.disabled = false;
    nameInput.value = '';
    nameInput.style.borderColor = '';
  }
  
  const existingLink = document.querySelector('.leaderboard-link');
  if (existingLink) {
    existingLink.remove();
  }
  
  isSubmitting = false;

  statusMsg.innerHTML = withIcon('refresh', 'Clearing previous orders...');
  statusMsg.className = 'status-msg';

  try {
    const res = await fetch('/api/orders/clear', { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      console.warn('/api/orders/clear did not report success:', data);
    } else {
      console.log(`Server cleared ${data.orders_cleared} old orders, tags reset`);
    }
  } catch (err) {
    console.error('Failed to clear orders on the server before resetting:', err);
    statusMsg.innerHTML = withIcon('alert', 'Could not reach server to clear old orders — a new service may fail on the first submit.');
    statusMsg.className = 'status-msg error';
  }

  if (recipesLoaded && recipes.length > 0) {
    emptyMsg.style.display = 'block';
    emptyMsg.className = 'empty-rail success';
    emptyMsg.innerHTML = `
      <div class="glyph">${ICONS.ticket}</div>
      <div class="title">${recipes.length} Recipes Ready</div>
      <div class="sub">Start service from the control dashboard</div>
    `;
  }

  statusMsg.innerHTML = withIcon('check', 'Ready for a new service');
  statusMsg.className = 'status-msg';
  updateServiceClock();
  updateStats();
  updateStatusPill();
  overlay.classList.remove('show');

  try {
    const channel = new BroadcastChannel('ticket-rail-control');
    channel.postMessage({ type: 'game-reset' });
    channel.postMessage({ type: 'state-report', payload: getState() });
  } catch(e) {}
}

function showGameOver() {
  document.getElementById('ovScore').textContent = score;
  document.getElementById('ovServed').textContent = served;
  document.getElementById('ovMissed').textContent = missed;
  document.getElementById('ovFailed').textContent = failed;
  
  const ratio = served / Math.max(1, served + missed + failed);
  let starCount = 0;
  if (ratio >= 0.9 && missed <= 1) starCount = 3;
  else if (ratio >= 0.7) starCount = 2;
  else if (ratio >= 0.4) starCount = 1;
  const starsEl = document.getElementById('overlayStars');
  starsEl.innerHTML = [0,1,2].map(i => `<span class="icon${i < starCount ? ' filled' : ''}">${i < starCount ? ICONS.star : ICONS.starOutline}</span>`).join('');
  
  // Clear previous name input
  const nameInput = document.getElementById('playerName');
  if (nameInput) {
    nameInput.value = '';
    nameInput.disabled = false;
    nameInput.style.borderColor = '';
    setTimeout(() => nameInput.focus(), 400);
  }
  
  const submitBtn = document.getElementById('submitScoreBtn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '📤 Save Score';
    submitBtn.className = 'chef-btn';
  }
  
  const existingLink = document.querySelector('.leaderboard-link');
  if (existingLink) {
    existingLink.remove();
  }
  
  isSubmitting = false;
  
  overlay.classList.add('show');
}

playAgainBtn.addEventListener('click', function() {
  // Reset leaderboard UI state
  const submitBtn = document.getElementById('submitScoreBtn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '📤 Save Score';
    submitBtn.className = 'chef-btn';
  }
  
  const nameInput = document.getElementById('playerName');
  if (nameInput) {
    nameInput.disabled = false;
    nameInput.value = '';
    nameInput.style.borderColor = '';
  }
  
  const existingLink = document.querySelector('.leaderboard-link');
  if (existingLink) {
    existingLink.remove();
  }
  
  isSubmitting = false;
  
  resetService();
});

// ============================================================
// SSE CONNECTION
// ============================================================
let sseConnected = false;
let sseRetryCount = 0;
const maxSSERetries = 10;

function connectSSE() {
  console.log('Connecting to SSE stream at /api/events...');

  try {
    const sse = new EventSource('/api/events');

    sse.onopen = function(event) {
      console.log('SSE connection established');
      sseConnected = true;
      sseRetryCount = 0;
      statusMsg.innerHTML = withIcon('wifi', 'Connected to kitchen');
      statusMsg.className = 'status-msg success';
    };

    sse.onmessage = function(event) {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (error) {
        console.error('Error parsing SSE message:', error, event.data);
      }
    };

    sse.onerror = function(error) {
      console.error('SSE error:', error);
      sseConnected = false;

      if (sse.readyState === EventSource.CLOSED) {
        console.log('SSE connection closed');
        if (sseRetryCount < maxSSERetries) {
          sseRetryCount++;
          console.log(`SSE reconnecting (attempt ${sseRetryCount}/${maxSSERetries})...`);
          setTimeout(connectSSE, 3000 * sseRetryCount);
        } else {
          statusMsg.innerHTML = withIcon('alert', 'Connection lost. Please refresh the page.');
          statusMsg.className = 'status-msg error';
        }
      }
    };

    window.sseConnection = sse;

  } catch (error) {
    console.error('Failed to create SSE connection:', error);
    setTimeout(connectSSE, 5000);
  }
}

// ============================================================
// MESSAGE HANDLER
// ============================================================
function handleMessage(msg) {
  switch (msg.type) {
    case 'params': {
      const oldTotalTime = totalServiceTime;
      if (msg.payload.spawnMin !== undefined) params.spawnMin = msg.payload.spawnMin;
      if (msg.payload.spawnMax !== undefined) params.spawnMax = msg.payload.spawnMax;
      if (msg.payload.prepTime !== undefined) params.prepTime = msg.payload.prepTime;
      if (msg.payload.rampFactor !== undefined) params.rampFactor = msg.payload.rampFactor;
      if (msg.payload.concurrencyMin !== undefined) params.concurrencyMin = msg.payload.concurrencyMin;
      if (msg.payload.concurrencyMax !== undefined) params.concurrencyMax = msg.payload.concurrencyMax;
      if (msg.payload.chaos !== undefined) params.chaos = msg.payload.chaos;
      if (msg.payload.minOrdersAlways !== undefined) {
        params.minOrdersAlways = msg.payload.minOrdersAlways;
        if (running && !paused) {
          setTimeout(checkMinOrdersAlways, 200);
        }
      }

      // Ticket display toggles
      if (msg.payload.showIngredients !== undefined) params.showIngredients = msg.payload.showIngredients;
      if (msg.payload.showIngredientSteps !== undefined) params.showIngredientSteps = msg.payload.showIngredientSteps;

      // Scoring engine weights
      if (msg.payload.basePointsPerSecond !== undefined) params.basePointsPerSecond = msg.payload.basePointsPerSecond;
      if (msg.payload.difficultyIngredientWeight !== undefined) params.difficultyIngredientWeight = msg.payload.difficultyIngredientWeight;
      if (msg.payload.difficultyStepWeight !== undefined) params.difficultyStepWeight = msg.payload.difficultyStepWeight;
      if (msg.payload.minPayoutFraction !== undefined) params.minPayoutFraction = msg.payload.minPayoutFraction;
      if (msg.payload.comboMultiplierStep !== undefined) params.comboMultiplierStep = msg.payload.comboMultiplierStep;
      if (msg.payload.comboMaxMultiplier !== undefined) params.comboMaxMultiplier = msg.payload.comboMaxMultiplier;

      const peakWasEnabled = params.peakEnabled;
      if (msg.payload.peakEnabled !== undefined) params.peakEnabled = msg.payload.peakEnabled;
      if (msg.payload.peakInterval !== undefined) params.peakInterval = msg.payload.peakInterval;
      if (msg.payload.peakDuration !== undefined) params.peakDuration = msg.payload.peakDuration;
      if (msg.payload.peakIntensity !== undefined) params.peakIntensity = msg.payload.peakIntensity;
      if (msg.payload.peakBurstSize !== undefined) params.peakBurstSize = msg.payload.peakBurstSize;

      if (params.peakEnabled && !peakWasEnabled && running && !paused) {
        scheduleNextPeak();
      }
      if (!params.peakEnabled) {
        peakUntil = 0;
        nextPeakAt = 0;
      }

      if (msg.payload.totalTime !== undefined) {
        totalServiceTime = msg.payload.totalTime;
        if (!running && serviceRemaining <= 0) {
          serviceRemaining = totalServiceTime;
        } else if (running && totalServiceTime !== oldTotalTime) {
          const ratio = serviceRemaining / oldTotalTime;
          serviceRemaining = Math.min(totalServiceTime, Math.max(0, totalServiceTime * ratio));
        }
      }
      updateServiceClock();
      statusMsg.innerHTML = withIcon('bolt', `Kitchen updated (min orders: ${params.minOrdersAlways})`);
      statusMsg.className = 'status-msg success';
      if (running && !paused && spawnTimeout) {
        clearTimeout(spawnTimeout);
        scheduleNextSpawn();
      }
      console.log('Params updated:', params);
      break;
    }

    case 'start':
      startService();
      break;

    case 'pause':
      togglePause();
      break;

    case 'reset':
      resetService();
      break;

    case 'force-spawn':
      if (running && !paused) {
        spawnSingleOrder();
      } else {
        try {
          const channel = new BroadcastChannel('ticket-rail-control');
          channel.postMessage({
            type: 'force-spawn-rejected',
            payload: { reason: !running ? 'not-running' : 'paused' }
          });
        } catch(e) {}
      }
      break;

    case 'force-peak':
    case 'manual-peak':
      if (running && !paused) {
        const duration = msg.payload?.duration || params.peakDuration || 12;
        const burstSize = msg.payload?.burstSize || params.peakBurstSize || 2;
        triggerManualPeak(duration, burstSize);
      }
      break;

    case 'state':
      try {
        const channel = new BroadcastChannel('ticket-rail-control');
        channel.postMessage({ type: 'state-report', payload: getState() });
      } catch(e) {}
      break;

    case 'esp-order-complete': {
      const payload = msg.payload;
      if (payload.order_number) {
        processOrderComplete(payload.order_number, payload);
      }
      break;
    }

    case 'esp-submit-result':
      break;

    case 'order-missed': {
      const missPayload = msg.payload;
      if (missPayload.order_number) {
        const orderToRemove = activeOrders.find(o =>
          o.wireOrderNumber === missPayload.order_number ||
          o.orderNo === missPayload.order_number ||
          o.orderNo === '#' + String(missPayload.order_number).padStart(2, '0')
        );
        if (orderToRemove && !orderToRemove.missed && !orderToRemove.completed && !orderToRemove.failed) {
          orderToRemove.missed = true;
          missed += 1;
          comboStreak = 0;
          const badge = orderToRemove.el.querySelector('.status-badge');
          if (badge) {
            badge.innerHTML = withIcon('clock', 'Missed');
            badge.className = 'status-badge missed';
          }
          orderToRemove.el.classList.add('missed');
          showToast('Order missed', 'bad', 'clock');
          updateStats();
          setTimeout(() => removeTicket(orderToRemove), 900);
        }
      }
      break;
    }

    case 'orders-cleared':
      break;

    case 'server-log':
      break;

    case 'connected':
      break;

    default:
      console.log('Unknown message type:', msg.type);
  }
}

// ============================================================
// BROADCAST CHANNEL
// ============================================================
const channel = new BroadcastChannel('ticket-rail-control');

channel.onmessage = (event) => {
  const msg = event.data;
  if (!msg) return;
  handleMessage(msg);
};

// ============================================================
// INIT
// ============================================================
async function init() {
  await resetService();
  statusMsg.innerHTML = withIcon('refresh', 'Loading recipes from kitchen...');
  statusMsg.className = 'status-msg';
  controllerStatus.innerHTML = withIcon('refresh', 'Loading...');

  await loadRecipesFromDB();

  if (recipesLoaded && recipes.length > 0) {
    updateStatusPill();
  }

  // Setup leaderboard submit button
  const submitBtn = document.getElementById('submitScoreBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleScoreSubmit);
  }

  // Setup enter key for name input
  const nameInput = document.getElementById('playerName');
  if (nameInput) {
    nameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleScoreSubmit();
      }
    });
  }

  setTimeout(() => {
    connectSSE();
  }, 1000);

  try {
    channel.postMessage({ type: 'game-ready' });
  } catch(e) {}

  console.log('Overcooked Ticket Rail ready (controls live on /game/settings)');
}

window.addEventListener('beforeunload', function() {
  if (window.sseConnection) {
    console.log('Closing SSE connection');
    window.sseConnection.close();
  }
});

init();