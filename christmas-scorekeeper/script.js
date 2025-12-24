/**
 * Christmas Scorer - Real-time Interactive Version
 * Roles: 
 * - Host: Manages scores, starts game, holds the main display.
 * - Player: Joins via QR, enters team name, acts as a buzzer.
 */

// Firebase Configuration
// Integrated with user's keys
const firebaseConfig = {
    apiKey: "AIzaSyBBiFly_Ua5wY-JUXKl9noE0mtYfY-CX7Y",
    authDomain: "christmas-scorer.firebaseapp.com",
    databaseURL: "https://christmas-scorer-default-rtdb.asia-southeast1.firebasedatabase.app",
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
    role: 'host',
    gameId: 'xmas-party-2025',
    selectedTeamCount: 3,
    teamConfigs: {},
    teams: [],
    gameName: "",
    gameMode: 'normal',
    bioscopeRound: 1, // Current active round (1-10)
    bioscopeRevealedCount: 0,
    lastAnnouncement: "",
    myTeamId: null,
    buzzerWinner: null
};

// Puzzle Configuration (Expected paths in /bioscope/roundX/Y.jpg)
const bioscopePuzzles = Array.from({ length: 10 }, (_, i) => ({
    round: i + 1,
    images: Array.from({ length: 6 }, (_, j) => `bioscope/round${i + 1}/${j + 1}.jpg`)
}));

// --- Initialization ---

window.onload = () => {
    try {
        console.log("App Initializing...");
        detectRole();
        setupFirebaseSync();

        if (gameState.role === 'host') {
            generateInviteQR();
            initBioscopeRoundSelector();
            // Initialize defaults in Firebase if it's a new host session
            if (db) {
                const gameRef = db.ref('games/' + gameState.gameId);
                gameRef.once('value').then(snap => {
                    const data = snap.val();
                    if (!data || !data.selectedTeamCount) {
                        console.log("Initializing default Firebase state...");
                        gameRef.update({
                            selectedTeamCount: 3,
                            teamConfigs: {
                                1: "The Elves",
                                2: "Reindeer",
                                3: "Snowmen"
                            }
                        });
                    }
                });
            }
        }
    } catch (e) {
        console.error("Initialization Error:", e);
        if (gameState.role === 'host') {
            document.getElementById('setup-screen').classList.add('active');
        }
    }
};

function detectRole() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('join')) {
        gameState.role = 'player';
        document.getElementById('setup-screen').classList.replace('active', 'hidden');
        document.getElementById('player-join-screen').classList.remove('hidden');
        document.getElementById('player-join-screen').classList.add('active');
    } else {
        gameState.role = 'host';
        document.getElementById('setup-screen').classList.add('active');
    }
}

