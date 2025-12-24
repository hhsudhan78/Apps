/**
 * Christmas Scorer - Real-time Interactive Version
 * Roles: 
 * - Host: Manages scores, starts game, holds the main display.
 * - Player: Joins via QR, enters team name, acts as a buzzer.
 */

// Firebase Configuration - Placeholder
// USER: Replace this once you have your Firebase config!
const firebaseConfig = {
    apiKey: "AIzaSyBBiFly_Ua5wY-JUXKl9noE0mtYfY-CX7Y",
    authDomain: "christmas-scorer.firebaseapp.com",
    databaseURL: "https://christmas-scorer-default-rtdb.firebaseio.com",
    projectId: "christmas-scorer",
    storageBucket: "christmas-scorer.firebasestorage.app",
    messagingSenderId: "118796280192",
    appId: "1:118796280192:web:9fabe18fb5995a2e9d2165"
};

// Initialize Firebase (Compat)
let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
} catch (e) {
    console.error("Firebase not configured. Using local mode.", e);
}

// Global State
let gameState = {
    role: 'host', // 'host' or 'player'
    gameId: 'xmas-party-2025', // Fixed for this party
    selectedTeamCount: 3,
    teams: [],
    gameName: "",
    lastAnnouncement: "",
    myTeamId: null, // For players
    buzzerWinner: null
};

// --- Initialization ---

window.onload = () => {
    detectRole();
    setupFirebaseSync();

    if (gameState.role === 'host') {
        generateInviteQR();
        // Load local game if exists
        const saved = localStorage.getItem('christmasGame_v2');
        if (saved) {
            const data = JSON.parse(saved);
            gameState.gameName = data.gameName || "";
        }
    }
};

function detectRole() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('join')) {
        gameState.role = 'player';
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('player-join-screen').classList.remove('active', 'hidden');
        document.getElementById('player-join-screen').classList.add('active');
    } else {
        gameState.role = 'host';
    }
}

function setupFirebaseSync() {
    if (!db) return;

    const gameRef = db.ref('games/' + gameState.gameId);

    // Watch for Team Changes
    gameRef.child('teams').on('value', (snapshot) => {
        const teamsData = snapshot.val();
        gameState.teams = teamsData ? Object.values(teamsData) : [];

        if (gameState.role === 'host') {
            updateHostUI();
        } else {
            updatePlayerUI();
        }
    });

    // Watch for Game Name
    gameRef.child('gameName').on('value', (snapshot) => {
        gameState.gameName = snapshot.val() || "";
        const input = document.getElementById('game-name-input');
        if (input && document.activeElement !== input) {
            input.value = gameState.gameName;
        }
    });

    // Watch for Buzzer
    gameRef.child('buzzer').on('value', (snapshot) => {
        const buzzerData = snapshot.val();
        if (buzzerData && buzzerData.teamId !== null) {
            handleBuzzerTrigger(buzzerData.teamId);
        } else {
            clearBuzzerUI();
        }
    });
}

// --- Host Logic ---

function generateInviteQR() {
    const joinUrl = window.location.href.split('?')[0] + '?join=true';
    const qrcodeContainer = document.getElementById('qrcode');
    qrcodeContainer.innerHTML = "";

    // Create QR
    new QRCode(qrcodeContainer, {
        text: joinUrl,
        width: 128,
        height: 128
    });

    // Show text link below for debugging
    const linkText = document.createElement('div');
    linkText.style.fontSize = '10px';
    linkText.style.marginTop = '10px';
    linkText.style.color = '#ccc';
    linkText.style.wordBreak = 'break-all';
    linkText.innerText = joinUrl;
    qrcodeContainer.appendChild(linkText);

    if (joinUrl.startsWith('file://')) {
        const warning = document.createElement('p');
        warning.style.color = '#ff4d4d';
        warning.style.fontWeight = 'bold';
        warning.style.fontSize = '12px';
        warning.innerText = "⚠️ Scanning won't work while opening as a 'file'. See walkthrough for fixes!";
        qrcodeContainer.appendChild(warning);
    }
}

function selectTeamCount(count) {
    gameState.selectedTeamCount = count;
    document.querySelectorAll('.team-count-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.innerText) === count);
    });

    // Clear Firebase teams if count changes (optional, but keeps it clean)
    if (db) {
        db.ref('games/' + gameState.gameId + '/teams').set(null);
    }
}

