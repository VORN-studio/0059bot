const API = window.location.origin;
const params = new URLSearchParams(window.location.search);
const USER_ID = Number(params.get("uid") || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user?.id));
let domitBalance = 0;

let board = [];
let selected = null;
let currentTurn = 'w';
let gameOver = false;
let turnTimeoutId = null;
let countdownIntervalId = null;

const PIECES = {
  w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟︎' }
};

function goBack() {
  window.location.href = `${API}/portal/duels/duels.html?uid=${USER_ID}`;
}

async function loadBalance() {
  try {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    domitBalance = js.user.balance_usd || 0;
    document.getElementById("domit-balance").textContent = domitBalance.toFixed(2);
  } catch (e) {}
}

function setupBoard() {
  board = Array(8).fill(0).map(() => Array(8).fill(null));
  const back = ['R','N','B','Q','K','B','N','R'];
  for (let i=0;i<8;i++) { board[0][i] = {c:'b', p:back[i]}; board[1][i] = {c:'b', p:'P'}; }
  for (let i=0;i<8;i++) { board[7][i] = {c:'w', p:back[i]}; board[6][i] = {c:'w', p:'P'}; }
}

function renderBoard() {
  const el = document.getElementById('board');
  el.innerHTML = '';
  for (let r=0;r<8;r++) {
    for (let c=0;c<8;c++) {
      const d = document.createElement('div');
      d.className = 'sq ' + (((r+c)%2===0)?'light':'dark');
      d.dataset.r = r; d.dataset.c = c;
      const piece = board[r][c];
      d.textContent = piece ? PIECES[piece.c][piece.p] : '';
      if (selected && selected.r===r && selected.c===c) d.classList.add('sel');
      d.onclick = () => onSquareClick(r,c);
      el.appendChild(d);
    }
  }
}

function onSquareClick(r,c) {
  if (gameOver) return;
  const piece = board[r][c];
  if (selected) {
    const from = selected; const to = {r,c};
    if (canMove(from, to)) {
      board[to.r][to.c] = board[from.r][from.c];
      board[from.r][from.c] = null;
      selected = null;
      currentTurn = 'b';
      renderBoard();
      updateTurnInfo();
      scheduleTurnTimer();
      setTimeout(botMove, 500);
      return;
    }
    selected = null;
    renderBoard();
    return;
  }
  if (piece && piece.c === 'w' && currentTurn === 'w') {
    selected = {r,c};
    renderBoard();
  }
}

function canMove(from, to) {
  const piece = board[from.r][from.c];
  if (!piece) return false;
  if (board[to.r][to.c] && board[to.r][to.c].c === piece.c) return false;
  const dr = to.r - from.r; const dc = to.c - from.c;
  if (piece.p === 'N') return (Math.abs(dr)*Math.abs(dc)===2);
  if (piece.p === 'K') return (Math.max(Math.abs(dr),Math.abs(dc))===1);
  if (piece.p === 'P') {
    const dir = piece.c==='w'?-1:1;
    if (dc===0 && !board[to.r][to.c] && dr===dir) return true;
    if (Math.abs(dc)===1 && dr===dir && board[to.r][to.c] && board[to.r][to.c].c!==piece.c) return true;
    return false;
  }
  if (piece.p === 'R' || piece.p === 'B' || piece.p === 'Q') {
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    const sr = Math.sign(dr), sc = Math.sign(dc);
    if (piece.p==='R' && !(dr===0 || dc===0)) return false;
    if (piece.p==='B' && !(Math.abs(dr)===Math.abs(dc))) return false;
    for (let i=1;i<steps;i++) {
      if (board[from.r + sr*i][from.c + sc*i]) return false;
    }
    return true;
  }
  return false;
}

function botMove() {
  if (gameOver) return;
  const moves = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = board[r][c]; if (!p || p.c!=='b') continue;
    for (let rr=0; rr<8; rr++) for (let cc=0; cc<8; cc++) {
      if (canMove({r,c},{r:rr,c:cc})) moves.push({from:{r,c}, to:{r:rr,c:cc}});
    }
  }
  if (moves.length===0) { endGame('win'); return; }
  const mv = moves[Math.floor(Math.random()*moves.length)];
  board[mv.to.r][mv.to.c] = board[mv.from.r][mv.from.c];
  board[mv.from.r][mv.from.c] = null;
  currentTurn = 'w';
  renderBoard();
  updateTurnInfo();
  scheduleTurnTimer();
}

function updateTurnInfo() {
  const el = document.getElementById('turnInfo');
  if (currentTurn === 'w') { el.textContent = 'Քո հերթն է'; el.style.color = '#8b5cf6'; }
  else { el.textContent = 'Բոտի հերթն է'; el.style.color = '#94a3b8'; }
}

function clearTurnTimers() {
  if (turnTimeoutId) { clearTimeout(turnTimeoutId); turnTimeoutId=null; }
  if (countdownIntervalId) { clearInterval(countdownIntervalId); countdownIntervalId=null; }
}

function scheduleTurnTimer() {
  clearTurnTimers();
  if (gameOver) return;
  if (currentTurn !== 'w') return;
  const el = document.getElementById('turnInfo');
  const deadline = Date.now() + 20000;
  countdownIntervalId = setInterval(() => {
    const left = Math.max(0, deadline - Date.now());
    const s = Math.ceil(left/1000);
    el.textContent = `Քո հերթն է — ${s}վրկ`;
  }, 250);
  turnTimeoutId = setTimeout(() => { endGame('lose'); }, 20000);
}

function endGame(result) {
  gameOver = true;
  clearTurnTimers();
  const st = document.getElementById('status');
  if (result==='win') st.textContent = '🎉 Հաղթեցիր';
  else st.textContent = '😔 Պարտվեցիր (ժամանակ)';
  document.getElementById('newGame').style.display = 'inline-block';
}

function restartGame() {
  gameOver = false; selected=null; currentTurn='w';
  setupBoard(); renderBoard(); updateTurnInfo(); scheduleTurnTimer();
  document.getElementById('status').textContent='';
  document.getElementById('newGame').style.display='none';
}

async function init() {
  await loadBalance();
  setupBoard();
  renderBoard();
  updateTurnInfo();
  scheduleTurnTimer();
}

window.onload = init;
