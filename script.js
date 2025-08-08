<<<<<<< HEAD
// Firebase SDK modules for Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyABHTvvyZ0q096atjtFfcyBkldLGeKMLqI",
  authDomain: "car-game-leaderboard-4ea96.firebaseapp.com",
  projectId: "car-game-leaderboard-4ea96",
  storageBucket: "car-game-leaderboard-4ea96.firebasestorage.app",
  messagingSenderId: "44343378625",
  appId: "1:44343378625:web:6dc7295f9ed4b8e9784a40",
  measurementId: "G-0N2K4QPX4K"
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const scoresCollectionRef = collection(db, 'scores');

// --- GAME SETUP ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const CAN_W = canvas.width, CAN_H = canvas.height;

const video = document.getElementById('video');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnReset = document.getElementById('btnReset');
const btnRestart = document.getElementById('btnRestart');
const p1scoreEl = document.getElementById('p1score');
const p1statusEl = document.getElementById('p1status');
const levelDisplay = document.getElementById('levelDisplay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreText = document.getElementById('finalScoreText');
const topScoreText = document.getElementById('topScoreText');
const leaderboardList = document.getElementById('leaderboardList');
const scoreSubmitWrap = document.getElementById('scoreSubmitWrap');
const playerNameInput = document.getElementById('playerNameInput');
const btnSubmitScore = document.getElementById('btnSubmitScore');

let running = false, paused = false, gameOver = false;
let latestHandResults = null;

const HIGH_SCORE_KEY = 'carGameHighScore';
let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});
hands.onResults((results) => { latestHandResults = results; });

let cameraFeed = null;
async function startCamera(){
  if(cameraFeed){ cameraFeed.stop(); cameraFeed = null; }
  const camera = new Camera(video, {
    onFrame: async () => { await hands.send({image: video}); },
    width: CAN_W, height: CAN_H,
    facingMode: 'user'
  });
  await camera.start();
}

// --- CORE GAME LOGIC & HELPERS ---
function smooth(a,b,t){ return a + (b - a) * t; }
function circlesCollide(x1,y1,r1,x2,y2,r2){ const dx = x1 - x2, dy = y1 - y2; return dx*dx + dy*dy < (r1 + r2)*(r1 + r2); }
function randomRange(min,max){ return Math.random()*(max-min)+min; }

function createCar(x,y,color){ return { x, y, vx:0, radius: 20, color, alive: true, score: 0, targetX: x }; }
const car = createCar(CAN_W/2, CAN_H - 60, '#66ffcc');

const coinImages = [];
const coinImageNames = ['coin1.png', 'coin2.png', 'coin3.png'];
for(let name of coinImageNames){ const img = new Image(); img.src = 'assets/' + name; coinImages.push(img); }
const coinPoints = [1,3,5];

const bombImg = new Image();
bombImg.src = 'assets/bomb.png';

let coins = [], bombs = [], explosions = [];
let lastTime = 0, level = 1, levelName = 'Easy';
const LEVELS = [
  { name:'Easy', coinSpawn: 1500, bombSpawn: 2500, coinSpeed: 100, bombSpeed: 120, coinSizeMult: 1 },
  { name:'Intermediate', coinSpawn: 900, bombSpawn: 1500, coinSpeed: 160, bombSpeed: 190, coinSizeMult: 1.5 },
  { name:'Hard', coinSpawn: 600, bombSpawn: 1000, coinSpeed: 230, bombSpeed: 270, coinSizeMult: 2 }
];
let coinSpawnTimer = 0, bombSpawnTimer = 0;

function resetGameState(){
  car.x = CAN_W/2; car.vx = 0; car.alive = true; car.score = 0; car.targetX = CAN_W/2;
  p1scoreEl.textContent = car.score;
  p1statusEl.textContent = 'OK';
  level = 1; levelName = LEVELS[0].name;
  levelDisplay.textContent = levelName;
  coins = []; bombs = []; explosions = [];
  gameOverOverlay.style.display = 'none';
  scoreSubmitWrap.style.display = 'none';
  playerNameInput.value = '';
  btnSubmitScore.disabled = false;
  btnSubmitScore.textContent = 'Submit to Leaderboard';
  gameOver = false; paused = false;
  btnPause.textContent = 'Pause';
  btnPause.disabled = false;
  coinSpawnTimer = 0; bombSpawnTimer = 0;
}