function setupFirebaseSync() {
    if (!db) {
        console.error("Database object not found! Check your Firebase config.");
        return;
    }

    // Diagnostic: Check connection to Firebase
    const connectedRef = firebase.database().ref(".info/connected");
    connectedRef.on("value", (snap) => {
        if (snap.val() === true) {
            console.log("🟢 Firebase Connected successfully!");
        } else {
            console.warn("🔴 Firebase Disconnected. Check your Rules or Internet.");
        }
    });

    const gameRef = db.ref('games/' + gameState.gameId);

    // Watch for Team Changes
    gameRef.child('teams').on('value', (snapshot) => {
        const teamsData = snapshot.val();
        gameState.teams = teamsData ? Object.values(teamsData) : [];
        console.log("Sync Update: Received", gameState.teams.length, "teams from Firebase.");

        if (gameState.role === 'host') {
            updateHostUI();
        } else {
            updatePlayerUI();
        }
    }, (error) => {
        console.error("Firebase Read Error:", error.message);
        if (error.message.includes("permission_denied")) {
            alert("Firebase Error: Permission Denied. Did you set Rules to 'Test Mode'?");
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

    // Watch for Team Count
    gameRef.child('selectedTeamCount').on('value', (snapshot) => {
        const count = snapshot.val();
        if (count) {
            gameState.selectedTeamCount = count;
            if (gameState.role === 'host') {
                document.querySelectorAll('.team-count-btn').forEach(btn => {
                    btn.classList.toggle('active', parseInt(btn.innerText) === count);
                });
                // Show/Hide input slots
                for (let i = 1; i <= 5; i++) {
                    const slot = document.getElementById(`slot-${i}`);
                    if (slot) slot.classList.toggle('hidden', i > count);
                }
            } else {
                updatePlayerUI();
            }
        }
    });

    // Watch for Team Configs (Names)
    gameRef.child('teamConfigs').on('value', (snapshot) => {
        gameState.teamConfigs = snapshot.val() || {};
        if (gameState.role === 'player') {
            updatePlayerUI();
        }
    });

    // Watch for Game Mode
    gameRef.child('gameMode').on('value', (snapshot) => {
        const mode = snapshot.val() || 'normal';
        gameState.gameMode = mode;
        updateModeUI();
    });

    // Watch for Bioscope Progress
    gameRef.child('bioscope').on('value', (snapshot) => {
        const bioData = snapshot.val();
        if (bioData) {
            gameState.bioscopeRound = bioData.round || 1;
            gameState.bioscopeRevealedCount = bioData.revealedCount || 0;
            renderBioscope();
        }
    });
}

// --- Host Logic ---

function generateInviteQR() {
    try {
        const joinUrl = window.location.href.split('?')[0] + '?join=true';
        const qrcodeContainer = document.getElementById('qrcode');
        if (!qrcodeContainer) return;

        qrcodeContainer.innerHTML = "";

        // Create QR
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrcodeContainer, {
                text: joinUrl,
                width: 300,
                height: 300
            });
        } else {
            qrcodeContainer.innerHTML = "<p style='color:red'>QR Code Library load failure. Please refresh.</p>";
        }

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
    } catch (e) {
        console.error("QR Generation Error:", e);
    }
}

function selectTeamCount(count) {
    gameState.selectedTeamCount = count;
    document.querySelectorAll('.team-count-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.innerText) === count);
    });

    // Show/Hide input slots
    for (let i = 1; i <= 5; i++) {
        const slot = document.getElementById(`slot-${i}`);
        if (slot) slot.classList.toggle('hidden', i > count);
    }

    if (db) {
        // When count changes, it's safer to clear the previously joined teams
        // to avoid "All teams full" errors on phones.
        db.ref('games/' + gameState.gameId).update({
            selectedTeamCount: count,
            teams: null,
            buzzer: null
        });
    }
}

function resetEntireGame() {
    if (confirm("This will RESET everything: joined teams, scores, and names. Proceed?")) {
        if (db) {
            db.ref('games/' + gameState.gameId).set({
                selectedTeamCount: gameState.selectedTeamCount,
                gameName: gameState.gameName || "",
                teamConfigs: gameState.teamConfigs || {}
            });
            alert("Game Reset Complete. Guests can now join fresh!");
        }
    }
}

function updateTeamName(index, name) {
    gameState.teamConfigs[index] = name;
    if (db) {
        db.ref('games/' + gameState.gameId + '/teamConfigs/' + index).set(name);
    }
}

function updateHostUI() {
    const container = document.getElementById('team-names-container');
    const startBtn = document.getElementById('start-btn');
    if (!container || !startBtn) return;

    if (gameState.teams.length === 0) {
        container.innerHTML = '<p class="waiting-msg">Waiting for guests to pick a team...</p>';
        container.classList.remove('hidden');
        startBtn.disabled = true;
    } else {
        container.innerHTML = '<h3>Joined Teams:</h3>';
        gameState.teams.forEach(team => {
            container.innerHTML += `<div class="team-slot">${team.name || '<i>Joining...</i>'}</div>`;
        });
        container.innerHTML += `<button class="btn-secondary" style="margin-top:20px; font-size:12px; padding:5px 10px;" onclick="clearAllTeams()">Reset Joined Teams</button>`;
        container.classList.remove('hidden');
        startBtn.disabled = gameState.teams.length < 1;
    }

    renderScoreboard();
}

function clearAllTeams() {
    if (confirm("This will remove all joined players. Are you sure?")) {
        if (db) {
            db.ref('games/' + gameState.gameId + '/teams').set(null);
        }
    }
}

