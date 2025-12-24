const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let USERNAME = "Player";
let domitBalance = 0;
let socket = null;

let activeBotSession = null;
let selectedTableId = null;

// ================= HELPERS =================

function getUidFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid"));
}

function updateBalances() {
  document.getElementById("domit-balance").textContent = domitBalance.toFixed(2);
}

function showStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.classList.remove("win", "lose");
  if (type) el.classList.add(type);
}

// ================= LOAD USER =================

async function loadUser() {
  try {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    if (js.ok) {
      domitBalance = js.user.balance_usd || 0;
      USERNAME = js.user.username || `user_${USER_ID}`;
      updateBalances();
      loadTables();
    } else {
      showStatus("❌ Не удалось выполнить балансировку нагрузки.");
    }
  } catch (e) {
    console.log("loadUser error", e);
    showStatus("❌ Ошибка сервера");
  }
}

// ================= WEBSOCKET =================

function connectWebSocket() {
  socket = io(API);

  socket.on("connect", () => {
    console.log("✅ WebSocket connected");
    socket.emit("join_duels", { user_id: USER_ID });
  });

  socket.on("update_online_count", (data) => {
    const el = document.getElementById("online-count");
    if (el) {
      el.textContent = data.count;
    }
  });

  socket.on("table_joined", (data) => {
    showStatus(`✅ К вашему столику кто-то присоединился.`);
    
    setTimeout(() => {
      window.location.href = `${API}/duels/tictactoe/tictactoe.html?table_id=${data.table_id}&uid=${USER_ID}`;
    }, 1000);
  });

  socket.on("opponent_move", (data) => {
    console.log("Opponent made a move", data);
  });

  socket.on("game_over", (data) => {
    console.log("Game over", data);
  });
}

// ================= LOAD TABLES =================

async function loadTables() {
  try {
    const r = await fetch(`${API}/api/duels/get-tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_type: "tictactoe" })
    });

    const js = await r.json();
    if (js.success) {
        renderTables(js.tables); 
    }
  } catch (e) {
    console.log("loadTables error", e);
  }
}

function renderTables(tables) {
  const container = document.getElementById("tables-list");

  if (!tables || tables.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎮</span>
        <p>Нет активных таблиц</p>
        <p class="empty-hint">Создайте первую таблицу։</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tables
    .map((t) => {
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - t.created_at;
      const timeLeft = Math.max(0, 300 - elapsed);
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;

      return `
        <div class="table-card" onclick="openJoinModal(${t.id}, '${t.creator}', ${t.bet})">
          <div class="table-game-icon">❌⭕</div>
          <div class="table-info">
            <div class="table-game-name">Tic-Tac-Toe</div>
            <div class="table-creator">Создатель՝ ${t.creator}</div>
          </div>
          <div style="text-align: right;">
            <div class="table-bet">${t.bet} DOMIT</div>
            <div class="table-timer">${minutes}:${seconds.toString().padStart(2, "0")}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

// ================= BOT GAME =================

async function playBotGame(game) {
  if (activeBotSession && activeBotSession.game === game) {
    window.location.href = `${API}/duels/${game}/${game}.html?uid=${USER_ID}`;
    return;
  }

  if (domitBalance < 2) {
    return showStatus("❌ У вас его нет. 2 DOMIT։", "lose");
  }

  try {
    const r = await fetch(`${API}/api/duels/pay-bot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, game })
    });

    const js = await r.json();
    if (!js.success) {
      return showStatus(`❌ ${js.message}`, "lose");
    }

    domitBalance = js.new_balance;
    updateBalances();

    activeBotSession = { game, paid: true };

    window.location.href = `${API}/duels/${game}/${game}.html?uid=${USER_ID}`;
  } catch (e) {
    console.log("payBot error", e);
    showStatus("❌ Ошибка сервера", "lose");
  }
}

// ================= CREATE TABLE =================

function openCreateTableModal() {
  document.getElementById("bet-amount").value = "";
  document.getElementById("create-error").textContent = "";
  document.getElementById("create-modal").classList.remove("hidden");
}

function closeCreateTableModal() {
  document.getElementById("create-modal").classList.add("hidden");
}

async function confirmCreateTable() {
  const game_type = document.getElementById("game-type").value;
  const bet = Number(document.getElementById("bet-amount").value);

  if (!bet || bet <= 0) {
    document.getElementById("create-error").textContent = "Напишите правильную сумму։";
    return;
  }

  if (bet > domitBalance) {
    document.getElementById("create-error").textContent = "У тебя не так уж много. DOMIT։";
    return;
  }

  closeCreateTableModal();

  try {
    const r = await fetch(`${API}/api/duels/create-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, game_type, bet })
    });

    const js = await r.json();
    if (!js.success) {
      return showStatus(`❌ ${js.message}`, "lose");
    }

    domitBalance = js.new_balance;
    updateBalances();

    showStatus(`✅ Всё готово. Ждём соперника.…`);

    // Reload tables
    if (js.success) {
        window.location.href = `/webapp/portal/duels/tictactoe/tictactoe.html?table_id=${js.table_id}&uid=${USER_ID}`;
    }

  } catch (e) {
    console.log("createTable error", e);
    showStatus("❌ Ошибка сервера", "lose");
  }
}

// ================= JOIN TABLE =================

function openJoinModal(tableId, creator, bet) {
  selectedTableId = tableId;

  document.getElementById("join-game-type").textContent = "❌⭕ Tic-Tac-Toe";
  document.getElementById("join-bet").textContent = bet;
  document.getElementById("join-creator").textContent = creator;
  document.getElementById("join-error").textContent = "";

  document.getElementById("join-modal").classList.remove("hidden");
}

function closeJoinModal() {
  document.getElementById("join-modal").classList.add("hidden");
  //selectedTableId = null;
}

async function confirmJoinTable() {
  if (!selectedTableId) return;

  closeJoinModal();

  try {
    const r = await fetch(`${API}/api/duels/join-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: Number(USER_ID),
        table_id: Number(selectedTableId)
      })
    });

    const js = await r.json();
    if (js.success) {
        window.location.href = `/webapp/portal/duels/tictactoe/tictactoe.html?table_id=${selectedTableId}&uid=${USER_ID}`;
    } else {
       
        let msg = js.message;
        if (msg === "ERR_NOT_FOUND") msg = "Таблица не найдена";
        if (msg === "ERR_OCCUPIED") msg = "За столом много посетителей.";
        return showStatus(`❌ ${msg}`, "lose");
    }

    domitBalance = js.new_balance;
    updateBalances();

    showStatus("✅ Вы присоединились к столу. Игра начинается.…");

    setTimeout(() => {
      window.location.href = `${API}/duels/tictactoe/tictactoe.html?table_id=${selectedTableId}&uid=${USER_ID}`;
    }, 1000);

  } catch (e) {
    console.log("joinTable error", e);
    showStatus("❌ Ошибка сервера", "lose");
  }
}

// ================= BACK =================

function goBack() {
  window.location.replace(`${API}/portal/portal.html?uid=${USER_ID}&viewer=${USER_ID}&t=${Date.now()}`);
}

// ================= INIT =================

window.onload = () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  loadUser();
  connectWebSocket();
  
  // Refresh tables every 5 seconds
  setInterval(loadTables, 5000);
};

window.onbeforeunload = () => {
  if (socket) socket.disconnect();
};