function createCoin(){let cType;if(car.score < 50) cType = 2; else if(car.score < 100) cType = 1; else cType = 0; const radius = 15 * LEVELS[level-1].coinSizeMult; const x = randomRange(radius, CAN_W - radius); return { x, y: -radius, vy: LEVELS[level-1].coinSpeed, radius, type: cType };}
function createBomb(){ const radius = 20 * LEVELS[level-1].coinSizeMult; const x = randomRange(radius, CAN_W - radius); return { x, y: -radius, vy: LEVELS[level-1].bombSpeed, radius };}
function createExplosion(x,y){ const container = document.createElement('div'); container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:100px;height:100px;'; document.body.appendChild(container); const anim = lottie.loadAnimation({ container, renderer: 'canvas', loop: false, autoplay: true, path: 'assets/explosion.json' }); anim.addEventListener('complete', () => { if(container.parentElement) container.parentElement.removeChild(container); }); return { x, y, anim, container };}

// --- DRAWING FUNCTIONS ---
function drawCoin(c){ const img = coinImages[c.type]; if(img.complete){ const size = c.radius * 3; ctx.drawImage(img, c.x - size/2, c.y - size/2, size, size); } else { ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.radius, c.radius, 0, 0, 2*Math.PI); ctx.fill(); }}
function drawBomb(b){ if(bombImg.complete){ const size = b.radius * 6; ctx.drawImage(bombImg, b.x - size/2, b.y - size/2, size, size); } else { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.radius * 0.7, b.radius, 0, 0, 2*Math.PI); ctx.fill(); }}
function drawExplosions(){ for(let i = explosions.length - 1; i >= 0; i--){ const exp = explosions[i]; const lottieCanvas = exp.anim.renderer && exp.anim.renderer.canvas; if(lottieCanvas) ctx.drawImage(lottieCanvas, 0, 0, lottieCanvas.width, lottieCanvas.height, exp.x - 50, exp.y - 50, 100, 100); if(!document.body.contains(exp.container)) explosions.splice(i,1); }}
function drawFrame(){ ctx.clearRect(0, 0, CAN_W, CAN_H); ctx.fillStyle = '#071018'; ctx.fillRect(0, 0, CAN_W, CAN_H); ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, CAN_W - 12, CAN_H - 12); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(car.x, car.y + 10, car.radius * 1.15, car.radius * 0.6, 0, 0, Math.PI * 2); ctx.fill(); for(const b of bombs) drawBomb(b); for(const c of coins) drawCoin(c); drawExplosions(); ctx.save(); ctx.translate(car.x, car.y); const lean = Math.max(-0.3, Math.min(0.3, car.vx * 0.01)); ctx.rotate(lean); ctx.fillStyle = car.color; ctx.beginPath(); ctx.roundRect(-car.radius, -car.radius*0.6, car.radius*2, car.radius*1.2, 6); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-car.radius*0.7, -car.radius*0.45, car.radius*1.4, car.radius*0.5); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(-car.radius*0.9, -car.radius*0.75, car.radius*0.35, car.radius*0.3); ctx.fillRect(car.radius*0.55, -car.radius*0.75, car.radius*0.35, car.radius*0.3); ctx.fillRect(-car.radius*0.9, car.radius*0.35, car.radius*0.35, car.radius*0.3); ctx.fillRect(car.radius*0.55, car.radius*0.35, car.radius*0.35, car.radius*0.3); ctx.restore();}
function drawPreview(){ previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height); previewCtx.save(); previewCtx.scale(-1, 1); previewCtx.translate(-previewCanvas.width, 0); previewCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height); previewCtx.restore(); if(latestHandResults && latestHandResults.multiHandLandmarks){ for(const landmarks of latestHandResults.multiHandLandmarks){ drawConnectors(previewCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2}); drawLandmarks(previewCtx, landmarks, {color: '#FF0000', lineWidth: 1}); }}}
function drawLandmarks(ctx, landmarks, style) { const {color='white', lineWidth=2} = style || {}; ctx.fillStyle = color; for(const l of landmarks){ const x = (1 - l.x) * previewCanvas.width; const y = l.y * previewCanvas.height; ctx.beginPath(); ctx.arc(x, y, lineWidth, 0, 2*Math.PI); ctx.fill(); }}
function drawConnectors(ctx, landmarks, connections, style) { const {color='white', lineWidth=2} = style || {}; ctx.strokeStyle = color; ctx.lineWidth = lineWidth; for(const [s, e] of connections){ const start = landmarks[s], end = landmarks[e]; const sx = (1-start.x)*previewCanvas.width, sy = start.y*previewCanvas.height; const ex = (1-end.x)*previewCanvas.width, ey = end.y*previewCanvas.height; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); }}

