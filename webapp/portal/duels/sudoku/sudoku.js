const API = window.location.origin;
const params = new URLSearchParams(window.location.search);
const USER_ID = Number(params.get("uid") || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user?.id));
const TABLE_ID = Number(params.get('table_id')||0);
let onlineMode = !!TABLE_ID;
let socket = null;
let mistakes = 0;
const MAX_MISTAKES = 3;
let domitBalance = 0;

let grid = [];
let fixed = [];
let selected = null;
let gameOver = false;
let notesMode = false;
let candidates = [];
let solution = null;
let currentDifficulty = 'medium';

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
  const puz = generatePuzzle(currentDifficulty);
  grid = puz.grid.map(r => r.slice());
  fixed = puz.grid.map(r => r.map(v => v!==0));
  candidates = Array(9).fill(0).map(()=>Array(9).fill(0).map(()=>new Set()));
  solution = puz.solution;
}

function renderGrid() {
  const el = document.getElementById('grid');
  el.innerHTML = '';
  for (let br=0;br<3;br++) {
    for (let bc=0;bc<3;bc++) {
      const block = document.createElement('div');
      block.className = 'block';
      for (let rr=0; rr<3; rr++) {
        for (let cc=0; cc<3; cc++) {
          const r = br*3 + rr;
          const c = bc*3 + cc;
          const d = document.createElement('div');
          let cls = 'cell' + (fixed[r][c]?' prefill':'');
          if (selected && selected.r===r && selected.c===c) cls += ' sel';
          if (selected && (selected.r===r || selected.c===c || (Math.floor(selected.r/3)===Math.floor(r/3) && Math.floor(selected.c/3)===Math.floor(c/3)))) cls += ' rel';
          const selVal = selected ? grid[selected.r][selected.c] : 0;
          if (selVal && grid[r][c]===selVal) cls += ' same';
          d.className = cls;
          d.id = `cell-${r}-${c}`;
          if (grid[r][c]) { 
            d.textContent = grid[r][c];
            if (!fixed[r][c] && !validNumberFinal(r,c,grid[r][c])) {
              d.classList.add('error');
            }
          }
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
          block.appendChild(d);
        }
      }
      el.appendChild(block);
    }
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
    b.setAttribute('data-num', String(n));
    b.onclick = () => placeNumber(n);
    nums.appendChild(b);
  }
  updateNumbersUI();
  updateProgressAndCounts();
}

function renderMistakes(){
  const el = document.getElementById('mistakesInfo');
  if (!el) return;
  el.textContent = `Սխալների սահման՝ ${mistakes}/${MAX_MISTAKES}`;
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
  if (solution) {
    for(let r=0;r<9;r++)for(let c=0;c<9;c++){ if(grid[r][c]!==solution[r][c]) return false; }
  }
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
    if(!validNumber(r,c,n)) {
      mistakes++;
      renderMistakes();
      showStatus('Սխալ թիվ');
      grid[r][c] = n; // թույլ ենք տալիս սխալ թիվը տեղադրել
      if (onlineMode && socket) socket.emit('sudoku_mistake', { table_id: TABLE_ID, mistakes });
      if (mistakes>=MAX_MISTAKES) { endGame('lose'); if (onlineMode && socket) socket.emit('sudoku_over', { table_id: TABLE_ID, result:'lose' }); }
    } else {
      grid[r][c] = n;
    }
    candidates[r][c].clear();
  }
  renderGrid();
  if(isSolved()) { endGame('win'); if (onlineMode && socket) socket.emit('sudoku_over', { table_id: TABLE_ID, result:'win' }); }
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
  st.textContent = result==='win' ? '🎉 Հաղթեցիր' : '😔 Պարտվեցիր';
  document.getElementById('newGame').style.display='inline-block';
  stopTimer();
}

function restartGame() {
  gameOver = false; selected=null;
  setupPuzzle(); renderGrid();
  document.getElementById('status').textContent='';
  document.getElementById('newGame').style.display='none';
  startTimer(true);
}

function toggleNotes(){
  notesMode = !notesMode;
  const btn = document.getElementById('notesToggle');
  if (btn) {
    btn.textContent = notesMode ? '✎ Նշումներ — ON' : '✎ Նշումներ';
    btn.classList.toggle('on', notesMode);
  }
  if (notesMode) recomputeAllCandidates();
}

function recomputeAllCandidates(){
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    if (grid[r][c]===0){
      const s = new Set();
      for(let n=1;n<=9;n++){ if(validNumber(r,c,n)) s.add(n); }
      candidates[r][c]=s;
    } else {
      candidates[r][c].clear();
    }
  }
}

function useHint(){
  if (gameOver || !solution) return;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    if (grid[r][c]===0){
      grid[r][c]=solution[r][c];
      candidates[r][c].clear();
      renderGrid();
      if (isSolved()) endGame('win');
      return;
    }
  }
}

function changeDifficulty(val){
  currentDifficulty = String(val||'medium');
  const cont = document.querySelector('.container');
  if (cont){
    cont.classList.remove('diff-easy','diff-medium','diff-hard');
    cont.classList.add('diff-'+currentDifficulty);
  }
  restartGame();
}