function updateHostUI() {
    const container = document.getElementById('team-names-container');
    const startBtn = document.getElementById('start-btn');

    if (gameState.teams.length === 0) {
        container.innerHTML = '<p class="waiting-msg">Waiting for players to join via QR code...</p>';
        startBtn.disabled = true;
    } else {
        container.innerHTML = '<h3>Joined Teams:</h3>';
        gameState.teams.forEach(team => {
            container.innerHTML += `<div class="team-slot">${team.name || '<i>Joining...</i>'}</div>`;
        });
        startBtn.disabled = gameState.teams.length < 2;
    }

    renderScoreboard();
}

function startGame() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    renderScoreboard();
    saveState();
}

function renderScoreboard() {
    const scoreboard = document.getElementById('scoreboard');
    if (!scoreboard) return;
    scoreboard.innerHTML = "";

    gameState.teams.forEach((team, index) => {
        const card = document.createElement('div');
        card.className = `team-card glass ${gameState.buzzerWinner === team.id ? 'buzzed' : ''}`;
        card.innerHTML = `
            <div class="team-name">${team.name}</div>
            <div class="score-display" id="score-${team.id}">${team.score}</div>
            <div class="score-controls">
                <button class="score-btn" onclick="updateScore('${team.id}', -1)">-1</button>
                <button class="score-btn" onclick="updateScore('${team.id}', 1)">+1</button>
                <div class="bonus-row">
                    <button class="score-btn bonus" onclick="updateScore('${team.id}', 5)">+5</button>
                    <button class="score-btn bonus" onclick="updateScore('${team.id}', 25)">+25</button>
                </div>
            </div>
        `;
        scoreboard.appendChild(card);
    });
}

function updateScore(teamId, delta) {
    const team = gameState.teams.find(t => t.id === teamId);
    if (team) {
        team.score = Math.max(0, (team.score || 0) + delta);
        if (db) {
            db.ref(`games/${gameState.gameId}/teams/${teamId}/score`).set(team.score);
        }
        saveState();
    }
}

function updateGameName(name) {
    gameState.gameName = name;
    if (db) {
        db.ref(`games/${gameState.gameId}/gameName`).set(name);
    }
    saveState();
}

// --- Player Logic ---

function updatePlayerUI() {
    const selection = document.getElementById('player-team-selection');
    if (!selection) return;

    if (!gameState.myTeamId) {
        // Show available slots
        selection.innerHTML = "<h3>Pick a Team Number:</h3>";
        for (let i = 1; i <= gameState.selectedTeamCount; i++) {
            const teamId = `team_${i}`;
            const existing = gameState.teams.find(t => t.id === teamId);
            if (!existing) {
                selection.innerHTML += `<button class="btn-secondary" onclick="joinTeamSlot('${teamId}')">Team ${i}</button>`;
            }
        }
    }
}

function joinTeamSlot(teamId) {
    gameState.myTeamId = teamId;
    document.getElementById('player-team-selection').classList.add('hidden');
    document.getElementById('player-entry').classList.remove('hidden');
}

function submitPlayerName() {
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim() || `Team ${gameState.myTeamId.split('_')[1]}`;

    if (db) {
        db.ref(`games/${gameState.gameId}/teams/${gameState.myTeamId}`).set({
            id: gameState.myTeamId,
            name: name,
            score: 0
        });
    }

    document.getElementById('player-join-screen').classList.add('hidden');
    document.getElementById('buzzer-screen').classList.remove('hidden');
    document.getElementById('player-team-info').innerText = "Team: " + name;
}

// --- Buzzer Logic ---

function pressBuzzer() {
    if (!db || !gameState.myTeamId) return;

    // First one to set it wins
    db.ref(`games/${gameState.gameId}/buzzer`).transaction((currentData) => {
        if (currentData === null || currentData.teamId === null) {
            return { teamId: gameState.myTeamId };
        }
        return; // Don't change if someone else already buzzed
    });
}

function handleBuzzerTrigger(teamId) {
    gameState.buzzerWinner = teamId;
    const winner = gameState.teams.find(t => t.id === teamId);

    if (gameState.role === 'host') {
        const alert = document.getElementById('buzzer-alert');
        const nameEl = document.getElementById('buzzer-winner-name');
        if (winner) {
            nameEl.innerText = winner.name;
            alert.classList.remove('hidden');
            renderScoreboard();
        }
    } else {
        const btn = document.getElementById('buzzer-btn');
        const status = document.getElementById('buzzer-status');
        if (gameState.myTeamId === teamId) {
            status.innerText = "YOU BUZZED!";
            status.style.color = "#ffd700";
        } else {
            status.innerText = `${winner ? winner.name : 'Someone'} buzzed!`;
            status.style.color = "#ff4d4d";
        }
        btn.classList.add('disabled');
    }
}

