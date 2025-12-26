const API = window.location.origin;
const params = new URLSearchParams(window.location.search);
const USER_ID = Number(params.get("uid") || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user?.id));
const TABLE_ID = Number(params.get('table_id')||0);
const PLAYER_COLOR = params.get('color')||'w';
let domitBalance = 0;

let board = [];
let selected = null;
let currentTurn = 'w';
let gameOver = false;
let turnTimeoutId = null;
let countdownIntervalId = null;
let castle = { w:{k:true,q:true}, b:{k:true,q:true} };
let enPassant = null;
let highlights = [];
let lastMove = null;
let socket = null;
let onlineMode = !!TABLE_ID;

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
  castle = { w:{k:true,q:true}, b:{k:true,q:true} };
  enPassant = null;
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
      if (piece) {
        d.innerHTML = `<span class="piece ${piece.c==='w'?'pc-w':'pc-b'}">${PIECES[piece.c][piece.p]}</span>`;
      }
      if (selected && selected.r===r && selected.c===c) d.classList.add('sel');
      if (lastMove && ((lastMove.from.r===r && lastMove.from.c===c) || (lastMove.to.r===r && lastMove.to.c===c))) d.classList.add('last');
      const hint = highlights.find(m=>m.r===r&&m.c===c);
      if (hint) d.classList.add(hint.cap?'cap':'mv');
      d.onclick = () => onSquareClick(r,c);
      el.appendChild(d);
    }
  }
}

function onSquareClick(r,c) {
  if (gameOver) return;
  const piece = board[r][c];
  if (onlineMode && currentTurn !== PLAYER_COLOR) return;
  if (selected) {
    const from = selected; const to = {r,c};
    const legalMoveList = generateLegalMoves(from);
    const legal = legalMoveList.some(m => m.r===to.r && m.c===to.c);
    if (legal) {
      makeMove(from, to);
      lastMove = {from: {...from}, to: {...to}};
      selected = null;
      highlights = [];
      currentTurn = (PLAYER_COLOR==='w')?'b':'w';
      renderBoard();
      updateTurnInfo();
      scheduleTurnTimer();
      if (onlineMode) {
        if (socket) {
          socket.emit('chess_move', { table_id: TABLE_ID, from, to });
          socket.emit('opponent_move', { table_id: TABLE_ID, from, to });
        }
      } else {
        setTimeout(botMove, 500);
      }
      return;
    }
    selected = null;
    highlights = [];
    renderBoard();
    return;
  }
  const myColor = onlineMode ? PLAYER_COLOR : 'w';
  if (piece && piece.c === myColor && currentTurn === myColor) {
    selected = {r,c};
    const ms = generateLegalMoves(selected);
    highlights = ms.map(m=>({r:m.r,c:m.c,cap:!!board[m.r][m.c] || (enPassant && enPassant.r===m.r && enPassant.c===m.c)}));
    renderBoard();
  }
}

function inBounds(r,c){return r>=0&&r<8&&c>=0&&c<8}
function isEnemy(r,c,color){return board[r][c]&&board[r][c].c!==color}
function isEmpty(r,c){return !board[r][c]}