function setGameMode(mode) {
    gameState.gameMode = mode;
    document.getElementById('mode-normal-btn').classList.toggle('active', mode === 'normal');
    document.getElementById('mode-bioscope-btn').classList.toggle('active', mode === 'bioscope');
    document.getElementById('bioscope-setup').classList.toggle('hidden', mode !== 'bioscope');

    if (db) {
        db.ref('games/' + gameState.gameId + '/gameMode').set(mode);
    }
}

function updateModeUI() {
    const isBio = gameState.gameMode === 'bioscope';
    const display = document.getElementById('bioscope-display');
    const revealBtn = document.getElementById('reveal-btn');

    if (display) display.classList.toggle('hidden', !isBio);
    if (revealBtn) revealBtn.classList.toggle('hidden', !isBio);
}

function setBioscopeRound(roundNum) {
    gameState.bioscopeRound = roundNum;
    gameState.bioscopeRevealedCount = 0;

    // Update Host UI Buttons
    document.querySelectorAll('.round-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.innerText) === roundNum);
    });

    if (db) {
        db.ref('games/' + gameState.gameId + '/bioscope').set({
            round: roundNum,
            revealedCount: 0
        });
    }
}

function revealNextImage() {
    if (gameState.bioscopeRevealedCount < 6) {
        gameState.bioscopeRevealedCount++;
        if (db) {
            db.ref('games/' + gameState.gameId + '/bioscope/revealedCount').set(gameState.bioscopeRevealedCount);
        }
    }
}

function renderBioscope() {
    const roundData = bioscopePuzzles.find(p => p.round === gameState.bioscopeRound);
    if (!roundData) return;

    // Update Round Counter on TV
    const roundNumEl = document.getElementById('current-round-number');
    const roundInfoEl = document.getElementById('bioscope-round-info');
    if (roundNumEl) roundNumEl.innerText = gameState.bioscopeRound;
    if (roundInfoEl) roundInfoEl.classList.remove('hidden');

    for (let i = 1; i <= 6; i++) {
        const frame = document.getElementById(`frame-${i}`);
        if (!frame) continue;

        const isRevealed = i <= gameState.bioscopeRevealedCount;
        const url = roundData.images[i - 1];

        if (isRevealed && url) {
            frame.innerHTML = `<img src="${url}" alt="Lyric Clue" onerror="this.src='https://placehold.co/400x400?text=Clue+Not+Found'">`;
            frame.classList.add('revealed');
        } else {
            frame.innerHTML = `<span style="font-size:2rem; opacity:0.3;">${i}</span>`;
            frame.classList.remove('revealed');
        }
    }
}

function initBioscopeRoundSelector() {
    const container = document.getElementById('round-selector-grid');
    if (!container) return;

    container.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        container.innerHTML += `<button class="round-btn ${i === 1 ? 'active' : ''}" onclick="setBioscopeRound(${i})">${i}</button>`;
    }
}

function startGame() {
    try {
        console.log("Attempting to start game. Teams:", gameState.teams.length);

        if (gameState.gameMode === 'bioscope' && db) {
            // Reset revelation for the selected round
            db.ref('games/' + gameState.gameId + '/bioscope/revealedCount').set(0);
        }

        const setupScreen = document.getElementById('setup-screen');
        const gameScreen = document.getElementById('game-screen');

        if (!setupScreen || !gameScreen) {
            throw new Error("Screen elements missing from HTML!");
        }

        setupScreen.classList.remove('active');
        setupScreen.classList.add('hidden');

        gameScreen.classList.remove('hidden');
        gameScreen.classList.add('active');

        renderScoreboard();
        saveState();
        console.log("Game started successfully.");
    } catch (e) {
        console.error("Critical Start Error:", e);
        // Show a more helpful message
        alert("Oops! Game couldn't start. Error: " + (e.message || e));
    }
}

