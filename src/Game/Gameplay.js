import { GameInstance } from "./GameInstance";
import { GameState } from "./GameState";

import hitnormal_sound from './Assets/hitnormal.wav'
import combobreak_sound from './Assets/combobreak.wav'
import { SongSelection } from "./SongSelection";
import { Scores } from "./Scores";

class GameplayNote {
    constructor(pos, time) {
        this.pos = pos;
        this.time = time;

        this.hittable = true;
        this.hitwindows = [75, 200, 300];
        this.hitwindow_scores = [1000, 500, 50]
        this.state = 'normal';
        this.score = 0;

        this.timeout = window.setTimeout(() => { this.missWindow(this) }, this.time + GameInstance.getInstance().currentSong["offset"] + this.hitwindows[2])
    }

    onKeyDown(key) {
        var elapsed_time = GameInstance.getInstance().getGameplayState().getElapsedTime();
        if (this.hittable && key === GameInstance.getInstance().gameSettings[this.pos]) {
            var note_time = this.time + GameInstance.getInstance().currentSong["offset"];
            if (note_time - this.hitwindows[2] <= elapsed_time &&
                elapsed_time <= note_time + this.hitwindows[2]) {
                this.hittable = false;
                this.state = 'hit';
                var time_delta = Math.abs(note_time - elapsed_time);
                for (let i = this.hitwindow_scores.length - 1; i >= 0; i--) {
                    this.score = time_delta <= this.hitwindows[i] ? this.hitwindow_scores[i] : this.score;
                }
                GameInstance.getInstance().getGameplayState().addCombo();
                GameInstance.getInstance().getGameplayState().setDisplayText(this.score);
                return this;
            }
        }
        return null;
    }

    missWindow(self) {
        if (this.hittable && GameInstance.getInstance().getGameplayState() && GameInstance.getInstance().getGameplayState().map_objects.includes(this)) {
            this.hittable = false;
            this.state = 'missed';
            if (GameInstance.getInstance().getGameplayState().currentCombo >= 4) {
                GameInstance.getInstance().playAudio(combobreak_sound);
            }

            GameInstance.getInstance().getGameplayState().breakCombo();
            GameInstance.getInstance().getGameplayState().setDisplayText("miss");
        }
    }

    destroy() {
        clearTimeout(this.timeout);
    }
}

class HitScoreText {
    constructor(text) {
        this.text = text;
        this.birth_time = new Date();
    }

    getElapsedTime() {
        return new Date() - this.birth_time;
    }
}

export class Gameplay extends GameState {
    constructor(chart_no = 0) {
        super();

        this.chart_no = chart_no;
        this.start_time = new Date();
        this.audio = GameInstance.getInstance().playAudio(GameInstance.getInstance().currentSong["audio_ref"]);

        this.map_objects = [];
        GameInstance.getInstance().currentSong["charts"][chart_no].forEach(element => {
            this.map_objects.push(new GameplayNote(element[0], element[1]));
        });

        this.map_length = this.calcMapLength();

        this.held_keys = [];
        this.game_keys = [
            GameInstance.getInstance().gameSettings[1],
            GameInstance.getInstance().gameSettings[2],
            GameInstance.getInstance().gameSettings[3],
            GameInstance.getInstance().gameSettings[4]
        ]
        this.display_text = [];

        this.currentCombo = 0;
        this.maxCombo = 0;

        this.keydown_handler = (event) => { this.onKeyDown(event) };
        this.keyup_handler = (event) => { this.onKeyUp(event) };

        window.addEventListener("keydown", this.keydown_handler);
        window.addEventListener("keyup", this.keyup_handler);

        this.finish_timeout = window.setTimeout(() => { this.onMapComplete(); }, this.map_length + 2000);
    }

    onBeginPlay() {
        this.audio.volume = GameInstance.getInstance().gameSettings.audio_scale;
        this.audio.play().then(this.audioDelayLoadFix());
    }

    audioDelayLoadFix(){
        this.audio.currentTime = this.getElapsedTime() / 1000;
        console.log("Audio loaded with a delay of",this.getElapsedTime(),"ms")
    }

    onUpdate() {
    }

    onMapComplete() {
        Scores.saveScore(
            GameInstance.getInstance().currentSong,
            this.chart_no, this.calculateAccuracy(),
            this.calculateCurrentScoreMillion(),
            this.getPerfectCount(),
            this.getGoodCount(),
            this.getOkCount(),
            this.getMissCount(),
            this.maxCombo,
            GameInstance.getInstance().currentSong["charts"][this.chart_no].length
        );

        GameInstance.getInstance().setGameState(new SongSelection(true));
    }