function generatePseudoMoves(from){
  const piece = board[from.r][from.c];
  const color = piece.c; const moves=[];
  const drc=[
    {p:'N',v:[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]},
    {p:'K',v:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]}
  ];
  if (piece.p==='N'){for(const [dr,dc] of drc[0].v){const r=from.r+dr,c=from.c+dc;if(inBounds(r,c)&&(!board[r][c]||isEnemy(r,c,color)))moves.push({r,c})}}
  else if(piece.p==='K'){for(const [dr,dc] of drc[1].v){const r=from.r+dr,c=from.c+dc;if(inBounds(r,c)&&(!board[r][c]||isEnemy(r,c,color)))moves.push({r,c})}
    if(color==='w'&&from.r===7&&from.c===4){if(castle.w.k&&isEmpty(7,5)&&isEmpty(7,6))moves.push({r:7,c:6});if(castle.w.q&&isEmpty(7,3)&&isEmpty(7,2)&&isEmpty(7,1))moves.push({r:7,c:2})}
    if(color==='b'&&from.r===0&&from.c===4){if(castle.b.k&&isEmpty(0,5)&&isEmpty(0,6))moves.push({r:0,c:6});if(castle.b.q&&isEmpty(0,3)&&isEmpty(0,2)&&isEmpty(0,1))moves.push({r:0,c:2})}
  }
  else if(piece.p==='R'||piece.p==='B'||piece.p==='Q'){
    const dirs=[];
    if(piece.p!=='B'){dirs.push([1,0],[-1,0],[0,1],[0,-1])}
    if(piece.p!=='R'){dirs.push([1,1],[1,-1],[-1,1],[-1,-1])}
    for(const [sr,sc] of dirs){let r=from.r+sr,c=from.c+sc;while(inBounds(r,c)){if(isEmpty(r,c)){moves.push({r,c})}else{if(isEnemy(r,c,color))moves.push({r,c});break}r+=sr;c+=sc}}
  }
  else if(piece.p==='P'){
    const dir=color==='w'?-1:1;const start=color==='w'?6:1;const r1=from.r+dir;
    if(inBounds(r1,from.c)&&isEmpty(r1,from.c))moves.push({r:r1,c:from.c});
    const r2=from.r+2*dir;if(from.r===start&&isEmpty(r1,from.c)&&isEmpty(r2,from.c))moves.push({r:r2,c:from.c});
    for(const dc of [-1,1]){const r=from.r+dir,c=from.c+dc;if(inBounds(r,c)&&board[r][c]&&isEnemy(r,c,color))moves.push({r,c})}
    if(enPassant){const ep=enPassant;if(r1===ep.r&&Math.abs(from.c-ep.c)===1)moves.push({r:ep.r,c:ep.c})}
  }
  return moves;
}

function kingPos(color){for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p&&p.c===color&&p.p==='K')return{r,c}}return null}

function squareAttacked(r,c,byColor){
  for(let rr=0;rr<8;rr++)for(let cc=0;cc<8;cc++){const p=board[rr][cc];if(!p||p.c!==byColor)continue;const from={r:rr,c:cc};
    const pseudo=generatePseudoMoves(from);
    if(p.p==='P'){const dir=byColor==='w'?-1:1;for(const dc of[-1,1]){if(r===rr+dir&&c===cc+dc)return true}}
    else if(pseudo.some(m=>m.r===r&&m.c===c))return true;
  }
  return false;
}

function isKingInCheck(color){const kp=kingPos(color);if(!kp)return false;return squareAttacked(kp.r,kp.c,color==='w'?'b':'w')}

function generateLegalMoves(from){
  const piece=board[from.r][from.c]; if(!piece) return [];
  const color = piece.c;
  const moves=generatePseudoMoves(from); const legal=[];
  for(const m of moves){const savedEP=enPassant;const savedCastle=JSON.parse(JSON.stringify(castle));
    const snapshot=JSON.parse(JSON.stringify(board));
    applyMove(from,m);
    if(!isKingInCheck(color))legal.push(m);
    board=snapshot; enPassant=savedEP; castle=savedCastle;
  }
  return legal;
}

function applyMove(from,to){
  const piece=board[from.r][from.c];
  enPassant=null;
  if(piece.p==='K'){if(piece.c==='w'){castle.w.k=false;castle.w.q=false}else{castle.b.k=false;castle.b.q=false}
    if(Math.abs(to.c-from.c)===2){if(to.c===6){board[to.r][5]=board[to.r][7];board[to.r][7]=null}else{board[to.r][3]=board[to.r][0];board[to.r][0]=null}}
  }
  if(piece.p==='R'){if(piece.c==='w'){if(from.r===7&&from.c===0)castle.w.q=false;if(from.r===7&&from.c===7)castle.w.k=false}else{if(from.r===0&&from.c===0)castle.b.q=false;if(from.r===0&&from.c===7)castle.b.k=false}}
  if(piece.p==='P'){const dir=piece.c==='w'?-1:1;if(Math.abs(to.r-from.r)===2)enPassant={r:from.r+dir,c:from.c};
    if(to.r===from.r+dir&&Math.abs(to.c-from.c)===1&&isEmpty(to.r,to.c)){board[from.r][to.c]=null}
  }
  board[to.r][to.c]=piece; board[from.r][from.c]=null;
  if(piece.p==='P'&&(to.r===0||to.r===7))board[to.r][to.c]={c:piece.c,p:'Q'}
}

