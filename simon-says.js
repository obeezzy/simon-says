"use strict";

const Feedback = {
    POSITIVE: "positive",
    NEGATIVE: "negative"
};

const State = {
    ON: "on",
    OFF: "off",
    AUTO: "auto"
};

const Note = {
    C: 261.626,
    E: 329.628,
    G: 391.995,
    C8: 523.251
};

const Tune = {
    C: "/static/audio/c.wav",
    E: "/static/audio/e.wav",
    G: "/static/audio/g.wav",
    C8: "/static/audio/c8.wav"
};

const ScorePenalty = {
    REPEAT: 2,
    DELAY: 1
};

const ALLOWABLE_PLAYER_DELAY = 15;

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host {
        font-family: Verdana, Arial, san-serif;
        display: block;
    }

    p {
        margin: 0;
    }

    .blocks {
        box-sizing: border-box;
        margin: 0 auto;
        display: grid;
        grid-template-columns: 1fr 1fr;
        width: 100%;
        max-width: 300px;
        aspect-ratio: 1;
        gap: 8px;
        padding-inline: 12px;
    }

    .hud {
        width: 100%;
    }

    .scoreboard {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
    }

    .status {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
    }

    .status p {
        font-size: 1.25rem;
        font-weight: bold;
    }

    .block {
        cursor: pointer;
        -webkit-tap-highlight-color: rgba(0,0,0,0);
        -webkit-tap-highlight-color: transparent;
    }

    .block.tl {
        background-color: blue;
        border-top-left-radius: 24px;
        border-top-right-radius: 24px;
        border-bottom-left-radius: 24px;
    }

    .block.tl.glow {
        background-color: #00a7ff;
    }

    .block.tr {
        background-color: green;
        border-top-left-radius: 24px;
        border-top-right-radius: 24px;
        border-bottom-right-radius: 24px;
    }

    .block.tr.glow {
        background-color: #5aff00;
    }

    .block.bl {
        background-color: rebeccapurple;
        border-top-left-radius: 24px;
        border-bottom-left-radius: 24px;
        border-bottom-right-radius: 24px;
    }

    .block.bl.glow {
        background-color: #c200ff;
    }

    .block.br {
        background-color: orange;
        border-top-right-radius: 24px;
        border-bottom-left-radius: 24px;
        border-bottom-right-radius: 24px;
    }

    .block.br.glow {
        background-color: #fff776;
    }

    .controls {
        display: flex;
        justify-content: center;
        gap: 16px;
    }

    .blocks + .controls {
        margin-block-start: 16px;
    }

    button {
        background-color: #ddd;
        border: none;
        border-radius: 4px;
        color: #333;
        padding: 8px 16px;
        text-align: center;
        text-decoration: none;
        display: inline-block;
        font-size: 16px;
        margin: 4px 2px;
        cursor: pointer;
        box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.3);
        min-width: 5.25rem;
    }

    button[disabled] {
        color: #aaa;
        box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.1);
    }

    .hud > .scoreboard + .leaderboard {
        margin-block-start: 4px;
    }

    @media (prefers-color-scheme: dark) {
        .button-dark {
            background-color: #333;
            color: #fff;
            box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.5);
        }
    }
</style>
<div class="hud">
    <div class="scoreboard">
        <p>Score: <span id="score">0</span></p>
        <p>Level: <span id="level">0</span></p>
        <p>Time: <span id="time">00:00</span></p>
    </div>
    <div class="leaderboard">
        <p>Top score: <span id="top-score">0</span></p>
    </div>
    <div class="status">
        <p id="status">Press <em>Start</em> to play</p>
    </div>
</div>
<div class="blocks">
    <div class="block tl" data-position="tl"></div>
    <div class="block tr" data-position="tr"></div>
    <div class="block bl" data-position="bl"></div>
    <div class="block br" data-position="br"></div>
</div>
<div class="controls">
    <button id="start-button">Start</button>
    <button id="repeat-button" disabled>Repeat</button>