// --- GAME LOOP ---
function update(now){
  if(!running) return;
  requestAnimationFrame(update);
  drawPreview();
  if(paused || gameOver) return;
  const dt = Math.min(0.033, (now - lastTime)/1000); lastTime = now;
  const handLandmarks = latestHandResults ? (latestHandResults.multiHandLandmarks[0] || null) : null;
  if(car.alive){ if(handLandmarks && handLandmarks[8]){ const idx = {x: (1 - handLandmarks[8].x)*CAN_W, y: handLandmarks[8].y*CAN_H}; car.targetX = Math.min(CAN_W - 20, Math.max(20, idx.x)); p1statusEl.textContent = 'OK';} else { p1statusEl.textContent = 'NO HAND'; car.targetX = smooth(car.targetX, CAN_W/2, 0.05);} const dx = car.targetX - car.x; car.vx = smooth(car.vx, dx * 10, 0.15); car.x += car.vx * dt; car.x = Math.max(20, Math.min(CAN_W - 20, car.x)); car.vx *= 0.9;}
  coinSpawnTimer += dt * 1000; if(coinSpawnTimer > LEVELS[level-1].coinSpawn){ coins.push(createCoin()); coinSpawnTimer = 0;}
  bombSpawnTimer += dt * 1000; if(bombSpawnTimer > LEVELS[level-1].bombSpawn){ bombs.push(createBomb()); bombSpawnTimer = 0;}
  for(let i = coins.length - 1; i >= 0; i--){ const c = coins[i]; c.y += c.vy * dt; if(c.y - c.radius > CAN_H){ coins.splice(i,1); continue; } if(circlesCollide(c.x, c.y, c.radius, car.x, car.y, car.radius)){ car.score += coinPoints[c.type]; p1scoreEl.textContent = car.score; coins.splice(i,1); if(car.score >= 100) level = 3; else if(car.score >= 50) level = 2; else level = 1; levelName = LEVELS[level-1].name; levelDisplay.textContent = levelName;}}
  for(let i = bombs.length - 1; i >= 0; i--){ const b = bombs[i]; b.y += b.vy * dt; if(b.y - b.radius > CAN_H){ bombs.splice(i,1); continue; } if(circlesCollide(b.x, b.y, b.radius, car.x, car.y, car.radius)){ car.alive = false; gameOver = true; p1statusEl.textContent = 'HIT BOMB! GAME OVER'; bombs.splice(i, 1); explosions.push(createExplosion(b.x, b.y)); if(car.score > highScore){ highScore = car.score; localStorage.setItem(HIGH_SCORE_KEY, highScore); } showGameOver(); break;}}
  drawFrame();
}

// --- UI & FIREBASE FUNCTIONS ---
function showGameOver(){
  finalScoreText.textContent = `Your Score: ${car.score}`;
  topScoreText.textContent = `Personal Best: ${highScore}`;
  gameOverOverlay.style.display = 'flex';
  btnPause.disabled = true;
  if (car.score > 0) {
    scoreSubmitWrap.style.display = 'flex';
  }
}

async function updateLeaderboard() {
  leaderboardList.innerHTML = '<li>Loading...</li>';
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Create a query against the collection.
    const q = query(scoresCollectionRef, 
        where('timestamp', '>=', oneWeekAgo), 
        orderBy('timestamp', 'desc'), 
        orderBy('score', 'desc'), 
        limit(10));

    const querySnapshot = await getDocs(q);
      
    if (querySnapshot.empty) {
      leaderboardList.innerHTML = '<li>No scores yet this week!</li>';
      return;
    }

    let html = '';
    let rank = 1;
    querySnapshot.forEach(doc => {
      const data = doc.data();
      const playerName = data.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html += `<li style="display:flex; justify-content:space-between; padding: 4px 2px;">
                <span>${rank}. ${playerName}</span>
                <span style="font-weight:bold; color:var(--accent);">${data.score}</span>
               </li>`;
      rank++;
    });
    leaderboardList.innerHTML = html;
  } catch (error) {
    console.error("Error getting leaderboard: ", error);
    leaderboardList.innerHTML = '<li>Error loading scores.</li>';
    // PRO TIP: Check the browser console for a link to create a Firestore index!
  }
}

