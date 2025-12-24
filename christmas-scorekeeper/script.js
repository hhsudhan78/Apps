let gameState = {
    teams: [],
    history: [],
    gameName: ""
};

// Default team names
const defaultNames = ["Santa's Helpers", "Rudolph's Racers", "Frosty's Friends", "Elf Squad", "Jingle Bells"];

let currentTeamCount = 3;

document.addEventListener('DOMContentLoaded', () => {
    renderTeamInputs();

    // Check for saved game
    const saved = localStorage.getItem('christmasGame');
    if (saved) {
        if (confirm("Resume previous game?")) {
            gameState = JSON.parse(saved);
            startGame(true);
            if (gameState.gameName) {
                document.getElementById('game-name-input').value = gameState.gameName;
            }
        }
    }
});

function selectTeamCount(count) {
    currentTeamCount = count;
    document.querySelectorAll('.team-count-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.innerText) === count) btn.classList.add('active');
    });
    renderTeamInputs();
}

function renderTeamInputs() {
    const container = document.getElementById('team-names-container');
    container.innerHTML = '';

    for (let i = 0; i < currentTeamCount; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'team-name-input';
        input.placeholder = `Team ${i + 1} Name (e.g. ${defaultNames[i]})`;
        input.id = `team-input-${i}`;
        container.appendChild(input);
    }
}

function startGame(isResumed = false) {
    if (!isResumed) {
        // Initialize new game
        gameState.teams = [];
        for (let i = 0; i < currentTeamCount; i++) {
            const nameInput = document.getElementById(`team-input-${i}`);
            const name = nameInput.value.trim() || defaultNames[i];
            gameState.teams.push({
                name: name,
                score: 0
            });
        }
        gameState.history = [];
        gameState.gameName = "";
    }

    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    // Small delay to allow display:block to apply before opacity transition
    setTimeout(() => {
        document.getElementById('game-screen').classList.add('active');
    }, 10);

    renderScoreboard();
    saveGame();
}

function renderScoreboard() {
    const board = document.getElementById('scoreboard');
    board.innerHTML = '';

    gameState.teams.forEach((team, index) => {
        const card = document.createElement('div');
        card.className = 'score-card';
        card.innerHTML = `
            <h3>${team.name}</h3>
            <div class="current-score">${team.score}</div>
            <div class="score-controls">
                <button class="score-btn btn-sub" onclick="updateScore(${index}, -1)">-1</button>
                <button class="score-btn btn-add" onclick="updateScore(${index}, 1)">+1</button>
                <button class="score-btn btn-add" onclick="updateScore(${index}, 5)">+5</button>
                <button class="score-btn btn-add" onclick="updateScore(${index}, 10)">+10</button>
                <button class="score-btn btn-bonus" onclick="updateScore(${index}, 25)">✨ Bonus (+25)</button>
            </div>
        `;
        board.appendChild(card);
    });
}

function updateGameName(name) {
    gameState.gameName = name;
    saveGame();
}

function updateScore(teamIndex, points) {
    gameState.teams[teamIndex].score += points;
    renderScoreboard();
    saveGame();
}

function resetScores() {
    if (confirm("Are you sure you want to reset scores to 0?")) {
        gameState.teams.forEach(t => t.score = 0);
        renderScoreboard();
        saveGame();
    }
}

function newGame() {
    if (confirm("End current game and start over?")) {
        gameState = { teams: [], history: [] };
        localStorage.removeItem('christmasGame');
        window.location.reload();
    }
}

function saveGame() {
    localStorage.setItem('christmasGame', JSON.stringify(gameState));
}

/* --- Celebration Logic --- */

function finishGame() {
    // Calculate Winner
    if (gameState.teams.length === 0) return;

    let maxScore = -Infinity;
    gameState.teams.forEach(t => {
        if (t.score > maxScore) maxScore = t.score;
    });

    // Find all teams with max score (handle ties)
    const winners = gameState.teams.filter(t => t.score === maxScore);
    
    // Update Winner Screen
    const winnerNameEl = document.getElementById('winner-name');
    const winnerScoreEl = document.getElementById('winner-score');
    
    if (winners.length === 1) {
        winnerNameEl.innerText = winners[0].name;
    } else {
        winnerNameEl.innerText = winners.map(w => w.name).join(' & ');
    }
    winnerScoreEl.innerText = \\ pts!\;

    // Show Screen
    document.getElementById('winner-screen').classList.remove('hidden');
    
    // Play Audio
    const audio = document.getElementById('celebration-audio');
    audio.currentTime = 0;
    audio.play().catch(e => console.log("Audio play failed (user interaction needed first):", e));

    // Start Confetti
    startConfetti();
}

function closeWinnerScreen() {
    document.getElementById('winner-screen').classList.add('hidden');
    stopConfetti();
    document.getElementById('celebration-audio').pause();
}

/* --- Simple Confetti Engine --- */
let confettiActive = false;
let confettiParticles = [];
const confettiColors = ['#d42426', '#2f5a2e', '#f8b229', '#ffffff', '#ff0000', '#00ff00'];

function startConfetti() {
    if (confettiActive) return;
    confettiActive = true;
    const canvas = document.getElementById('confetti-canvas');
    if(!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    confettiParticles = [];
    for(let i=0; i<150; i++) {
        confettiParticles.push(createParticle());
    }
    
    requestAnimationFrame(renderConfetti);
}

function stopConfetti() {
    confettiActive = false;
}

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
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
        
        p.y += p.speed;
        p.angle += p.spin;
        
        if (p.y > canvas.height) {
            p.y = -20;
            p.x = Math.random() * canvas.width;
        }
    });
    
    requestAnimationFrame(renderConfetti);
}

window.addEventListener('resize', () => {
    const canvas = document.getElementById('confetti-canvas');
    if(canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
});