function makeMove(from,to){applyMove(from,to)}

function botMove() {
  if (gameOver || onlineMode) return;
  const moves=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(!p||p.c!=='b')continue;const from={r,c};
    const pseudo=generatePseudoMoves(from);
    for(const m of pseudo){const snapshot=JSON.parse(JSON.stringify(board));const savedEP=enPassant;const savedCastle=JSON.parse(JSON.stringify(castle));
      applyMove(from,m);
      const ok=!isKingInCheck('b');
      board=snapshot; enPassant=savedEP; castle=savedCastle;
      if(ok)moves.push({from,to:m});
    }
  }
  if(moves.length===0){ if(isKingInCheck('b')) endGame('win'); else endGame('draw'); return; }
  const mv=moves[Math.floor(Math.random()*moves.length)];
  applyMove(mv.from,mv.to);
  lastMove = {from: {...mv.from}, to: {...mv.to}};
  currentTurn='w';
  highlights = [];
  renderBoard(); updateTurnInfo(); scheduleTurnTimer();
}

function updateTurnInfo() {
  const el = document.getElementById('turnInfo');
  if (!onlineMode) {
    if (currentTurn === 'w') { el.textContent = 'Քո հերթն է'; el.style.color = '#8b5cf6'; }
    else { el.textContent = 'Բոտի հերթն է'; el.style.color = '#94a3b8'; }
  } else {
    const mine = PLAYER_COLOR===currentTurn;
    el.textContent = mine ? `Քո հերթն է (${PLAYER_COLOR==='w'?'սպիտակ':'սև'})` : `Մրցակցի հերթն է`;
    el.style.color = mine ? '#8b5cf6' : '#94a3b8';
  }
  const wCheck=isKingInCheck('w'); const bCheck=isKingInCheck('b');
  if(currentTurn==='w'&&wCheck) el.textContent+=' — Շախ';
  if(currentTurn==='b'&&bCheck) el.textContent+=' — Շախ';
}

function clearTurnTimers() {
  if (turnTimeoutId) { clearTimeout(turnTimeoutId); turnTimeoutId=null; }
  if (countdownIntervalId) { clearInterval(countdownIntervalId); countdownIntervalId=null; }
}

function scheduleTurnTimer() {
  clearTurnTimers();
  if (gameOver) return;
  if (onlineMode && currentTurn !== PLAYER_COLOR) return;
  if (!onlineMode && currentTurn !== 'w') return;
  const el = document.getElementById('turnInfo');
  const deadline = Date.now() + 30000;
  countdownIntervalId = setInterval(() => {
    const left = Math.max(0, deadline - Date.now());
    const s = Math.ceil(left/1000);
    el.textContent = `Քո հերթն է — ${s}վրկ`;
  }, 250);
  turnTimeoutId = setTimeout(() => { endGame('lose'); }, 30000);
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
  if (onlineMode) {
    socket = io(API);
    socket.emit('join_table', { table_id: TABLE_ID });
    const applyIncoming = (data)=>{
      if (data && data.table_id===TABLE_ID && data.from && data.to) {
        applyMove(data.from, data.to);
        lastMove = {from:{...data.from}, to:{...data.to}};
        currentTurn = PLAYER_COLOR;
        renderBoard(); updateTurnInfo(); scheduleTurnTimer();
      }
    };
    socket.on('chess_move', applyIncoming);
    socket.on('opponent_move', applyIncoming);
    socket.on('game_over', (data)=>{
      if (data && data.table_id===TABLE_ID) {
        endGame(data.result||'lose');
      }
    });
  }
}

window.onload = init;
