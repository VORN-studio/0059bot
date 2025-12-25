const API = window.location.origin;
const params = new URLSearchParams(window.location.search);
const USER_ID = Number(params.get("uid") || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user?.id));
const TABLE_ID = Number(params.get("table_id"));
const IS_BOT_MODE = !TABLE_ID; 
let socket;
let domitBalance = 0;
let mySymbol = null; // 'X' or 'O'
let currentTurn = 'X';
let board = Array(9).fill("");
let gameOver = false;
let creatorUsername = "";
let opponentUsername = "";

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

  socket.on("table_joined", (data) => {
    if (data.table_id == TABLE_ID) {
      opponentUsername = data.opponent_username || opponentUsername;
      if (mySymbol === 'X') {
        document.getElementById("player2-name").textContent = opponentUsername || "Սպասում...";
      }
      updateTurnDisplay();
    }
  });

  socket.on("opponent_move", (data) => {
    if (data.table_id == TABLE_ID) {
      const state = data.game_state;
      board = state.board;
      currentTurn = state.turn;
      renderBoard();
      updateTurnDisplay();
      
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
      // Սահմանում ենք մեր նշանը՝ X (ստեղծող) կամ O (մտնող)
      mySymbol = Number(js.creator_id) === Number(USER_ID) ? 'X' : 'O';
      creatorUsername = js.creator_username || "";
      opponentUsername = js.opponent_username || "";

      const state = js.game_state;
      if (state) {
        board = state.board || Array(9).fill("");
        currentTurn = state.turn || 'X';

        if (state.rounds) {
          const rinfo = state.rounds;
          document.getElementById("status").textContent = `Раунд ${rinfo.current}/3 | Счет՝ X:${rinfo.x} - O:${rinfo.o}`;
        }
      } else {
        // Սպասում ենք հակառակորդին՝ պահում ենք դատարկ տախտակ
        board = Array(9).fill("");
        currentTurn = 'X';
        document.getElementById("status").textContent = `Սպասում ենք հակառակորդին…`;
      }

      // Անուններ և ինդիկատորներ
      if (mySymbol === 'X') {
        document.getElementById("player1-name").textContent = "Դու";
        document.getElementById("player2-name").textContent = opponentUsername || "Սպասում...";
      } else {
        document.getElementById("player1-name").textContent = creatorUsername || "Սպասում...";
        document.getElementById("player2-name").textContent = "Դու";
      }

      renderBoard();
      updateTurnDisplay();

      // Եթե խաղն ավարտված է՝ ցուցադրում ենք արդյունքը
      if (js.status === 'finished') {
        if (js.winner_id == USER_ID) {
          handleGameOver("win", js.bet * 1.75);
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

async function handleCellClick(index) {
  if (gameOver || board[index]) return;

  if (IS_BOT_MODE) {
    // BOT MODE
    if (currentTurn !== 'X') return;

    board[index] = 'X';
    currentTurn = 'O';
    renderBoard();

    const winner = checkWinner(board);
    if (winner) {
      handleGameOver(winner);
      return;
    }

    if (!board.includes("")) {
      handleGameOver('draw');
      return;
    }

    setTimeout(() => {
      botMove();
    }, 500);

  } else {
    // MULTIPLAYER MODE
    if (currentTurn !== mySymbol) {
      showMessage("Ваша очередь переезжать ещё не настала.։", "lose");
      return;
    }

    try {
      const r = await fetch(`${API}/api/duels/make-move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_id: TABLE_ID,
          user_id: USER_ID,
          move: { index }
        })
      });

      const js = await r.json();
      if (!js.success) {
        showMessage(`❌ ${js.message}`, "lose");
        return;
      }

      // Update board
      board = js.game_state.board;
      currentTurn = js.game_state.turn;
      renderBoard();

      // Check game over
      if (js.winner) {
        handleGameOver(js.winner === mySymbol ? "win" : "lose", js.prize);
      } else if (js.draw) {
        handleGameOver("draw");
      }

    } catch (e) {
      console.error("makeMove error:", e);
      showMessage("❌ Ошибка сервера", "lose");
    }
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

  playerX.classList.toggle("active", currentTurn === 'X');
  playerO.classList.toggle("active", currentTurn === 'O');

  if (currentTurn === mySymbol) {
    turnInfo.textContent = "Քո հերթն է";
    turnInfo.style.color = "#667eea";
  } else {
    turnInfo.textContent = "Հակառակորդի հերթն է";
    turnInfo.style.color = "#999";
  }

  const ti = document.getElementById("turn-indicator");
  const me = mySymbol === 'X' ? 'X' : 'O';
  const opp = mySymbol === 'X' ? (opponentUsername || '...') : (creatorUsername || '...');
  ti.textContent = `Դու — ${me}, հակառակորդ՝ ${opp}`;
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


function showMessage(msg, type = "") {
  showStatus(msg, type);
}


function checkWinner(board) {
  for (let combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

// ================= NAVIGATION =================

function goBack() {
  window.location.href = `${API}/portal/duels/duels.html?uid=${USER_ID}`;
}

function restartGame() {
  if (IS_BOT_MODE) {
    board = Array(9).fill("");
    currentTurn = 'X';
    gameOver = false;
    renderBoard();
    updateTurnDisplay();
    showStatus("", "");
    document.getElementById("new-game-btn").style.display = "none";
  } else {
    window.location.href = `${API}/portal/duels/duels.html?uid=${USER_ID}`;
  }
}

// ================= BOT MODE =================

function initBotMode() {
  mySymbol = 'X';
  currentTurn = 'X';
  document.getElementById("player1-name").textContent = "Ты";
  document.getElementById("player2-name").textContent = "Компьютер";
  updateTurnDisplay();
  showStatus("Игра началась! Начинайте свой ход!", "");
}

function botMove() {
  if (gameOver) return;
  
  const emptyIndexes = board.map((val, idx) => val === "" ? idx : null).filter(v => v !== null);
  if (emptyIndexes.length === 0) return;
  
  let botIndex;
  
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
  
  for (let combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] === 'O' && board[b] === 'O' && board[c] === null) return c;
    if (board[a] === 'O' && board[c] === 'O' && board[b] === null) return b;
    if (board[b] === 'O' && board[c] === 'O' && board[a] === null) return a;
  }
  
  for (let combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] === 'X' && board[b] === 'X' && board[c] === null) return c;
    if (board[a] === 'X' && board[c] === 'X' && board[b] === null) return b;
    if (board[b] === 'X' && board[c] === 'X' && board[a] === null) return a;
  }
  
  if (board[4] === "") return 4;
  
  const corners = [0, 2, 6, 8];
  const emptyCorners = corners.filter(i => board[i] === "");
  if (emptyCorners.length > 0) {
    return emptyCorners[Math.floor(Math.random() * emptyCorners.length)];
  }
  
  const emptyIndexes = board.map((val, idx) => val === "" ? idx : null).filter(v => v !== null);
  return emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
}

function checkBotGameOver() {
  handleGameOver();
}

async function handleGameOver(result = null, prize = 0) {
  // Check winner from board
  let winner = null;
  for (let combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      winner = board[a];
      highlightWinningLine(combo);
      break;
    }
  }

  const isDraw = !winner && board.every(cell => cell !== "");

  if (!winner && !isDraw && !result) return; // Game not over

  gameOver = true;

  let message = "";
  let className = "";

  if (IS_BOT_MODE) {
    // BOT MODE
    if (winner === 'X') {
      message = "🎉 Вы победили!";
      className = "win";
    } else if (winner === 'O') {
      message = "😔 Бот победил.";
      className = "lose";
    } else {
      message = "🤝 Ничья!";
      className = "draw";
    }
  } else {
    // MULTIPLAYER MODE
    if (result === 'win') {
      message = `🎉 ВЫ ПОБЕДИЛИ! +${prize.toFixed(2)} DOMIT`;
      className = "win";
      await loadBalance();
    } else if (result === 'lose') {
      message = "😔 Вы проиграли.";
      className = "lose";
      await loadBalance();
    } else if (result === 'draw' || isDraw) {
      message = "🤝 Ничья - Деньги были возвращены.";
      className = "draw";
      await loadBalance();
    }
  }

  showStatus(message, className);
  document.getElementById("new-game-btn").style.display = "block";
  document.getElementById("new-game-btn").textContent = IS_BOT_MODE ? "Новая игра" : "Возвращаемся к дуэлям";
}

// ================= START =================

window.onload = init;
