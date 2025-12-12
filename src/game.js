let gameState = {
    players: [],
    gameType: 'casual',
    difficulty: 1,
    cardCount: 20,
    currentCards: [],
    currentCardIndex: 0,
    scores: {},
    timerInterval: null
};

let cardsData = null;
let touchStartX = 0;
let touchStartY = 0;
let currentTranslateX = 0;
let isDragging = false;

function categorizeAction(text) {
    const lowerText = text.toLowerCase();

    if (lowerText.match(/pendant\s+\d+\s*(seconde|minute|s|m)/i)) {
        return 'time-based';
    }

    if (lowerText.match(/(vs|versus|contre|duel|battle|challenge|race|qui|compare|plus|meilleur)/i)) {
        return 'duel-1v1';
    }

    if (lowerText.match(/(chaque joueur|tous les|group|team|équipe|ensemble|tout le monde)/i)) {
        return 'group-duel';
    }

    return 'single';
}

function getTimerDuration(text) {
    const match = text.match(/pendant\s+(\d+)\s*(seconde|minute|s|m)/i);
    if (match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase()[0];
        return unit === 'm' ? value * 60 : value;
    }
    return 30;
}

function getRandomPlayers(count, exclude = []) {
    const available = gameState.players.filter(p => !exclude.includes(p));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function createTeams() {
    const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);
    const mid = Math.ceil(shuffled.length / 2);
    return {
        team1: shuffled.slice(0, mid),
        team2: shuffled.slice(mid)
    };
}

