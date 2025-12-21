const API = window.location.origin;
const params = new URLSearchParams(window.location.search);
const USER_ID = params.get("uid");
const TABLE_ID = params.get("table_id");
const IS_BOT_MODE = !TABLE_ID; // Եթե table_id չկա → բոտի ռեժիմ
let socket;
let domitBalance = 0;
let mySymbol = null; // 'X' or 'O'
let currentTurn = 'X';
let board = Array(9).fill(null);
let gameOver = false;

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

// ================= INITIALIZE =================

async function init() {
  await loadBalance();
  if (IS_BOT_MODE) {
    initBotMode();
  } else {
    initSocket();
  }
  initBoard();
}

async function loadBalance() {
  try {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    domitBalance = js.user.balance_usd || 0;
    updateBalanceDisplay();
  } catch (e) {
    console.error("Balance load error:", e);
  }
}

function updateBalanceDisplay() {
  document.getElementById("domit-balance").textContent = domitBalance.toFixed(2);
}

// ================= SOCKET.IO =================

function initSocket() {
  socket = io(API);

  socket.on("connect", () => {
    console.log("Connected to server");
    socket.emit("join_tictactoe_table", { table_id: TABLE_ID, user_id: USER_ID });
  });

  socket.on("tictactoe_game_start", (data) => {
    mySymbol = data.your_symbol;
    currentTurn = 'X';
    document.getElementById("player1-name").textContent = data.player_x_name || "Խաղացող 1";
    document.getElementById("player2-name").textContent = data.player_o_name || "Խաղացող 2";
    updateTurnDisplay();
    showStatus("Խաղը սկսվեց!", "");
  });

  socket.on("tictactoe_move", (data) => {
    const { index, symbol, next_turn } = data;
    board[index] = symbol;
    renderBoard();
    currentTurn = next_turn;
    updateTurnDisplay();
  });

  socket.on("tictactoe_game_over", (data) => {
    gameOver = true;
    const { winner, winning_line, new_balance } = data;
    
    if (new_balance !== undefined) {
      domitBalance = new_balance;
      updateBalanceDisplay();
    }

    if (winning_line) {
      highlightWinningLine(winning_line);
    }

    if (winner === "draw") {
      showStatus("🤝 Ոչ-ոքի!", "draw");
    } else if (winner === mySymbol) {
      showStatus("🎉 Դու հաղթեցիր!", "win");
    } else {
      showStatus("😔 Դու պարտվեցիր", "lose");
    }
  });

  socket.on("tictactoe_error", (data) => {
    showStatus("❌ " + data.message, "lose");
  });
}

// ================= GAME BOARD =================

function initBoard() {
  const cells = document.querySelectorAll(".cell");
  cells.forEach((cell, idx) => {
    cell.addEventListener("click", () => handleCellClick(idx));
  });
}

function handleCellClick(index) {
  if (gameOver) return;
  if (board[index]) return;
  if (currentTurn !== mySymbol) {
    showStatus("⏳ Սպասիր քո հերթին", "");
    return;
  }

  if (IS_BOT_MODE) {
    // Բոտի ռեժիմ - խաղացողի քայլ
    board[index] = 'X';
    renderBoard();
    checkBotGameOver();
    
    if (!gameOver) {
      currentTurn = 'O';
      updateTurnDisplay();
      setTimeout(botMove, 500);
    }
  } else {
    // Multiplayer ռեժիմ - socket
    socket.emit("tictactoe_move", {
      table_id: TABLE_ID,
      user_id: USER_ID,
      index: index
    });
  }
}

function renderBoard() {
  const cells = document.querySelectorAll(".cell");
  cells.forEach((cell, idx) => {
    const value = board[idx];
    cell.textContent = value || "";
    cell.className = "cell";
    if (value) {
      cell.classList.add("taken", value.toLowerCase());
    }
  });
}

function updateTurnDisplay() {
  const turnInfo = document.getElementById("turn-info");
  const playerX = document.getElementById("player-x");
  const playerO = document.getElementById("player-o");

  playerX.classList.remove("active");
  playerO.classList.remove("active");

  if (currentTurn === 'X') {
    playerX.classList.add("active");
  } else {
    playerO.classList.add("active");
  }

  if (currentTurn === mySymbol) {
    turnInfo.textContent = "Քո հերթն է";
    turnInfo.style.color = "#667eea";
  } else {
    turnInfo.textContent = "Հակառակորդի հերթն է";
    turnInfo.style.color = "#999";
  }
}

function highlightWinningLine(line) {
  const cells = document.querySelectorAll(".cell");
  line.forEach(idx => {
    cells[idx].classList.add("winner");
  });
}

function showStatus(msg, type) {
  const status = document.getElementById("status");
  status.textContent = msg;
  status.className = "status " + type;
}

// ================= NAVIGATION =================

function goBack() {
  window.location.replace(`${API}/portal/duels/duels.html?uid=${USER_ID}&t=${Date.now()}`);
}

function restartGame() {
  board = Array(9).fill(null);
  gameOver = false;
  currentTurn = 'X';
  mySymbol = 'X';
  renderBoard();
  updateTurnDisplay();
  showStatus("Խաղը սկսվեց! Սկսիր քո քայլը", "");
  document.getElementById("new-game-btn").style.display = "none";
  
  // Հեռացնել winner class-ը բոլոր cell-երից
  const cells = document.querySelectorAll(".cell");
  cells.forEach(cell => cell.classList.remove("winner"));
}

// ================= BOT MODE =================

function initBotMode() {
  mySymbol = 'X';
  currentTurn = 'X';
  document.getElementById("player1-name").textContent = "Դու";
  document.getElementById("player2-name").textContent = "Համակարգիչ";
  updateTurnDisplay();
  showStatus("Խաղը սկսվեց! Սկսիր քո քայլը", "");
}

function botMove() {
  if (gameOver) return;
  
  const emptyIndexes = board.map((val, idx) => val === null ? idx : null).filter(v => v !== null);
  if (emptyIndexes.length === 0) return;
  
  const randomIndex = emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
  
  board[randomIndex] = 'O';
  renderBoard();
  checkBotGameOver();
  
  if (!gameOver) {
    currentTurn = 'X';
    updateTurnDisplay();
  }
}

function checkBotGameOver() {
  for (let combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      gameOver = true;
      highlightWinningLine(combo);
      
      if (board[a] === 'X') {
        showStatus("🎉 Դու հաղթեցիր!", "win");
      } else {
        showStatus("😔 Բոտը հաղթեց", "lose");
      }
      document.getElementById("new-game-btn").style.display = "block";
      return;
    }
  }
  
  if (board.every(cell => cell !== null)) {
    gameOver = true;
    showStatus("🤝 Ոչ-ոքի!", "draw");
    document.getElementById("new-game-btn").style.display = "block";
  }
}

// ================= START =================

window.onload = init;