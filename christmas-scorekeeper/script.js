let gameState = {
    teams: [],
    history: []
};

// Default team names
const defaultNames = ["Santa's Helpers", "Rudolph's Racers", "Frosty's Friends", "Elf Squad", "Jingle Bells"];

let currentTeamCount = 3;

document.addEventListener('DOMContentLoaded', () => {
    renderTeamInputs();
    
    // Check for saved game
    const saved = localStorage.getItem('christmasGame');
    if (saved) {
        if(confirm("Resume previous game?")) {
            gameState = JSON.parse(saved);
            startGame(true);
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

function updateScore(teamIndex, points) {
    gameState.teams[teamIndex].score += points;
    renderScoreboard();
    saveGame();
}

function resetScores() {
    if(confirm("Are you sure you want to reset scores to 0?")) {
        gameState.teams.forEach(t => t.score = 0);
        renderScoreboard();
        saveGame();
    }
}

function newGame() {
    if(confirm("End current game and start over?")) {
        gameState = { teams: [], history: [] };
        localStorage.removeItem('christmasGame');
        window.location.reload();
    }
}

function saveGame() {
    localStorage.setItem('christmasGame', JSON.stringify(gameState));
}