async function loadCardsData() {
    try {
        const response = await fetch('/src/data/cartes_piccolo_reelles.json');
        cardsData = await response.json();
    } catch (error) {
        console.error('Error loading cards:', error);
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function addPlayer() {
    const input = document.getElementById('player-name');
    const name = input.value.trim();

    if (name && !gameState.players.includes(name)) {
        gameState.players.push(name);
        gameState.scores[name] = 0;
        updatePlayersList();
        input.value = '';
    }
}

function removePlayer(name) {
    gameState.players = gameState.players.filter(p => p !== name);
    delete gameState.scores[name];
    updatePlayersList();
}

function updatePlayersList() {
    const list = document.getElementById('players-list');
    list.innerHTML = gameState.players.map(name => `
        <div class="player-tag">
            <span>${name}</span>
            <span class="remove" onclick="removePlayer('${name}')">×</span>
        </div>
    `).join('');
}

function selectGameType(type) {
    gameState.gameType = type;
    document.querySelectorAll('.game-type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.game-type-btn').classList.add('active');
}

function selectDifficulty(difficulty) {
    gameState.difficulty = difficulty;
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

function getDifficultyKey() {
    if (gameState.gameType === 'casual') {
        return ['facile', 'moyen', 'difficile'][gameState.difficulty - 1];
    } else {
        return `caliente${gameState.difficulty}`;
    }
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function selectCardsWithBalance(allCards, targetCount) {
    const categorized = {
        'single': [],
        'time-based': [],
        'duel-1v1': [],
        'group-duel': []
    };

    allCards.forEach(card => {
        const category = categorizeAction(card.text);
        categorized[category].push(card);
    });

    const result = [];
    const minPercent = 0.10;
    const minCounts = {
        'time-based': Math.max(1, Math.ceil(targetCount * minPercent)),
        'duel-1v1': Math.max(1, Math.ceil(targetCount * minPercent)),
        'group-duel': Math.max(1, Math.ceil(targetCount * minPercent))
    };

    const reserves = {
        'time-based': [...categorized['time-based']],
        'duel-1v1': [...categorized['duel-1v1']],
        'group-duel': [...categorized['group-duel']],
        'single': [...categorized['single']]
    };

    for (const [category, minCount] of Object.entries(minCounts)) {
        const available = Math.min(minCount, reserves[category].length);
        for (let i = 0; i < available; i++) {
            const idx = Math.floor(Math.random() * reserves[category].length);
            result.push(reserves[category].splice(idx, 1)[0]);
        }
    }

    const remaining = targetCount - result.length;
    const allRemaining = Object.values(reserves).flat();
    const shuffled = shuffleArray(allRemaining);
    result.push(...shuffled.slice(0, remaining));

    return shuffleArray(result);
}

function startGame() {
    if (gameState.players.length === 0) {
        alert('Ajoutez au moins un joueur !');
        return;
    }

    if (gameState.players.length < 2 && gameState.players.length !== 1) {
        alert('Ajoutez au moins 2 joueurs pour les duels !');
        return;
    }

    const cardCount = parseInt(document.getElementById('card-count').value);
    gameState.cardCount = cardCount;

    const difficultyKey = getDifficultyKey();
    const allCards = cardsData.difficulties[difficultyKey].action;

    gameState.currentCards = selectCardsWithBalance(allCards, Math.min(cardCount, allCards.length));
    gameState.currentCardIndex = 0;

    gameState.players.forEach(player => {
        gameState.scores[player] = 0;
    });

    showScreen('game-screen');
    displayCard();
}

function displayCard() {
    if (gameState.currentCardIndex >= gameState.currentCards.length) {
        endGame();
        return;
    }

    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
    }

    const card = gameState.currentCards[gameState.currentCardIndex];
    const category = categorizeAction(card.text);

    let displayText = card.text;
    let targetDisplay = '';

    if (category === 'single') {
        const player = getRandomPlayers(1)[0];
        targetDisplay = `<div class="target-info">👤 ${player}</div>`;
        displayText = card.text;
    } else if (category === 'time-based') {
        const duration = getTimerDuration(card.text);
        targetDisplay = `<div class="timer-info">⏱️ ${duration}s</div>`;
        setupTimer(duration);
    } else if (category === 'duel-1v1') {
        const [p1, p2] = getRandomPlayers(2);
        targetDisplay = `<div class="duel-info">🥊 ${p1} vs ${p2}</div>`;
    } else if (category === 'group-duel') {
        const teams = createTeams();
        const team1Str = teams.team1.join(', ');
        const team2Str = teams.team2.join(', ');
        targetDisplay = `<div class="team-info">
            <div class="team">🔴 ${team1Str}</div>
            <div class="vs">vs</div>
            <div class="team">🔵 ${team2Str}</div>
        </div>`;
    }

    const cardElement = document.getElementById('card');
    cardElement.innerHTML = `
        <div class="card-content">
            ${targetDisplay}
            <p class="card-text">${displayText}</p>
            <div class="card-penalty">
                <span class="penalty-value">${card.penalty_sips}</span>
                <span class="penalty-label">gorgées si refus</span>
            </div>
        </div>
    `;

    document.getElementById('card-counter').textContent =
        `${gameState.currentCardIndex + 1} / ${gameState.currentCards.length}`;

    cardElement.style.transform = 'translateX(0) rotate(0)';
    cardElement.style.opacity = '1';
    cardElement.classList.remove('swipe-left', 'swipe-right');
}

function setupTimer(duration) {
    let remaining = duration;
    const timerElement = document.querySelector('.timer-info');

    if (timerElement) {
        timerElement.textContent = `⏱️ ${remaining}s`;

        gameState.timerInterval = setInterval(() => {
            remaining--;
            if (remaining >= 0 && timerElement) {
                timerElement.textContent = `⏱️ ${remaining}s`;
            }
            if (remaining < 0) {
                clearInterval(gameState.timerInterval);
            }
        }, 1000);
    }
}

function handleSwipe(direction) {
    const card = gameState.currentCards[gameState.currentCardIndex];
    const cardElement = document.getElementById('card');

    if (direction === 'left') {
        cardElement.classList.add('swipe-left');
        const randomPlayer = gameState.players[Math.floor(Math.random() * gameState.players.length)];
        gameState.scores[randomPlayer] += card.penalty_sips;
    } else {
        cardElement.classList.add('swipe-right');
    }

    setTimeout(() => {
        gameState.currentCardIndex++;
        displayCard();
    }, 300);
}

function setupCardSwipe() {
    const card = document.getElementById('card');

    card.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDragging = true;
        card.classList.add('dragging');
    });

    card.addEventListener('touchmove', (e) => {
        if (!isDragging) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const deltaX = touchX - touchStartX;
        const deltaY = touchY - touchStartY;

        if (Math.abs(deltaY) > Math.abs(deltaX)) return;

        e.preventDefault();
        currentTranslateX = deltaX;
        const rotation = deltaX / 20;
        card.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;
        card.style.opacity = 1 - Math.abs(deltaX) / 300;
    });

    card.addEventListener('touchend', () => {
        if (!isDragging) return;

        card.classList.remove('dragging');
        isDragging = false;

        if (Math.abs(currentTranslateX) > 100) {
            handleSwipe(currentTranslateX > 0 ? 'right' : 'left');
        } else {
            card.style.transform = 'translateX(0) rotate(0)';
            card.style.opacity = '1';
        }

        currentTranslateX = 0;
    });

    card.addEventListener('mousedown', (e) => {
        touchStartX = e.clientX;
        isDragging = true;
        card.classList.add('dragging');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - touchStartX;
        currentTranslateX = deltaX;
        const rotation = deltaX / 20;
        card.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;
        card.style.opacity = 1 - Math.abs(deltaX) / 300;
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;

        card.classList.remove('dragging');
        isDragging = false;

        if (Math.abs(currentTranslateX) > 100) {
            handleSwipe(currentTranslateX > 0 ? 'right' : 'left');
        } else {
            card.style.transform = 'translateX(0) rotate(0)';
            card.style.opacity = '1';
        }

        currentTranslateX = 0;
    });
}

function showScores() {
    const scoresList = document.getElementById('scores-list');
    const sortedPlayers = [...gameState.players].sort((a, b) =>
        gameState.scores[b] - gameState.scores[a]
    );

    scoresList.innerHTML = sortedPlayers.map(player => `
        <div class="score-item">
            <span class="score-name">${player}</span>
            <span class="score-value">${gameState.scores[player]} 🍺</span>
        </div>
    `).join('');

    showScreen('scores-screen');
}

function endGame() {
    const scoresList = document.getElementById('final-scores');
    const sortedPlayers = [...gameState.players].sort((a, b) =>
        gameState.scores[b] - gameState.scores[a]
    );

    scoresList.innerHTML = `
        <div class="scores-list">
            ${sortedPlayers.map((player, index) => `
                <div class="score-item">
                    <span class="score-name">${index === 0 ? '🏆 ' : ''}${player}</span>
                    <span class="score-value">${gameState.scores[player]} 🍺</span>
                </div>
            `).join('')}
        </div>
    `;

    showScreen('end-screen');
}

function resetGame() {
    gameState = {
        players: [],
        gameType: 'casual',
        difficulty: 1,
        cardCount: 20,
        currentCards: [],
        currentCardIndex: 0,
        scores: {}
    };
    updatePlayersList();
    showScreen('setup-screen');
}

window.removePlayer = removePlayer;

document.addEventListener('DOMContentLoaded', async () => {
    await loadCardsData();

    document.getElementById('add-player').addEventListener('click', addPlayer);
    document.getElementById('player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addPlayer();
    });

    document.querySelectorAll('.game-type-btn').forEach(btn => {
        btn.addEventListener('click', () => selectGameType(btn.dataset.type));
    });

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => selectDifficulty(parseInt(btn.dataset.difficulty)));
    });

    document.getElementById('start-game').addEventListener('click', startGame);
    document.getElementById('quit-game').addEventListener('click', () => {
        if (confirm('Voulez-vous vraiment quitter la partie ?')) {
            resetGame();
        }
    });
    document.getElementById('show-scores').addEventListener('click', showScores);
    document.getElementById('continue-game').addEventListener('click', () => showScreen('game-screen'));
    document.getElementById('end-game').addEventListener('click', endGame);
    document.getElementById('new-game').addEventListener('click', resetGame);

    setupCardSwipe();
});