async function submitScore() {
  const playerName = playerNameInput.value.trim();
  if (!playerName) {
    alert('Please enter your name!');
    return;
  }
  
  btnSubmitScore.disabled = true;
  btnSubmitScore.textContent = 'Submitting...';

  try {
    await addDoc(scoresCollectionRef, {
      name: playerName,
      score: car.score,
      timestamp: serverTimestamp() // Use server time
    });
    scoreSubmitWrap.style.display = 'none';
    await updateLeaderboard();
  } catch (error) {
    console.error("Error adding document: ", error);
    alert('Could not submit score. Please try again.');
    btnSubmitScore.disabled = false;
    btnSubmitScore.textContent = 'Submit to Leaderboard';
  }
}

// --- BUTTON HANDLERS & INITIALIZATION ---
btnStart.onclick = () => { if(!running && !gameOver){ running = true; paused = false; lastTime = performance.now(); update(lastTime); }};
btnPause.onclick = () => { if(running && !gameOver){ paused = !paused; btnPause.textContent = paused ? 'Resume' : 'Pause'; }};
btnReset.onclick = () => { running = false; paused = false; gameOver = false; btnPause.textContent = 'Pause'; resetGameState(); drawFrame(); drawPreview();};
btnRestart.onclick = () => { resetGameState(); drawFrame(); drawPreview(); running = true; lastTime = performance.now(); update(lastTime); };
btnSubmitScore.onclick = submitScore;