</div>
`;

class SimonSays extends HTMLElement {
    constructor() {
        super();
        this.score = 0;
        this.level = 0;
        this.cpuPlaying = true;
        this.cpuSequence = [];
        this.playerSequence = [];
        this.running = false;
        this.topScore = this.loadScore();
        this.newTopScoreReached = false;
        this.topScoreShown = false;
        this.moveTimestamp = 0;

        const shadowRoot = this.attachShadow({ mode: 'open' });
        const content = template.content.cloneNode(true);
        this.shadowRoot.appendChild(content);
        this.timer = new Timer(this.shadowRoot);
        this.shadowRoot.addEventListener("tick", e => {
            if (e.detail.elapsedTime >= this.moveTimestamp + ALLOWABLE_PLAYER_DELAY) {
                this.moveTimestamp = e.detail.elapsedTime;
                this.score -= ScorePenalty.DELAY;
                this.score = this.score > 0 ? this.score : 0;
                const scoreValue = this.shadowRoot.querySelector("#score");
                scoreValue.textContent = `${this.score}`;
            }
        });
    }

    connectedCallback() {
        const blocks = this.shadowRoot.querySelectorAll(".block");
        const startButton = this.shadowRoot.querySelector("#start-button");
        const repeatButton = this.shadowRoot.querySelector("#repeat-button");
        const statusValue = this.shadowRoot.querySelector("#status");

        blocks.forEach(block => {
            block.onpointerdown = e => this.flash(block, !this.cpuPlaying ? State.ON : State.OFF);
            block.onpointerup = e => this.playMove(e);

            block.ontouchmove = e => {
                if (!this.cpuPlaying)
                    this.turnOffAllBlocks();
            }
            block.onmousemove = e => {
                if (!this.cpuPlaying)
                    this.turnOffAllBlocks();
            }
        });

        startButton.onclick = e => this.start();
        repeatButton.onclick = e => this.repeatCpuSequence();

        const topScoreValue = this.shadowRoot.querySelector("#top-score");
        topScoreValue.textContent = `${this.topScore}`;
    }

    flash(block, state=State.AUTO) {
        if (state === State.AUTO) {
            if (!block.classList.contains("glow")) {
                //this.playTone(block);
                block.classList.add("glow");
                setTimeout(() => block.classList.remove("glow"), 200);
            }
        } else {
            if (state === State.ON) {
                //this.playTone(block);
                block.classList.add("glow");
            } else {
                block.classList.remove("glow");
            }
        }
    }

    turnOffAllBlocks() {
        const blocks = this.shadowRoot.querySelectorAll(".block");
        blocks.forEach(block => this.flash(block, State.OFF));
    }


    start() {
        this.playerSequence = [];
        this.cpuSequence = [];
        this.running = true;
        this.resetScoreBoard();
        this.timer.reset();

        this.timer.start();
        this.playCpuMoves();

        const startButton = this.shadowRoot.querySelector("#start-button");
        startButton.textContent = "Restart";

        this.level = 1;
        const levelValue = this.shadowRoot.querySelector("#level");
        levelValue.textContent = `${this.level}`;
    }

    finish() {
        this.running = false;
        this.cpuPlaying = true;
        this.playerSequence = [];
        this.cpuSequence = [];
        this.timer.stop();
        this.moveTimestamp = 0;

        this.updateStatus(Feedback.NEGATIVE);

        const startButton = this.shadowRoot.querySelector("#start-button");
        startButton.textContent = "Start";

        const repeatButton = this.shadowRoot.querySelector("#repeat-button");
        repeatButton.disabled = true;

        if (navigator.vibrate)
            navigator.vibrate(20);
    }

    playCpuMoves() {
        this.cpuSequence.push(SimonSays.nextCpuMove());
        this.runCpuSequence();
    }

    playTone(block) {
        switch (block.dataset.position) {
            case "tl":
                Piano.play(Tune.C);
                break;
            case "tr":
                Piano.play(Tune.E);
                break;
            case "bl":
                Piano.play(Tune.G);
                break;
            case "br":
                Piano.play(Tune.C8);
                break;
        }
    }

    repeatCpuSequence() {
        if (this.score > 0) {
            this.score -= ScorePenalty.REPEAT;
            this.score = this.score > 0 ? this.score : 0;
            const scoreValue = this.shadowRoot.querySelector("#score");
            scoreValue.textContent = `${this.score}`;
        }

        this.playerSequence = [];
        this.runCpuSequence();
    }

    runCpuSequence() {
        const blocks = this.shadowRoot.querySelectorAll(".block");
        const repeatButton = this.shadowRoot.querySelector("#repeat-button");
        const statusValue = this.shadowRoot.querySelector("#status");

        let delay = 0;
        this.cpuPlaying = true;
        repeatButton.disabled = true;

        statusValue.textContent = "Simon's turn 🤖";
        for (const blockPosition of this.cpuSequence) {
            for (const block of blocks) {
                if (blockPosition === block.dataset.position) {
                    setTimeout(() => this.flash(block), delay);
                    delay += 500;
                }
            }
        }

        setTimeout(() => {
            this.cpuPlaying = false;
            repeatButton.disabled = false;
            statusValue.textContent = "Your turn ✅";
        }, delay);
    }

    updateScoreBoard() {
        this.level++;
        this.score += 5;
        const levelValue = this.shadowRoot.querySelector("#level");
        const scoreValue = this.shadowRoot.querySelector("#score");

        levelValue.textContent = this.level;
        scoreValue.textContent = this.score;

        if (this.score > this.topScore) {
            this.saveScore();
            this.newTopScoreReached = true;
        }
    }

    resetScoreBoard() {
        this.level = 0;
        this.score = 0;
        this.topScore = this.loadScore();
        this.moveTimestamp = 0;

        const levelValue = this.shadowRoot.querySelector("#level");
        levelValue.textContent = `${this.level}`;

        const scoreValue = this.shadowRoot.querySelector("#score");
        scoreValue.textContent = `${this.score}`;

        const topScoreValue = this.shadowRoot.querySelector("#top-score");
        topScoreValue.textContent = `${this.topScore}`;
    }

    updateStatus(feedback) {
        const statusValue = this.shadowRoot.querySelector("#status");
        const statements = {
            [Feedback.POSITIVE]: [
                "Good job!👍🏾",
                "Keep it up!🙌🏾",
                "Nice!🥂",
                "Nailed it!🥳",
                "Great!🎉"
            ],
            [Feedback.NEGATIVE]: [
                "Game over!😑",
                "You lose!🤕"
            ]
        };

        if (!this.topScoreShown && this.newTopScoreReached) {
            statusValue.textContent = "New high score!⭐🤩⭐";
            this.newTopScoreReached = false;
            this.topScoreShown = true;
        } else {
            statusValue.textContent = statements[feedback][Math.floor(Math.random() * statements[feedback].length)];
        }
    }

    saveScore() {
        localStorage.setItem("top-score", this.score);
    }

    loadScore() {
        return localStorage.getItem("top-score") || 0;
    }

    playMove(event) {
        this.moveTimestamp = this.timer.elapsedTime;

        if (!this.cpuPlaying) {
            this.turnOffAllBlocks();
            this.playerSequence.push(event.target.dataset.position);

            for (let i = 0; i < this.playerSequence.length; ++i) {
                if (this.playerSequence[i] !== this.cpuSequence[i]) {
                    this.finish();
                    return;
                }
            }
            if (this.playerSequence.length === this.cpuSequence.length) {
                this.updateScoreBoard();
                this.updateStatus(Feedback.POSITIVE);
                this.cpuPlaying = true;
                this.playerSequence = [];
                setTimeout(() => this.playCpuMoves(), 900);
            }
        } else if (!this.running) {
            const statusValue = this.shadowRoot.querySelector("#status");
            statusValue.innerHTML = "Press <em>Start</em> to play";
        }
    }

    static nextCpuMove() {
        const positions = ["tl", "tr", "bl", "br"];
        return positions[Math.floor(Math.random() * positions.length)];
    }
}

class Timer {
    constructor(shadowRoot) {
        this.elapsedTime = 0;
        this.minutes = 0;
        this.seconds = 0;
        this.intervalId = -1;
        this.shadowRoot = shadowRoot;
    }

    start() {
        this.intervalId = setInterval(() => this.tick(this), 1000);
    }

    stop() {
        if (this.intervalId === -1)
            return;

        clearInterval(this.intervalId);
        this.intervalId = -1;
    }

    reset() {
        this.stop();
        this.elapsedTime = 0;
        this.minutes = "00";
        this.seconds = "00";

        const timeValue = this.shadowRoot.querySelector("#time");
        timeValue.textContent = `${this.minutes}:${this.seconds}`;
    }

    tick(timer) {
        const timeValue = this.shadowRoot.querySelector("#time");
        timer.minutes = parseInt(timer.elapsedTime / 60, 10);
        timer.seconds = parseInt(timer.elapsedTime % 60, 10);

        timer.minutes = timer.minutes < 10 ? "0" + timer.minutes : timer.minutes;
        timer.seconds = timer.seconds < 10 ? "0" + timer.seconds : timer.seconds;

        timeValue.textContent = `${timer.minutes}:${timer.seconds}`;
        timer.elapsedTime++;
        this.shadowRoot.dispatchEvent(new CustomEvent("tick",
            { bubbles: true, detail: { elapsedTime: timer.elapsedTime }}));
    }
}

class Piano {
    static play(tune) {
        const audio = new Audio(tune);
        audio.play();
    }

    static synthesize(note) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();

        const oscillator = audioCtx.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = note;

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.1;

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        setTimeout(() => oscillator.stop(), 250);
    }
}

customElements.define("simon-says", SimonSays);
