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
    console.log("✅ Socket connected");
    socket.emit("join_user", { user_id: USER_ID });
    loadTableState();
  });

  socket.on("opponent_move", (data) => {
    if (data.table_id == TABLE_ID) {
      const state = data.game_state;
      board = state.board;
      currentTurn = state.turn;
      renderBoard();
      
      if (checkWinner(board)) {
        handleGameOver(checkWinner(board));
      } else if (!board.includes("")) {
        handleGameOver("draw");
      }
    }
  });

  socket.on("game_over", (data) => {
    if (data.table_id == TABLE_ID) {
      if (data.draw) {
        handleGameOver("draw");
      } else if (data.winner_id == USER_ID) {
        handleGameOver("win", data.prize);
      } else {
        handleGameOver("lose");
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected");
  });
}

async function loadTableState() {
  try {
    const r = await fetch(`${API}/api/duels/get-table-state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table_id: TABLE_ID })
    });

    const js = await r.json();
    if (js.success) {
      board = js.game_state.board;
      currentTurn = js.game_state.turn;
      
      // Որոշում ենք մեր սիմվոլը
      if (js.creator_id == USER_ID) {
        mySymbol = 'X';
        document.getElementById("turn-indicator").textContent = `Դու ես X, հակառակորդը՝ ${js.opponent_username || '...'}`;
      } else {
        mySymbol = 'O';
        document.getElementById("turn-indicator").textContent = `Դու ես O, հակառակորդը՝ ${js.creator_username}`;
      }

      renderBoard();

      // Ստուգում ենք արդեն խաղն ավարտվել է
      if (js.status === 'finished') {
        if (js.winner_id == USER_ID) {
          handleGameOver("win", js.bet * 2);
        } else if (js.winner_id) {
          handleGameOver("lose");
        } else {
          handleGameOver("draw");
        }
      }
    }
  } catch (e) {
    console.error("loadTableState error:", e);
  }
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
  window.history.back();
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
  
  let botIndex;
  
  // 80% դեպքերում խելացի քայլ, 20% պատահական
  if (Math.random() < 0.8) {
    botIndex = getBestMove();
  } else {
    botIndex = emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
  }
  
  board[botIndex] = 'O';
  renderBoard();
  checkBotGameOver();
  
  if (!gameOver) {
    currentTurn = 'X';
    updateTurnDisplay();
  }
}

function getBestMove() {
  // 1. Եթե կարող է հաղթել - հաղթի
  for (let combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] === 'O' && board[b] === 'O' && board[c] === null) return c;
    if (board[a] === 'O' && board[c] === 'O' && board[b] === null) return b;
    if (board[b] === 'O' && board[c] === 'O' && board[a] === null) return a;
  }
  
  // 2. Եթե խաղացողը կարող է հաղթել - արգելակել
  for (let combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] === 'X' && board[b] === 'X' && board[c] === null) return c;
    if (board[a] === 'X' && board[c] === 'X' && board[b] === null) return b;
    if (board[b] === 'X' && board[c] === 'X' && board[a] === null) return a;
  }
  
  // 3. Վերցնել կենտրոնը եթե ազատ է
  if (board[4] === null) return 4;
  
  // 4. Վերցնել անկյուններից մեկը
  const corners = [0, 2, 6, 8];
  const emptyCorners = corners.filter(i => board[i] === null);
  if (emptyCorners.length > 0) {
    return emptyCorners[Math.floor(Math.random() * emptyCorners.length)];
  }
  
  // 5. Վերցնել ցանկացած ազատ տեղ
  const emptyIndexes = board.map((val, idx) => val === null ? idx : null).filter(v => v !== null);
  return emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
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