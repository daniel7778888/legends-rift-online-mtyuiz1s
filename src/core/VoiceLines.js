// Separate WAV files beside index.html work both on file:// and when served by Render.
const hero1 = ['./sounds/voice-1.wav', './sounds/voice-2.wav', './sounds/voice-3.wav', './sounds/voice-4.wav'];
const hero2 = ['./sounds/voice-hero2-1.wav', './sounds/voice-hero2-2.wav', './sounds/voice-hero2-3.wav', './sounds/voice-hero2-4.wav', './sounds/voice-hero2-5.wav'];

export class VoiceLines {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.audioBanks = Object.fromEntries(Object.entries({ hero1, hero2 }).map(([hero, sources]) => [hero, sources.map((source) => { const audio = new Audio(source); audio.preload = 'auto'; audio.volume = .9; return audio; })]));
    this.heroId = 'hero1'; this.unlocked = false; this.nextLineAt = 0; this.lastIndex = -1;
  }

  unlock(now) { if (!this.unlocked) { this.unlocked = true; this.nextLineAt = now; } Object.values(this.audioBanks).flat().forEach((audio) => { if (audio.readyState === 0) audio.load(); }); }

  setHero(heroId) { if (!this.audioBanks[heroId] || heroId === this.heroId) return; this.stopAll(); this.heroId = heroId; this.lastIndex = -1; this.nextLineAt = 0; }
  stopAll() { Object.values(this.audioBanks).flat().forEach((audio) => { audio.pause(); audio.currentTime = 0; }); }

  play(now) {
    // Never more often than roughly once every half-minute.
    if (!this.unlocked || now < this.nextLineAt) return;
    const lines = this.audioBanks[this.heroId]; let index = Math.floor(Math.random() * lines.length); if (lines.length > 1 && index === this.lastIndex) index = (index + 1) % lines.length;
    this.playLine(this.heroId, index); this.nextLineAt = now + 27 + Math.random() * 8;
  }

  playLine(heroId, index) {
    const lines = this.audioBanks[heroId]; const audio = lines?.[index]; if (!audio) return;
    Object.values(this.audioBanks).flat().forEach((line) => { if (line !== audio) { line.pause(); line.currentTime = 0; } });
    this.lastIndex = index; audio.currentTime = 0; audio.play().catch((error) => console.info('Audio needs a tap or is unavailable:', error));
    this.callbacks.onPlay?.({ hero: heroId, index });
  }

  playRemote(heroId, index) { if (this.unlocked) this.playLine(heroId, index); }
  update(now) { if (this.unlocked && now >= this.nextLineAt) this.play(now); }
}
