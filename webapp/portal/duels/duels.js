const tg = window.Telegram && window.Telegram.WebApp;
const API = window.location.origin;

let USER_ID = null;
let USERNAME = "Player";
let domitBalance = 0;
let socket = null;

let activeBotSession = null; // { game: "tictactoe", paid: true }
let selectedTableId = null; // join modal-ի համար

// ================= HELPERS =================

function getUidFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return Number(p.get("uid"));
}

function updateBalances() {
  document.getElementById("domit-balance").textContent = domitBalance;
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
    } else {
      showStatus("❌ Չհաջողվեց բեռնել բալանսը");
    }
  } catch (e) {
    console.log("loadUser error", e);
    showStatus("❌ Սերվերի սխալ");
  }
}

// ================= WEBSOCKET =================

function connectWebSocket() {
  socket = io(API);

  socket.on("connect", () => {
    console.log("✅ WebSocket connected");
    socket.emit("join_duels", { user_id: USER_ID, username: USERNAME });
  });

  socket.on("tables_update", (data) => {
    renderTables(data.tables);
  });

  socket.on("online_count", (data) => {
    document.getElementById("online-count").textContent = data.count;
  });

  socket.on("table_closed", (data) => {
    showStatus(`Սեղան #${data.table_id} փակվեց։`);
  });

  socket.on("game_started", (data) => {
    // Redirect դեպի խաղի էջ
    window.location.href = `${API}/duels/game?table_id=${data.table_id}&uid=${USER_ID}`;
  });

  socket.on("error", (data) => {
    showStatus(`❌ ${data.message}`, "lose");
  });
}

function renderTables(tables) {
  const container = document.getElementById("tables-list");

  if (!tables || tables.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎮</span>
        <p>Ակտիվ սեղաններ չկան</p>
        <p class="empty-hint">Ստեղծիր առաջին սեղանը։</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tables
    .map((t) => {
      const gameIcon = t.game === "tictactoe" ? "❌⭕" : "🎮";
      const gameName = t.game === "tictactoe" ? "Tic-Tac-Toe" : t.game;
      const timeLeft = Math.max(0, Math.floor((300000 - (Date.now() - t.created_at)) / 1000));
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;

      return `
        <div class="table-card" onclick="openJoinModal('${t.id}')">
          <div class="table-game-icon">${gameIcon}</div>
          <div class="table-info">
            <div class="table-game-name">${gameName}</div>
            <div class="table-creator">Ստեղծող՝ ${t.creator_name}</div>
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
  // Ստուգում ենք արդեն active session կա՞
  if (activeBotSession && activeBotSession.game === game) {
    // Արդեն վճարել է, մտնում է խաղ
    window.location.href = `${API}/duels/bot-game?game=${game}&uid=${USER_ID}`;
    return;
  }

  // Ստուգում ենք balance-ը
  if (domitBalance < 2) {
    return showStatus("❌ Քեզ մոտ չկա 2 DOMIT։", "lose");
  }

  // Վճարում է 2 DOMIT
  try {
    const r = await fetch(`${API}/api/duels/pay-bot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, game })
    });

    const js = await r.json();
    if (!js.ok) {
      return showStatus(`❌ ${js.error}`, "lose");
    }

    domitBalance = js.new_balance;
    updateBalances();

    activeBotSession = { game, paid: true };

    // Մտնում է խաղ
    window.location.href = `${API}/duels/bot-game?game=${game}&uid=${USER_ID}`;
  } catch (e) {
    console.log("payBot error", e);
    showStatus("❌ Սերվերի սխալ", "lose");
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
  const game = document.getElementById("game-type").value;
  const bet = Number(document.getElementById("bet-amount").value);

  if (!bet || bet <= 0) {
    document.getElementById("create-error").textContent = "Գրիր ճիշտ գումար։";
    return;
  }

  if (bet > domitBalance) {
    document.getElementById("create-error").textContent = "Դուք չունեք այդքան DOMIT։";
    return;
  }

  closeCreateTableModal();

  try {
    const r = await fetch(`${API}/api/duels/create-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, username: USERNAME, game, bet })
    });

    const js = await r.json();
    if (!js.ok) {
      return showStatus(`❌ ${js.error}`, "lose");
    }

    domitBalance = js.new_balance;
    updateBalances();

    showStatus(`✅ Սեղանը ստեղծվեց։ Սպասում ենք հակառակորդին…`);
  } catch (e) {
    console.log("createTable error", e);
    showStatus("❌ Սերվերի սխալ", "lose");
  }
}

// ================= JOIN TABLE =================

function openJoinModal(tableId) {
  selectedTableId = tableId;

  // Գտնում ենք սեղանը
  socket.emit("get_table_info", { table_id: tableId }, (table) => {
    if (!table) {
      return showStatus("❌ Սեղանը չի գտնվել։", "lose");
    }

    const gameIcon = table.game === "tictactoe" ? "❌⭕" : "🎮";
    const gameName = table.game === "tictactoe" ? "Tic-Tac-Toe" : table.game;

    document.getElementById("join-game-type").textContent = `${gameIcon} ${gameName}`;
    document.getElementById("join-bet").textContent = table.bet;
    document.getElementById("join-creator").textContent = table.creator_name;
    document.getElementById("join-error").textContent = "";

    document.getElementById("join-modal").classList.remove("hidden");
  });
}

function closeJoinModal() {
  document.getElementById("join-modal").classList.add("hidden");
  selectedTableId = null;
}

async function confirmJoinTable() {
  if (!selectedTableId) return;

  closeJoinModal();

  try {
    const r = await fetch(`${API}/api/duels/join-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        username: USERNAME,
        table_id: selectedTableId
      })
    });

    const js = await r.json();
    if (!js.ok) {
      return showStatus(`❌ ${js.error}`, "lose");
    }

    domitBalance = js.new_balance;
    updateBalances();

    showStatus("✅ Միացար սեղանին։ Խաղը սկսվում է…");

    // WebSocket-ը կուղարկի game_started event
  } catch (e) {
    console.log("joinTable error", e);
    showStatus("❌ Սերվերի սխալ", "lose");
  }
}

// ================= BACK =================

function goBack() {
  window.location.href = `${API}/portal/portal.html?uid=${USER_ID}&viewer=${USER_ID}&t=${Date.now()}`;
}

// ================= INIT =================

window.onload = () => {
  USER_ID = tg?.initDataUnsafe?.user?.id || getUidFromUrl();
  loadUser();
  connectWebSocket();
};

window.onbeforeunload = () => {
  if (socket) socket.disconnect();
};