    destroy() {
        console.log("destroying gameplay state");
        this.map_objects.forEach(element => {
            element.destroy();
            this.map_objects.pop();
        });
        this.audio.pause();

        window.removeEventListener("keydown", this.keydown_handler);
        window.removeEventListener("keyup", this.keyup_handler);

        clearTimeout(this.finish_timeout);


    }

    getElapsedTime() {
        return (new Date()) - this.start_time;
    }

    onKeyDown(event) {
        var key = event.key.toUpperCase();
        if (!this.isKeyDown(key) && this.game_keys.includes(key)) {
            this.held_keys.push(key);
            GameInstance.getInstance().playAudio(hitnormal_sound);
            for (let i = 0; i < this.map_objects.length; i++) {
                if (this.map_objects[i].onKeyDown(key)) {
                    return;
                }
            }
        }

        if (key === GameInstance.getInstance().gameSettings.exit_key) {
            GameInstance.getInstance().setGameState(new SongSelection());
        }
    }

    onKeyUp(event) {
        this.held_keys = this.held_keys.filter(key => key !== event.key.toUpperCase())
    }

    isKeyDown(key) {
        for (let i = 0; i < this.held_keys.length; i++) {
            if (this.held_keys[i] === key) {
                return true;
            }
        }
        return false;
    }

    calcMapLength() {
        var length = 0;
        this.map_objects.forEach(element => {
            if (length < element.time) {
                length = element.time;
            }
        });

        return length + GameInstance.getInstance().currentSong["offset"];
    }

    setDisplayText(text) {
        this.display_text.push(new HitScoreText(text));
    }

    calculateActualCurrentScore() {
        var out_score = 0;
        this.map_objects.forEach(element => {
            if (!element.hittable) {
                out_score += element.score;
            }
        });
        return out_score;
    }

    calculateMaxCurrentScore() {
        var out_score = 0;
        this.map_objects.forEach(element => {
            if (!element.hittable) {
                out_score += element.hitwindow_scores[0];
            }
        });
        return out_score;
    }

    calculateTotalMapMaxScore() {
        var out_score = 0;
        this.map_objects.forEach(element => {
            out_score += element.hitwindow_scores[0];
        });
        return out_score;
    }

    calculateAccuracy() {
        if (this.calculateMaxCurrentScore() === 0) {
            return 0.0
        }
        return Math.floor((this.calculateActualCurrentScore() / this.calculateMaxCurrentScore()) * 10000) / 100.0;
    }

    calculateCurrentScoreMillion() {
        return Math.floor(0.8 * (Math.floor((this.calculateActualCurrentScore() / this.calculateTotalMapMaxScore()) * 1000000))
        + 0.2 * (Math.floor((this.maxCombo/GameInstance.getInstance().currentSong["charts"][this.chart_no].length) * 1000000)));
    }

    calculateRanking() {
        var acc = this.calculateAccuracy();
        if (acc >= 100) {
            return 'SS'
        }
        else if (acc >= 95) {
            return 'S'
        }
        else if (acc >= 90) {
            return 'A'
        }
        else if (acc >= 85) {
            return 'B'
        }
        else if (acc >= 75) {
            return 'C'
        }
        else {
            return 'D'
        }
    }

    getMissCount() {
        var count = 0;
        this.map_objects.forEach(element => {
            if (element.state === 'missed') {
                count += 1;
            }
        });

        return count;
    }

    getPerfectCount() {
        var count = 0;
        this.map_objects.forEach(element => {
            if (element.score === element.hitwindow_scores[0]) {
                count += 1;
            }
        });

        return count;
    }

    getGoodCount() {
        var count = 0;
        this.map_objects.forEach(element => {
            if (element.score === element.hitwindow_scores[1]) {
                count += 1;
            }
        });

        return count;
    }

    getOkCount() {
        var count = 0;
        this.map_objects.forEach(element => {
            if (element.score === element.hitwindow_scores[2]) {
                count += 1;
            }
        });

        return count;
    }

    addCombo() {
        this.currentCombo += 1;
        if (this.currentCombo > this.maxCombo) {
            this.maxCombo = this.currentCombo;
        }
    }

    breakCombo() {
        this.currentCombo = 0;
    }

    getObjectsToDraw(){
        var out = [];
        this.map_objects.forEach(elem => {
            var time = (elem.time + GameInstance.getInstance().currentSong["offset"]) - this.getElapsedTime();
            if(elem.hittable && time<5000){
                out.push(elem)
            }
        })

        return out;
    }
}