function renderScoreboard() {
    const scoreboard = document.getElementById('scoreboard');
    if (!scoreboard) return;
    scoreboard.innerHTML = "";

    gameState.teams.forEach((team, index) => {
        const card = document.createElement('div');
        card.className = `score-card ${gameState.buzzerWinner === team.id ? 'buzzed' : ''}`;
        card.innerHTML = `
            <h3>${team.name}</h3>
            <div class="current-score" id="score-${team.id}">${team.score}</div>
            <div class="score-controls">
                <button class="score-btn btn-sub" onclick="updateScore('${team.id}', -1)">-1</button>
                <button class="score-btn btn-add" onclick="updateScore('${team.id}', 1)">+1</button>
                <button class="score-btn btn-bonus" onclick="updateScore('${team.id}', 5)">+5 Bonus 🎁</button>
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
        selection.innerHTML = "<h3>Pick Your Team:</h3>";
        let hasOptions = false;

        console.log("Guest UI Update: Syncing with host... Teams:", gameState.teams.length, "Slots:", gameState.selectedTeamCount);

        for (let i = 1; i <= gameState.selectedTeamCount; i++) {
            const teamConfigs = gameState.teamConfigs || {};
            const teamName = teamConfigs[i] || `Team ${i}`;
            const teamId = `team_${i}`;

            // Look for this team in the joined list
            const isTaken = gameState.teams.some(t => t.id === teamId);

            if (!isTaken) {
                selection.innerHTML += `
                    <button class="btn-secondary" 
                            style="display:block; width:100%; margin:15px 0; padding:20px; font-size:1.5rem; background:rgba(255,255,255,0.2);" 
                            onclick="joinTeamSlot('${teamId}', '${teamName.replace(/'/g, "\\'")}')">
                        ${teamName}
                    </button>`;
                hasOptions = true;
            }
        }

        if (!hasOptions) {
            selection.innerHTML = `
                <div class="waiting-msg">
                    <p>All teams are currently full!</p>
                    <p style="font-size:12px; margin-top:10px; opacity:0.7;">
                        Currently seeing ${gameState.teams.length} teams in database. 
                        Target slots: ${gameState.selectedTeamCount}.
                    </p>
                    <p style="font-size:12px; margin-top:10px;">(Ask host to "Reset Joined Teams")</p>
                    <button class="btn-secondary" onclick="location.reload()" style="font-size:12px; margin-top:10px;">Refresh Page</button>
                </div>`;
        }
    }
}

function joinTeamSlot(teamId, teamName) {
    gameState.myTeamId = teamId;
    gameState.tempName = teamName;
    document.getElementById('player-team-selection').classList.add('hidden');
    document.getElementById('player-entry').classList.remove('hidden');
    document.getElementById('player-confirm-msg').innerHTML = `You are joining <strong>${teamName}</strong>`;
}

function confirmTeamJoin() {
    if (db) {
        db.ref(`games/${gameState.gameId}/teams/${gameState.myTeamId}`).set({
            id: gameState.myTeamId,
            name: gameState.tempName,
            score: 0
        });
    }

    document.getElementById('player-join-screen').classList.replace('active', 'hidden');
    document.getElementById('buzzer-screen').classList.add('active');
    document.getElementById('buzzer-screen').classList.remove('hidden');
    document.getElementById('player-team-info').innerText = "Team: " + gameState.tempName;
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
        // Play Buzzer SFX on Host
        const buzzerSfx = document.getElementById('buzzer-sfx');
        if (buzzerSfx) {
            buzzerSfx.currentTime = 0;
            buzzerSfx.play().catch(e => console.log("Buzzer play failed:", e));
        }

        const alert = document.getElementById('buzzer-alert');
        const nameEl = document.getElementById('buzzer-winner-name');
        if (winner && alert && nameEl) {
            nameEl.innerText = winner.name;
            alert.classList.remove('hidden');
            renderScoreboard();
        }
    } else {
        const btn = document.getElementById('buzzer-btn');
        const status = document.getElementById('buzzer-status');
        if (gameState.myTeamId === teamId) {
            if (status) {
                status.innerText = "YOU BUZZED!";
                status.style.color = "#ffd700";
            }
        } else {
            if (status) {
                status.innerText = `${winner ? winner.name : 'Someone'} buzzed!`;
                status.style.color = "#ff4d4d";
            }
        }
        if (btn) btn.classList.add('disabled');
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
        const alert = document.getElementById('buzzer-alert');
        if (alert) alert.classList.add('hidden');
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
    if (gameState.teams.length === 0) return;

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
    document.getElementById('winner-screen').classList.add('active');

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
        bgMusic.play().catch(e => console.log("Audio play failed:", e));
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
    document.getElementById('winner-screen').classList.remove('active');
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
