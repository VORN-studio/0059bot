const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

if (tg) {
  tg.expand();
}

const navButtons = document.querySelectorAll("#nav button");
const tabs = document.querySelectorAll(".tab");
const userLabel = document.getElementById("user-label");

function switchTab(tabName) {
  tabs.forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + tabName).classList.add("active");

  navButtons.forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`#nav button[data-tab="${tabName}"]`);
  if (activeBtn) activeBtn.classList.add("active");
}

navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    switchTab(tab);
  });
});

// initial
switchTab("account");

// Show user info in header (from Telegram)
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
  const u = tg.initDataUnsafe.user;
  const name = u.username ? "@" + u.username : (u.first_name || "User");
  userLabel.textContent = name;
} else {
  userLabel.textContent = "Opened outside Telegram";
}

// Buttons:

// Save wallet
document.getElementById("btn-save-wallet").addEventListener("click", () => {
  const w = document.getElementById("wallet-input").value.trim();
  if (!w || w.length < 16) {
    alert("Please enter a valid TON wallet.");
    return;
  }

  if (!tg) {
    alert("Not in Telegram WebApp.");
    return;
  }

  tg.sendData(JSON.stringify({
    action: "set_wallet",
    wallet: w
  }));

  alert("Wallet is sent to bot. Check chat for confirmation.");
});

// Disconnect wallet
document.getElementById("btn-disconnect-wallet").addEventListener("click", () => {
  if (!tg) {
    alert("Not in Telegram WebApp.");
    return;
  }

  tg.sendData(JSON.stringify({
    action: "disconnect_wallet"
  }));

  alert("Disconnect request sent. Check bot chat.");
});

// Withdraw
document.getElementById("btn-send-withdraw").addEventListener("click", () => {
  const amount = Number(document.getElementById("withdraw-amount").value);
  if (!amount || amount <= 0) {
    alert("Enter valid amount of coins.");
    return;
  }

  if (!tg) {
    alert("Not in Telegram WebApp.");
    return;
  }

  tg.sendData(JSON.stringify({
    action: "withdraw",
    amount: amount
  }));

  alert("Withdraw request sent to bot. Check chat.");
});
