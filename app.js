const tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = "https://YOUR-API-URL"; // <-- ԴԻՐ ՔՈ API URL-ը (որտեղ bot.py / Flask-ը աշխատում է)

let state = null;
let selectedPlanId = null;

const navButtons = document.querySelectorAll("#nav button");
const tabs = document.querySelectorAll(".tab");
const userLabel = document.getElementById("user-label");

// ========= helpers =========

function switchTab(tab) {
  tabs.forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");

  navButtons.forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`#nav button[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");
}

navButtons.forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

switchTab("dashboard");

function showToast(msg) {
  if (tg.showAlert) {
    tg.showAlert(msg);
  } else {
    alert(msg);
  }
}

function getUser() {
  if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) return null;
  return tg.initDataUnsafe.user;
}

async function apiPost(path, payload) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload || {})
  });
  return await res.json();
}

// ========= state / UI =========

function renderState() {
  if (!state) return;

  document.getElementById("balance-label").textContent =
    state.balance.toFixed(4);
  document.getElementById("profit-label").textContent =
    state.total_profit.toFixed(4);
  document.getElementById("withdrawn-label").textContent =
    state.total_withdrawn.toFixed(4);

  document.getElementById("withdraw-balance").textContent =
    state.balance.toFixed(4);
  document.getElementById("min-withdraw-label").textContent =
    state.min_withdraw.toFixed(4);

  document.getElementById("wallet-current").textContent =
    state.ton_wallet || "not linked";

  // partners
  document.getElementById("ref-count").textContent =
    state.referrals.count || 0;

  const appUser = getUser();
  if (appUser) {
    const botUsername = tg.initDataUnsafe?.receiver?.username ||
      tg.initDataUnsafe?.chat?.username || "your_bot";
    const refLink =
      `https://t.me/${botUsername}?start=ref_${appUser.id}`;
    document.getElementById("ref-link").textContent = refLink;
  }

  // plans
  const plansList = document.getElementById("plans-list");
  plansList.innerHTML = "";
  state.plans.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <b>${p.name}</b><br>
      <span class="muted small">
        ${p.daily_percent}% / day · ${p.duration_days} days<br>
        Min: ${p.min_amount} · Max: ${p.max_amount} TON
      </span>
      <button class="secondary plan-select-btn" data-id="${p.id}">
        Select this plan
      </button>
    `;
    plansList.appendChild(card);
  });

  document.querySelectorAll(".plan-select-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedPlanId = Number(btn.dataset.id);
      const plan = state.plans.find(p => p.id === selectedPlanId);
      document.getElementById("selected-plan-label").textContent =
        plan
          ? `${plan.name} · ${plan.daily_percent}% / day · ${plan.duration_days} days`
          : "None";
      switchTab("deposits");
    });
  });

  // deposits
  const depsList = document.getElementById("deposits-list");
  depsList.innerHTML = "";
  if (!state.deposits.length) {
    const empty = document.createElement("p");
    empty.className = "muted small";
    empty.textContent = "You have no deposits yet.";
    depsList.appendChild(empty);
  } else {
    state.deposits.forEach(d => {
      const card = document.createElement("div");
      card.className = "card";
      const dt = new Date(d.created_at * 1000);
      card.innerHTML = `
        <b>${d.plan_name || "Plan #" + d.plan_id}</b><br>
        Amount: <b>${d.amount}</b> TON<br>
        ${d.daily_percent}% / day · ${d.duration_days} days<br>
        Status: <span class="muted">${d.status}</span><br>
        <span class="small muted">${dt.toLocaleString()}</span>
      `;
      depsList.appendChild(card);
    });
  }
}

async function bootstrap() {
  const u = getUser();
  if (!u) {
    userLabel.textContent = "Not inside Telegram WebApp";
    return;
  }

  userLabel.textContent = "@" + (u.username || u.id);

  try {
    const res = await apiPost("/api/bootstrap", {
      tg_id: u.id,
      username: u.username,
      first_name: u.first_name
    });

    if (!res.ok) {
      showToast("Bootstrap error: " + (res.error || "unknown"));
      return;
    }

    state = res.state;
    renderState();
  } catch (e) {
    console.error(e);
    showToast("Failed to connect to API.");
  }
}

// ========= actions =========

// quick buttons on dashboard
document.getElementById("btn-open-deposit")
  .addEventListener("click", () => switchTab("deposits"));
document.getElementById("btn-open-withdraw")
  .addEventListener("click", () => switchTab("withdraw"));

// save wallet
document.getElementById("btn-save-wallet").addEventListener("click", async () => {
  const u = getUser();
  if (!u) return;
  const wallet = document.getElementById("wallet-input").value.trim();
  if (!wallet || wallet.length < 10) {
    showToast("Enter valid TON wallet.");
    return;
  }

  const res = await apiPost("/api/set_wallet", {
    tg_id: u.id,
    wallet
  });

  if (!res.ok) {
    showToast("Error: " + (res.error || "wallet not saved"));
    return;
  }

  showToast("Wallet saved.");
  await refreshState();
});

// disconnect wallet
document.getElementById("btn-disconnect-wallet").addEventListener("click", async () => {
  const u = getUser();
  if (!u) return;

  const res = await apiPost("/api/disconnect_wallet", {tg_id: u.id});
  if (!res.ok) {
    showToast("Error: " + (res.error || "cannot disconnect"));
    return;
  }
  showToast("Wallet disconnected.");
  await refreshState();
});

// create deposit
document.getElementById("btn-create-deposit").addEventListener("click", async () => {
  const u = getUser();
  if (!u) return;

  if (!selectedPlanId) {
    showToast("Select a plan first.");
    return;
  }

  const amount = Number(document.getElementById("deposit-amount").value);
  if (!amount || amount <= 0) {
    showToast("Enter deposit amount.");
    return;
  }

  const res = await apiPost("/api/create_deposit", {
    tg_id: u.id,
    plan_id: selectedPlanId,
    amount
  });

  if (!res.ok) {
    showToast("Error: " + (res.error || "deposit not created"));
    return;
  }

  showToast(
    "Deposit created.\nNow send TON to platform wallet:\n" +
    state.platform_wallet
  );
  await refreshState();
});

// withdraw
document.getElementById("btn-send-withdraw").addEventListener("click", async () => {
  const u = getUser();
  if (!u) return;

  const amount = Number(document.getElementById("withdraw-amount").value);
  if (!amount || amount <= 0) {
    showToast("Enter withdraw amount.");
    return;
  }

  const res = await apiPost("/api/create_withdraw", {
    tg_id: u.id,
    amount
  });

  if (!res.ok) {
    if (res.error === "no_wallet") showToast("Set TON wallet first.");
    else if (res.error === "too_small") showToast("Amount below minimum.");
    else if (res.error === "not_enough") showToast("Not enough balance.");
    else showToast("Error: " + res.error);
    return;
  }

  showToast("Withdraw request created. Admin will process it.");
  document.getElementById("withdraw-amount").value = "";
  await refreshState();
});

// copy ref link
document.getElementById("btn-copy-ref").addEventListener("click", async () => {
  const link = document.getElementById("ref-link").textContent.trim();
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    showToast("Referral link copied.");
  } catch (e) {
    showToast("Copy failed, copy manually:\n" + link);
  }
});

async function refreshState() {
  const u = getUser();
  if (!u) return;
  const res = await apiPost("/api/state", {tg_id: u.id});
  if (!res.ok) {
    showToast("Failed to refresh state.");
    return;
  }
  state = res.state;
  renderState();
}

// ======== init ========
bootstrap();
