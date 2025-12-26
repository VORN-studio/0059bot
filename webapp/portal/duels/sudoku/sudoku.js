const API = window.location.origin;
const params = new URLSearchParams(window.location.search);
const USER_ID = Number(params.get("uid") || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user?.id));
let domitBalance = 0;

let grid = [];
let fixed = [];
let selected = null;
let gameOver = false;
let notesMode = false;
let candidates = [];

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
  candidates = Array(9).fill(0).map(()=>Array(9).fill(0).map(()=>new Set()));
}

function renderGrid() {
  const el = document.getElementById('grid');
  el.innerHTML = '';
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const d = document.createElement('div');
    let cls = 'cell' + (fixed[r][c]?' prefill':'');
    if (selected && selected.r===r && selected.c===c) cls += ' sel';
    if (selected && (selected.r===r || selected.c===c || (Math.floor(selected.r/3)===Math.floor(r/3) && Math.floor(selected.c/3)===Math.floor(c/3)))) cls += ' rel';
    const selVal = selected ? grid[selected.r][selected.c] : 0;
    if (selVal && grid[r][c]===selVal) cls += ' same';
    if (c%3===2) cls += ' blk-r';
    if (r%3===2) cls += ' blk-b';
    if (r===0) cls += ' blk-t';
    if (c===0) cls += ' blk-l';
    d.className = cls;
    if (grid[r][c]) { d.textContent = grid[r][c]; }
    else if (candidates[r][c].size>0) {
      const cont = document.createElement('div');
      cont.className = 'notes';
      for (let nn=1; nn<=9; nn++) {
        const s = document.createElement('span');
        s.textContent = candidates[r][c].has(nn) ? nn : '';
        cont.appendChild(s);
      }
      d.appendChild(cont);
    }
    d.onclick = () => selectCell(r,c);
    el.appendChild(d);
  }
  const nums = document.getElementById('numbers');
  nums.innerHTML = '';
  const clr = document.createElement('button');
  clr.className = 'btn num';
  clr.textContent = '⌫';
  clr.onclick = clearCell;
  nums.appendChild(clr);
  for (let n=1;n<=9;n++) {
    const b = document.createElement('button');
    b.className = 'btn num';
    b.style.margin = '2px';
    b.textContent = n;
    b.onclick = () => placeNumber(n);
    nums.appendChild(b);
  }
}

function selectCell(r,c) {
  if (gameOver) return;
  selected = {r,c};
  renderGrid();
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
  if (notesMode) {
    if (candidates[r][c].has(n)) candidates[r][c].delete(n); else candidates[r][c].add(n);
  } else {
    if(!validNumber(r,c,n)) { showStatus('Թիվը հակասում է կանոններին'); return; }
    grid[r][c] = n;
    candidates[r][c].clear();
  }
  renderGrid();
  if(isSolved()) endGame('win');
}

function clearCell(){
  if (!selected || gameOver) return;
  const {r,c} = selected;
  if (fixed[r][c]) return;
  grid[r][c] = 0;
  candidates[r][c].clear();
  renderGrid();
}

function showStatus(msg){
  const st = document.getElementById('status');
  st.textContent = msg;
  setTimeout(()=>{ if (st.textContent===msg) st.textContent=''; }, 1200);
}

function endGame(result) {
  gameOver = true;
  const st = document.getElementById('status');
  st.textContent = '🎉 Հաղթեցիր';
  document.getElementById('newGame').style.display='inline-block';
}

function restartGame() {
  gameOver = false; selected=null;
  setupPuzzle(); renderGrid();
  document.getElementById('status').textContent='';
  document.getElementById('newGame').style.display='none';
}

function toggleNotes(){
  notesMode = !notesMode;
  const btn = document.getElementById('notesToggle');
  if (btn) btn.textContent = notesMode ? '✎ Նշումներ — ON' : '✎ Նշումներ';
}

async function init() {
  await loadBalance();
  setupPuzzle();
  renderGrid();
}

window.onload = init;
