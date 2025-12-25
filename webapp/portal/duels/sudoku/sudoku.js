const API = window.location.origin;
const params = new URLSearchParams(window.location.search);
const USER_ID = Number(params.get("uid") || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user?.id));
let domitBalance = 0;

let grid = [];
let fixed = [];
let selected = null;
let gameOver = false;
let turnTimeoutId = null;
let countdownIntervalId = null;

async function loadBalance() {
  try {
    const r = await fetch(`${API}/api/user/${USER_ID}`);
    const js = await r.json();
    domitBalance = js.user.balance_usd || 0;
    document.getElementById("domit-balance").textContent = domitBalance.toFixed(2);
  } catch (e) {}
}

function goBack() {
  window.location.href = `${API}/portal/duels/duels.html?uid=${USER_ID}`;
}

function setupPuzzle() {
  const puzzle = [
    [0,0,0,2,6,0,7,0,1],
    [6,8,0,0,7,0,0,9,0],
    [1,9,0,0,0,4,5,0,0],
    [8,2,0,1,0,0,0,4,0],
    [0,0,4,6,0,2,9,0,0],
    [0,5,0,0,0,3,0,2,8],
    [0,0,9,3,0,0,0,7,4],
    [0,4,0,0,5,0,0,3,6],
    [7,0,3,0,1,8,0,0,0]
  ];
  grid = puzzle.map(r => r.slice());
  fixed = puzzle.map(r => r.map(v => v!==0));
}

function renderGrid() {
  const el = document.getElementById('grid');
  el.innerHTML = '';
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const d = document.createElement('div');
    d.className = 'cell' + (fixed[r][c]?' prefill':'');
    d.textContent = grid[r][c]||'';
    d.onclick = () => selectCell(r,c);
    el.appendChild(d);
  }
  const nums = document.getElementById('numbers');
  nums.innerHTML = '';
  for (let n=1;n<=9;n++) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.style.margin = '2px';
    b.textContent = n;
    b.onclick = () => placeNumber(n);
    nums.appendChild(b);
  }
}

function selectCell(r,c) {
  if (gameOver) return;
  if (fixed[r][c]) return;
  selected = {r,c};
}

function validNumber(r,c,n){
  for(let i=0;i<9;i++){if(grid[r][i]===n||grid[i][c]===n)return false}
  const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
  for(let rr=0;rr<3;rr++)for(let cc=0;cc<3;cc++){if(grid[br+rr][bc+cc]===n)return false}
  return true
}

function isSolved(){
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){const v=grid[r][c];if(v<1||v>9)return false; if(!validNumberFinal(r,c,v))return false}
  return true
}

function validNumberFinal(r,c,n){
  for(let i=0;i<9;i++){if(i!==c&&grid[r][i]===n)return false;if(i!==r&&grid[i][c]===n)return false}
  const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
  for(let rr=0;rr<3;rr++)for(let cc=0;cc<3;cc++){const R=br+rr,C=bc+cc;if(!(R===r&&C===c)&&grid[R][C]===n)return false}
  return true
}

function placeNumber(n) {
  if (!selected || gameOver) return;
  const {r,c} = selected;
  if (fixed[r][c]) return;
  if(!validNumber(r,c,n))return;
  grid[r][c] = n;
  renderGrid();
  resetTurnTimer();
  if(isSolved()) endGame('win');
}

function clearTurnTimers() {
  if (turnTimeoutId) { clearTimeout(turnTimeoutId); turnTimeoutId=null; }
  if (countdownIntervalId) { clearInterval(countdownIntervalId); countdownIntervalId=null; }
}

function resetTurnTimer() {
  clearTurnTimers();
  if (gameOver) return;
  const el = document.getElementById('turnInfo');
  const deadline = Date.now() + 20000;
  countdownIntervalId = setInterval(() => {
    const left = Math.max(0, deadline - Date.now());
    const s = Math.ceil(left/1000);
    el.textContent = `Քո քայլերը — ${s}վրկ`;
  }, 250);
  turnTimeoutId = setTimeout(onTimeout, 20000);
}

function onTimeout() {
  endGame('lose');
}

function endGame(result) {
  gameOver = true;
  clearTurnTimers();
  const st = document.getElementById('status');
  if (result==='lose') st.textContent = '😔 Պարտվեցիր (ժամանակ)';
  else st.textContent = '🎉 Հաղթեցիր';
  document.getElementById('newGame').style.display='inline-block';
}

function restartGame() {
  gameOver = false; selected=null;
  setupPuzzle(); renderGrid(); resetTurnTimer();
  document.getElementById('status').textContent='';
  document.getElementById('newGame').style.display='none';
}

async function init() {
  await loadBalance();
  setupPuzzle();
  renderGrid();
  resetTurnTimer();
}

window.onload = init;