function resetBuzzer() {
    if (db) {
        db.ref(`games/${gameState.gameId}/buzzer`).set(null);
    }
}

function clearBuzzerUI() {
    gameState.buzzerWinner = null;
    if (gameState.role === 'host') {
        document.getElementById('buzzer-alert').classList.add('hidden');
        renderScoreboard();
    } else {
        const btn = document.getElementById('buzzer-btn');
        const status = document.getElementById('buzzer-status');
        if (btn) btn.classList.remove('disabled');
        if (status) {
            status.innerText = "Ready...";
            status.style.color = "white";
        }
    }
}

// --- Scoring & Finalization ---

function resetScores() {
    if (confirm("Reset all team scores for this game?")) {
        gameState.teams.forEach(t => {
            if (db) db.ref(`games/${gameState.gameId}/teams/${t.id}/score`).set(0);
        });
    }
}

function newGame() {
    if (confirm("Start a completely new game? All current teams will be removed.")) {
        if (db) db.ref(`games/${gameState.gameId}`).set(null);
        window.location.reload();
    }
}

function finishGame() {
    const maxScore = Math.max(...gameState.teams.map(t => t.score));
    const winners = gameState.teams.filter(t => t.score === maxScore);

    const winnerNameEl = document.getElementById('winner-name');
    const winnerScoreEl = document.getElementById('winner-score');

    if (winners.length === 1) {
        winnerNameEl.innerText = winners[0].name;
    } else {
        winnerNameEl.innerText = winners.map(w => w.name).join(' & ');
    }
    winnerScoreEl.innerText = `${maxScore} pts!`;

    document.getElementById('winner-screen').classList.remove('hidden');

    // Announcement
    const gName = gameState.gameName || "the game";
    const winnerTxt = winners.length === 1 ?
        `${winners[0].name} is the winner of ${gName}!` :
        `${winners.map(w => w.name).join(' and ')} are the winners of ${gName}!`;

    gameState.lastAnnouncement = winnerTxt;
    speakWinner(winnerTxt);

    // BGM
    const bgMusic = document.getElementById('bg-celebration-music');
    if (bgMusic) {
        bgMusic.volume = 0.5;
        bgMusic.currentTime = 0;
        bgMusic.play();
    }

    startConfetti();
}

function saveState() {
    localStorage.setItem('christmasGame_v2', JSON.stringify({
        gameName: gameState.gameName
    }));
}

// --- Celebration Effects ---

function closeWinnerScreen() {
    isAnnouncing = false;
    document.getElementById('winner-screen').classList.add('hidden');
    stopConfetti();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const bgMusic = document.getElementById('bg-celebration-music');
    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
}

function playCelebrationAudio() {
    if (gameState.lastAnnouncement) speakWinner(gameState.lastAnnouncement);
    const bgMusic = document.getElementById('bg-celebration-music');
    if (bgMusic && bgMusic.paused) {
        bgMusic.currentTime = 0;
        bgMusic.play();
    }
}

let isAnnouncing = false;
function speakWinner(text) {
    if (!('speechSynthesis' in window)) return;
    if (!isAnnouncing) window.speechSynthesis.cancel();
    isAnnouncing = true;

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = voices.find(v => v.name.includes("Zira") || v.name.includes("Samantha") || v.name.includes("Female"));
    if (!selectedVoice) selectedVoice = voices.find(v => v.lang.startsWith('en'));

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1.1;
    utterance.pitch = 1.2;
    utterance.onend = () => {
        if (isAnnouncing) setTimeout(() => speakWinner(text), 500);
    };
    window.speechSynthesis.speak(utterance);
}

// --- Confetti Engine ---
let confettiActive = false;
let confettiParticles = [];
const confettiColors = ['#d42426', '#2f5a2e', '#f8b229', '#ffffff', '#ff0000', '#00ff00'];

function startConfetti() {
    if (confettiActive) return;
    confettiActive = true;
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    confettiParticles = [];
    for (let i = 0; i < 150; i++) confettiParticles.push(createParticle());
    requestAnimationFrame(renderConfetti);
}

function stopConfetti() { confettiActive = false; }
function createParticle() {
    return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight - window.innerHeight,
        size: Math.random() * 10 + 5,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        speed: Math.random() * 3 + 2,
        angle: Math.random() * 360,
        spin: Math.random() * 0.2 - 0.1
    };
}
function renderConfetti() {
    if (!confettiActive) return;
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiParticles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
        p.y += p.speed;
        p.angle += p.spin;
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
    });
    requestAnimationFrame(renderConfetti);
}