function deepCopy(a){ return a.map(r=>r.slice()); }

function generateFullSolution(){
  const g = Array(9).fill(0).map(()=>Array(9).fill(0));
  const nums = [1,2,3,4,5,6,7,8,9];
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } }
  function isValid(g,r,c,n){
    for(let i=0;i<9;i++){ if(g[r][i]===n||g[i][c]===n) return false; }
    const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
    for(let rr=0;rr<3;rr++)for(let cc=0;cc<3;cc++){ if(g[br+rr][bc+cc]===n) return false; }
    return true;
  }
  function backtrack(pos=0){
    if(pos===81) return true;
    const r=Math.floor(pos/9), c=pos%9;
    const order = nums.slice(); shuffle(order);
    for(const n of order){ if(isValid(g,r,c,n)){ g[r][c]=n; if(backtrack(pos+1)) return true; g[r][c]=0; } }
    return false;
  }
  backtrack(0);
  return g;
}

function countSolutions(gridIn, limit=2){
  const g = deepCopy(gridIn);
  function isValid(g,r,c,n){
    for(let i=0;i<9;i++){ if(g[r][i]===n||g[i][c]===n) return false; }
    const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
    for(let rr=0;rr<3;rr++)for(let cc=0;cc<3;cc++){ if(g[br+rr][bc+cc]===n) return false; }
    return true;
  }
  let solutions=0;
  function backtrack(){
    let r=-1,c=-1;
    for(let i=0;i<9;i++)for(let j=0;j<9;j++){ if(g[i][j]===0){ r=i; c=j; break; } }
    if(r===-1){ solutions++; return solutions<limit; }
    for(let n=1;n<=9;n++){
      if(isValid(g,r,c,n)){
        g[r][c]=n;
        if(!backtrack()){ g[r][c]=0; return false; }
        g[r][c]=0;
      }
    }
    return true;
  }
  backtrack();
  return solutions;
}

function generatePuzzle(difficulty='medium'){
  const sol = generateFullSolution();
  let puzzle = deepCopy(sol);
  const targetClues = difficulty==='easy'? 40 : difficulty==='hard'? 28 : 34;
  const cells = [];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++) cells.push([r,c]);
  for(let i=cells.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [cells[i],cells[j]]=[cells[j],cells[i]]; }
  let removed = 0;
  for(const [r,c] of cells){
    if(81-removed<=targetClues) break;
    const keep = puzzle[r][c];
    puzzle[r][c]=0;
    const solCount = countSolutions(puzzle, 2);
    if(solCount!==1){ puzzle[r][c]=keep; } else { removed++; }
  }
  return { grid: puzzle, solution: sol };
}

function updateNumbersUI(){
  const nums = document.getElementById('numbers');
  if (!nums) return;
  const btns = Array.from(nums.querySelectorAll('.btn.num'));
  btns.forEach(b=>{ b.classList.remove('disabled'); b.disabled=false; });
}

function updateProgressAndCounts(){
  let filled = 0;
  const counts = Array(10).fill(0);
  for(let r=0;r<9;r++) for(let c=0;c<9;c++) { const v=grid[r][c]; if (v>0) { filled++; counts[v]++; } }
  const pct = Math.round((filled/81)*100);
  const bar = document.getElementById('progress-bar');
  const txt = document.getElementById('progress-text');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = pct + '%';
  const nc = document.getElementById('numberCounts');
  if (nc) {
    nc.innerHTML = '';
    for(let n=1;n<=9;n++) {
      const div = document.createElement('div');
      div.className = 'count';
      div.textContent = `${n} — ${counts[n]}`;
      nc.appendChild(div);
    }
  }
}

let timerStart = 0;
let timerInterval = null;
function startTimer(reset=false){
  if (reset) timerStart = Date.now(); else if (!timerStart) timerStart = Date.now();
  const el = document.getElementById('timer');
  if (timerInterval) { clearInterval(timerInterval); timerInterval=null; }
  timerInterval = setInterval(()=>{
    const ms = Date.now() - timerStart;
    const m = Math.floor(ms/60000);
    const s = Math.floor((ms%60000)/1000);
    if (el) el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 250);
}
function stopTimer(){
  if (timerInterval) { clearInterval(timerInterval); timerInterval=null; }
}

async function init() {
  await loadBalance();
  setupPuzzle();
  renderGrid();
  renderMistakes();
  startTimer(true);
  resizeGrid();
  if (onlineMode) {
    socket = io(API);
    socket.emit('join_table', { table_id: TABLE_ID });
    socket.on('sudoku_over', (data)=>{
      if (data && data.table_id===TABLE_ID) {
        if (!gameOver) endGame(data.result==='win' ? 'lose' : 'win');
      }
    });
  }
}

window.onload = init;

function resizeGrid(){
  const cont = document.querySelector('.container');
  if (!cont) return;
  const available = cont.clientWidth - 16;
  const fixedPaddingAndGaps = 64;
  let cell = Math.floor((available - fixedPaddingAndGaps) / 9);
  cell = Math.max(26, Math.min(52, cell));
  document.documentElement.style.setProperty('--cell9', `${cell}px`);
}

window.addEventListener('resize', resizeGrid);