(async ()=>{
  try{
    await startCamera();
    resetGameState();
    drawFrame();
    drawPreview();
    await updateLeaderboard(); 
  }catch(e){
    document.getElementById('hint').textContent = `Camera Error: ${e.message}`;
    document.getElementById('hint').style.color = 'var(--danger)';
  }
=======
// Firebase SDK modules for Firebase v9+
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyABHTvvyZ0q096atjtFfcyBkldLGeKMLqI",
  authDomain: "car-game-leaderboard-4ea96.firebaseapp.com",
  projectId: "car-game-leaderboard-4ea96",
  storageBucket: "car-game-leaderboard-4ea96.firebasestorage.app",
  messagingSenderId: "44343378625",
  appId: "1:44343378625:web:6dc7295f9ed4b8e9784a40",
  measurementId: "G-0N2K4QPX4K"
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const scoresCollectionRef = collection(db, 'scores');

// --- GAME SETUP ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const CAN_W = canvas.width, CAN_H = canvas.height;

const video = document.getElementById('video');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');

const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnReset = document.getElementById('btnReset');
const btnRestart = document.getElementById('btnRestart');
const p1scoreEl = document.getElementById('p1score');
const p1statusEl = document.getElementById('p1status');
const levelDisplay = document.getElementById('levelDisplay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreText = document.getElementById('finalScoreText');
const topScoreText = document.getElementById('topScoreText');
const leaderboardList = document.getElementById('leaderboardList');
const scoreSubmitWrap = document.getElementById('scoreSubmitWrap');
const playerNameInput = document.getElementById('playerNameInput');
const btnSubmitScore = document.getElementById('btnSubmitScore');

let running = false, paused = false, gameOver = false;
let latestHandResults = null;

const HIGH_SCORE_KEY = 'carGameHighScore';
let highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});
hands.onResults((results) => { latestHandResults = results; });

let cameraFeed = null;
async function startCamera(){
  if(cameraFeed){ cameraFeed.stop(); cameraFeed = null; }
  const camera = new Camera(video, {
    onFrame: async () => { await hands.send({image: video}); },
    width: CAN_W, height: CAN_H,
    facingMode: 'user'
  });
  await camera.start();
}

// --- CORE GAME LOGIC & HELPERS ---
function smooth(a,b,t){ return a + (b - a) * t; }
function circlesCollide(x1,y1,r1,x2,y2,r2){ const dx = x1 - x2, dy = y1 - y2; return dx*dx + dy*dy < (r1 + r2)*(r1 + r2); }
function randomRange(min,max){ return Math.random()*(max-min)+min; }

function createCar(x,y,color){ return { x, y, vx:0, radius: 20, color, alive: true, score: 0, targetX: x }; }
const car = createCar(CAN_W/2, CAN_H - 60, '#66ffcc');

const coinImages = [];
const coinImageNames = ['coin1.png', 'coin2.png', 'coin3.png'];
for(let name of coinImageNames){ const img = new Image(); img.src = 'assets/' + name; coinImages.push(img); }
const coinPoints = [1,3,5];

const bombImg = new Image();
bombImg.src = 'assets/bomb.png';

let coins = [], bombs = [], explosions = [];
let lastTime = 0, level = 1, levelName = 'Easy';
const LEVELS = [
  { name:'Easy', coinSpawn: 1500, bombSpawn: 2500, coinSpeed: 100, bombSpeed: 120, coinSizeMult: 1 },
  { name:'Intermediate', coinSpawn: 900, bombSpawn: 1500, coinSpeed: 160, bombSpeed: 190, coinSizeMult: 1.5 },
  { name:'Hard', coinSpawn: 600, bombSpawn: 1000, coinSpeed: 230, bombSpeed: 270, coinSizeMult: 2 }
];
let coinSpawnTimer = 0, bombSpawnTimer = 0;

function resetGameState(){
  car.x = CAN_W/2; car.vx = 0; car.alive = true; car.score = 0; car.targetX = CAN_W/2;
  p1scoreEl.textContent = car.score;
  p1statusEl.textContent = 'OK';
  level = 1; levelName = LEVELS[0].name;
  levelDisplay.textContent = levelName;
  coins = []; bombs = []; explosions = [];
  gameOverOverlay.style.display = 'none';
  scoreSubmitWrap.style.display = 'none';
  playerNameInput.value = '';
  btnSubmitScore.disabled = false;
  btnSubmitScore.textContent = 'Submit to Leaderboard';
  gameOver = false; paused = false;
  btnPause.textContent = 'Pause';
  btnPause.disabled = false;
  coinSpawnTimer = 0; bombSpawnTimer = 0;
}

function createCoin(){let cType;if(car.score < 50) cType = 2; else if(car.score < 100) cType = 1; else cType = 0; const radius = 15 * LEVELS[level-1].coinSizeMult; const x = randomRange(radius, CAN_W - radius); return { x, y: -radius, vy: LEVELS[level-1].coinSpeed, radius, type: cType };}
function createBomb(){ const radius = 20 * LEVELS[level-1].coinSizeMult; const x = randomRange(radius, CAN_W - radius); return { x, y: -radius, vy: LEVELS[level-1].bombSpeed, radius };}
function createExplosion(x,y){ const container = document.createElement('div'); container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:100px;height:100px;'; document.body.appendChild(container); const anim = lottie.loadAnimation({ container, renderer: 'canvas', loop: false, autoplay: true, path: 'assets/explosion.json' }); anim.addEventListener('complete', () => { if(container.parentElement) container.parentElement.removeChild(container); }); return { x, y, anim, container };}

// --- DRAWING FUNCTIONS ---
function drawCoin(c){ const img = coinImages[c.type]; if(img.complete){ const size = c.radius * 3; ctx.drawImage(img, c.x - size/2, c.y - size/2, size, size); } else { ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.ellipse(c.x, c.y, c.radius, c.radius, 0, 0, 2*Math.PI); ctx.fill(); }}
function drawBomb(b){ if(bombImg.complete){ const size = b.radius * 6; ctx.drawImage(bombImg, b.x - size/2, b.y - size/2, size, size); } else { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.radius * 0.7, b.radius, 0, 0, 2*Math.PI); ctx.fill(); }}
function drawExplosions(){ for(let i = explosions.length - 1; i >= 0; i--){ const exp = explosions[i]; const lottieCanvas = exp.anim.renderer && exp.anim.renderer.canvas; if(lottieCanvas) ctx.drawImage(lottieCanvas, 0, 0, lottieCanvas.width, lottieCanvas.height, exp.x - 50, exp.y - 50, 100, 100); if(!document.body.contains(exp.container)) explosions.splice(i,1); }}
function drawFrame(){ ctx.clearRect(0, 0, CAN_W, CAN_H); ctx.fillStyle = '#071018'; ctx.fillRect(0, 0, CAN_W, CAN_H); ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, CAN_W - 12, CAN_H - 12); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(car.x, car.y + 10, car.radius * 1.15, car.radius * 0.6, 0, 0, Math.PI * 2); ctx.fill(); for(const b of bombs) drawBomb(b); for(const c of coins) drawCoin(c); drawExplosions(); ctx.save(); ctx.translate(car.x, car.y); const lean = Math.max(-0.3, Math.min(0.3, car.vx * 0.01)); ctx.rotate(lean); ctx.fillStyle = car.color; ctx.beginPath(); ctx.roundRect(-car.radius, -car.radius*0.6, car.radius*2, car.radius*1.2, 6); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-car.radius*0.7, -car.radius*0.45, car.radius*1.4, car.radius*0.5); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(-car.radius*0.9, -car.radius*0.75, car.radius*0.35, car.radius*0.3); ctx.fillRect(car.radius*0.55, -car.radius*0.75, car.radius*0.35, car.radius*0.3); ctx.fillRect(-car.radius*0.9, car.radius*0.35, car.radius*0.35, car.radius*0.3); ctx.fillRect(car.radius*0.55, car.radius*0.35, car.radius*0.35, car.radius*0.3); ctx.restore();}
function drawPreview(){ previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height); previewCtx.save(); previewCtx.scale(-1, 1); previewCtx.translate(-previewCanvas.width, 0); previewCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height); previewCtx.restore(); if(latestHandResults && latestHandResults.multiHandLandmarks){ for(const landmarks of latestHandResults.multiHandLandmarks){ drawConnectors(previewCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2}); drawLandmarks(previewCtx, landmarks, {color: '#FF0000', lineWidth: 1}); }}}
function drawLandmarks(ctx, landmarks, style) { const {color='white', lineWidth=2} = style || {}; ctx.fillStyle = color; for(const l of landmarks){ const x = (1 - l.x) * previewCanvas.width; const y = l.y * previewCanvas.height; ctx.beginPath(); ctx.arc(x, y, lineWidth, 0, 2*Math.PI); ctx.fill(); }}
function drawConnectors(ctx, landmarks, connections, style) { const {color='white', lineWidth=2} = style || {}; ctx.strokeStyle = color; ctx.lineWidth = lineWidth; for(const [s, e] of connections){ const start = landmarks[s], end = landmarks[e]; const sx = (1-start.x)*previewCanvas.width, sy = start.y*previewCanvas.height; const ex = (1-end.x)*previewCanvas.width, ey = end.y*previewCanvas.height; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); }}

// --- GAME LOOP ---
function update(now){
  if(!running) return;
  requestAnimationFrame(update);
  drawPreview();
  if(paused || gameOver) return;
  const dt = Math.min(0.033, (now - lastTime)/1000); lastTime = now;
  const handLandmarks = latestHandResults ? (latestHandResults.multiHandLandmarks[0] || null) : null;
  if(car.alive){ if(handLandmarks && handLandmarks[8]){ const idx = {x: (1 - handLandmarks[8].x)*CAN_W, y: handLandmarks[8].y*CAN_H}; car.targetX = Math.min(CAN_W - 20, Math.max(20, idx.x)); p1statusEl.textContent = 'OK';} else { p1statusEl.textContent = 'NO HAND'; car.targetX = smooth(car.targetX, CAN_W/2, 0.05);} const dx = car.targetX - car.x; car.vx = smooth(car.vx, dx * 10, 0.15); car.x += car.vx * dt; car.x = Math.max(20, Math.min(CAN_W - 20, car.x)); car.vx *= 0.9;}
  coinSpawnTimer += dt * 1000; if(coinSpawnTimer > LEVELS[level-1].coinSpawn){ coins.push(createCoin()); coinSpawnTimer = 0;}
  bombSpawnTimer += dt * 1000; if(bombSpawnTimer > LEVELS[level-1].bombSpawn){ bombs.push(createBomb()); bombSpawnTimer = 0;}
  for(let i = coins.length - 1; i >= 0; i--){ const c = coins[i]; c.y += c.vy * dt; if(c.y - c.radius > CAN_H){ coins.splice(i,1); continue; } if(circlesCollide(c.x, c.y, c.radius, car.x, car.y, car.radius)){ car.score += coinPoints[c.type]; p1scoreEl.textContent = car.score; coins.splice(i,1); if(car.score >= 100) level = 3; else if(car.score >= 50) level = 2; else level = 1; levelName = LEVELS[level-1].name; levelDisplay.textContent = levelName;}}
  for(let i = bombs.length - 1; i >= 0; i--){ const b = bombs[i]; b.y += b.vy * dt; if(b.y - b.radius > CAN_H){ bombs.splice(i,1); continue; } if(circlesCollide(b.x, b.y, b.radius, car.x, car.y, car.radius)){ car.alive = false; gameOver = true; p1statusEl.textContent = 'HIT BOMB! GAME OVER'; bombs.splice(i, 1); explosions.push(createExplosion(b.x, b.y)); if(car.score > highScore){ highScore = car.score; localStorage.setItem(HIGH_SCORE_KEY, highScore); } showGameOver(); break;}}
  drawFrame();
}

// --- UI & FIREBASE FUNCTIONS ---
function showGameOver(){
  finalScoreText.textContent = `Your Score: ${car.score}`;
  topScoreText.textContent = `Personal Best: ${highScore}`;
  gameOverOverlay.style.display = 'flex';
  btnPause.disabled = true;
  if (car.score > 0) {
    scoreSubmitWrap.style.display = 'flex';
  }
}

async function updateLeaderboard() {
  leaderboardList.innerHTML = '<li>Loading...</li>';
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Create a query against the collection.
    const q = query(scoresCollectionRef, 
        where('timestamp', '>=', oneWeekAgo), 
        orderBy('timestamp', 'desc'), 
        orderBy('score', 'desc'), 
        limit(10));

    const querySnapshot = await getDocs(q);
      
    if (querySnapshot.empty) {
      leaderboardList.innerHTML = '<li>No scores yet this week!</li>';
      return;
    }

    let html = '';
    let rank = 1;
    querySnapshot.forEach(doc => {
      const data = doc.data();
      const playerName = data.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      html += `<li style="display:flex; justify-content:space-between; padding: 4px 2px;">
                <span>${rank}. ${playerName}</span>
                <span style="font-weight:bold; color:var(--accent);">${data.score}</span>
               </li>`;
      rank++;
    });
    leaderboardList.innerHTML = html;
  } catch (error) {
    console.error("Error getting leaderboard: ", error);
    leaderboardList.innerHTML = '<li>Error loading scores.</li>';
    // PRO TIP: Check the browser console for a link to create a Firestore index!
  }
}

async function submitScore() {
  const playerName = playerNameInput.value.trim();
  if (!playerName) {
    alert('Please enter your name!');
    return;
  }
  
  btnSubmitScore.disabled = true;
  btnSubmitScore.textContent = 'Submitting...';

  try {
    await addDoc(scoresCollectionRef, {
      name: playerName,
      score: car.score,
      timestamp: serverTimestamp() // Use server time
    });
    scoreSubmitWrap.style.display = 'none';
    await updateLeaderboard();
  } catch (error) {
    console.error("Error adding document: ", error);
    alert('Could not submit score. Please try again.');
    btnSubmitScore.disabled = false;
    btnSubmitScore.textContent = 'Submit to Leaderboard';
  }
}

// --- BUTTON HANDLERS & INITIALIZATION ---
btnStart.onclick = () => { if(!running && !gameOver){ running = true; paused = false; lastTime = performance.now(); update(lastTime); }};
btnPause.onclick = () => { if(running && !gameOver){ paused = !paused; btnPause.textContent = paused ? 'Resume' : 'Pause'; }};
btnReset.onclick = () => { running = false; paused = false; gameOver = false; btnPause.textContent = 'Pause'; resetGameState(); drawFrame(); drawPreview();};
btnRestart.onclick = () => { resetGameState(); drawFrame(); drawPreview(); running = true; lastTime = performance.now(); update(lastTime); };
btnSubmitScore.onclick = submitScore;

(async ()=>{
  try{
    await startCamera();
    resetGameState();
    drawFrame();
    drawPreview();
    await updateLeaderboard(); 
  }catch(e){
    document.getElementById('hint').textContent = `Camera Error: ${e.message}`;
    document.getElementById('hint').style.color = 'var(--danger)';
  }
>>>>>>> 29e202e40bc45086741fd149f77a752290febd57
})();