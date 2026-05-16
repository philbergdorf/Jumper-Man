import Phaser from 'phaser';
import './styles.css';

const WIDTH = 960;
const HEIGHT = 540;
const WORLD_WIDTH = 7800;
const STREET_LEVEL = 600;
const GROUND_Y = 456;
const FLAG_X = 7400;
const FLAG_TOP_Y = GROUND_Y - 260;
const FLAG_BOTTOM_Y = GROUND_Y - 18;
const HIGH_SCORE_KEY = 'jumper-man-high-scores';
const LANGUAGE_KEY = 'jumper-man-language';
const TOTAL_RUNS = 3;
const BASE_JUMP_VELOCITY = -430;
const DOUBLE_JUMP_VELOCITY = -380;
const JUMP_HOLD_ACCELERATION = -1500;
const MAX_JUMP_HOLD_MS = 190;
const JUMP_CUT_VELOCITY = -230;
const MAX_JUMPS = 2;
const BASE_RUN_ACCELERATION = 1780;
const BASE_RUN_SPEED = 330;
const MAX_RUN_SPEED = 690;
const MOMENTUM_BUILD_PER_SECOND = 0.075;
const FLOW_CLEAR_DISTANCE = 26;
const FLOW_AIR_BONUS_MIN_Y = GROUND_Y - 18;
const RETRO_FONT = '"Courier New", "Lucida Console", Monaco, monospace';
const RETRO_SHADOW = {
  offsetX: 2,
  offsetY: 2,
  color: '#050914',
  blur: 0,
  stroke: true,
  fill: true
};

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys;
type HighScoreEntry = {
  score: number;
  coins: number;
  time: number;
  date: string;
};
type MusicWindow = Window & {
  jumperManMusic?: HTMLAudioElement;
};
type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};
type ObstacleTexture = 'vent' | 'crate' | 'duct' | 'tower';
type Language = 'en' | 'de';
type UpgradeId = 'turboStart' | 'overdrive' | 'streetSweep' | 'shockAbsorbers' | 'flowMultiplier';
type UpgradeState = Record<UpgradeId, number>;
type UpgradeDefinition = {
  id: UpgradeId;
  name: Record<Language, string>;
  short: Record<Language, string>;
  description: Record<Language, string>;
};
type UpgradeKeyMap = Record<'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE', Phaser.Input.Keyboard.Key>;
type RunSceneData = {
  runNumber: number;
  setScore: number;
  setCoins: number;
  setTime: number;
  upgrades: UpgradeState;
};

const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  {
    id: 'turboStart',
    name: { en: 'TURBO START', de: 'TURBOSTART' },
    short: { en: 'START FAST', de: 'SCHNELLER START' },
    description: { en: 'Start with speed.', de: 'Starte mit Tempo.' }
  },
  {
    id: 'overdrive',
    name: { en: 'OVERDRIVE', de: 'OVERDRIVE' },
    short: { en: 'BUILD FAST', de: 'TEMPO AUFBAUEN' },
    description: { en: 'Gain speed faster.', de: 'Baue Tempo schneller auf.' }
  },
  {
    id: 'streetSweep',
    name: { en: 'STREET SWEEP', de: 'STRASSENRÄUMER' },
    short: { en: 'LESS CLUTTER', de: 'WENIGER HÜRDEN' },
    description: { en: 'Remove obstacles.', de: 'Entfernt Hindernisse.' }
  },
  {
    id: 'shockAbsorbers',
    name: { en: 'SHOCK ABSORBERS', de: 'STOSSDÄMPFER' },
    short: { en: 'SAVE FLOW', de: 'FLOW SCHÜTZEN' },
    description: { en: 'Ignore one hit.', de: 'Ignoriert einen Treffer.' }
  },
  {
    id: 'flowMultiplier',
    name: { en: 'FLOW MULTIPLIER', de: 'FLOW-MULTIPLIKATOR' },
    short: { en: 'MORE POINTS', de: 'MEHR PUNKTE' },
    description: { en: 'Flow is worth more.', de: 'Flow bringt mehr Punkte.' }
  }
];

const createUpgradeState = (): UpgradeState => ({
  turboStart: 0,
  overdrive: 0,
  streetSweep: 0,
  shockAbsorbers: 0,
  flowMultiplier: 0
});

const UI_COPY = {
  en: {
    run: 'RUN',
    set: 'SET',
    score: 'SCORE',
    coins: 'COINS',
    time: 'TIME',
    speed: 'SPEED',
    flow: 'FLOW',
    ready: 'READY',
    flag: 'FLAG',
    complete: 'COMPLETE',
    chooseUpgrade: 'CHOOSE UPGRADE',
    selectUpgrade: '1-5 SELECT',
    highScores: 'HIGH SCORES',
    newHighScore: 'NEW HIGH SCORE',
    finish: 'FINISH',
    runs: 'RUNS',
    points: 'PTS',
    playAgain: 'SPACE TO RUN AGAIN',
    shockLeft: (charges: number) => `SHOCK ${charges} LEFT`
  },
  de: {
    run: 'LAUF',
    set: 'SERIE',
    score: 'PUNKTE',
    coins: 'MÜNZEN',
    time: 'ZEIT',
    speed: 'TEMPO',
    flow: 'FLOW',
    ready: 'BEREIT',
    flag: 'FLAGGE',
    complete: 'GESCHAFFT',
    chooseUpgrade: 'UPGRADE WÄHLEN',
    selectUpgrade: '1-5 WÄHLEN',
    highScores: 'BESTENLISTE',
    newHighScore: 'NEUER REKORD',
    finish: 'ZIEL',
    runs: 'LÄUFE',
    points: 'PKT',
    playAgain: 'SPACE FÜR NEUE SERIE',
    shockLeft: (charges: number) => `SCHUTZ ${charges} ÜBRIG`
  }
} as const;

class BackgroundMusic {
  private audio?: HTMLAudioElement;
  private readonly tabId = crypto.randomUUID();
  private readonly channel = 'BroadcastChannel' in window ? new BroadcastChannel('jumper-man-music') : undefined;

  constructor() {
    this.channel?.addEventListener('message', event => {
      if (event.data?.type === 'music-started' && event.data?.tabId !== this.tabId) {
        this.pause();
      }
    });
  }

  start() {
    if (!this.audio) {
      const musicWindow = window as MusicWindow;
      this.audio = musicWindow.jumperManMusic ?? new Audio(`${import.meta.env.BASE_URL}song.mp4`);
      musicWindow.jumperManMusic = this.audio;
      this.audio.loop = true;
      this.audio.volume = 0.55;
      this.audio.preload = 'auto';
      this.audio.dataset.jumperManMusic = 'true';
    }

    document.querySelectorAll<HTMLAudioElement>('audio[data-jumper-man-music="true"]').forEach(audio => {
      if (audio !== this.audio) {
        audio.pause();
        audio.remove();
      }
    });

    this.channel?.postMessage({ type: 'music-started', tabId: this.tabId });

    void this.audio.play().catch(() => {
      // Browsers can reject playback until a user gesture; input handlers retry start().
    });
  }

  private pause() {
    this.audio?.pause();
  }
}

const music = new BackgroundMusic();

class SoundEffects {
  private context?: AudioContext;
  private master?: GainNode;
  private lastCoinAt = 0;

  unlock() {
    const context = this.getContext();
    if (!context) {
      return;
    }

    if (context.state === 'suspended') {
      void context.resume();
    }
  }

  playJump(isDoubleJump: boolean) {
    const context = this.getContext();
    if (!context || !this.master) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(isDoubleJump ? 260 : 210, now);
    oscillator.frequency.exponentialRampToValueAtTime(isDoubleJump ? 560 : 460, now + 0.11);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isDoubleJump ? 0.045 : 0.055, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }

  playCoin() {
    const context = this.getContext();
    if (!context || !this.master) {
      return;
    }

    const now = context.currentTime;
    if (now - this.lastCoinAt < 0.035) {
      return;
    }
    this.lastCoinAt = now;

    this.playTone(760, 0.055, 0.048, 'triangle');
    this.playTone(1140, 0.13, 0.034, 'sine', 0.045);
  }

  private playTone(
    frequency: number,
    length: number,
    volume: number,
    type: OscillatorType,
    delay = 0
  ) {
    const context = this.getContext();
    if (!context || !this.master) {
      return;
    }

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);

    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + length + 0.025);
  }

  private getContext() {
    if (this.context) {
      return this.context;
    }

    const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      return undefined;
    }

    this.context = new AudioContextConstructor();
    this.master = this.context.createGain();
    this.master.gain.setValueAtTime(0.42, this.context.currentTime);
    this.master.connect(this.context.destination);
    return this.context;
  }
}

const sounds = new SoundEffects();

class RunnerScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: CursorKeys;
  private wasd!: Record<'A' | 'D' | 'W' | 'SPACE', Phaser.Input.Keyboard.Key>;
  private buildings!: Phaser.Physics.Arcade.StaticGroup;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private coins!: Phaser.Physics.Arcade.Group;
  private goal!: Phaser.Types.Physics.Arcade.ImageWithStaticBody;
  private scoreText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private flowBadge!: Phaser.GameObjects.Rectangle;
  private flowBadgeGlow!: Phaser.GameObjects.Rectangle;
  private flowText!: Phaser.GameObjects.Text;
  private speedBadge!: Phaser.GameObjects.Rectangle;
  private speedBar!: Phaser.GameObjects.Rectangle;
  private speedText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private languageBack!: Phaser.GameObjects.Rectangle;
  private languageActive!: Phaser.GameObjects.Rectangle;
  private languageEnText!: Phaser.GameObjects.Text;
  private languageDeText!: Phaser.GameObjects.Text;
  private highScorePanel?: Phaser.GameObjects.Container;
  private upgradePanel?: Phaser.GameObjects.Container;
  private upgradeKeys!: UpgradeKeyMap;
  private runNumber = 1;
  private setScore = 0;
  private setCoins = 0;
  private setTime = 0;
  private upgrades: UpgradeState = createUpgradeState();
  private language: Language = 'en';
  private shockCharges = 0;
  private lastShockAbsorbAt = -1000;
  private score = 0;
  private coinsCollected = 0;
  private totalCoins = 0;
  private runStartedAt = 0;
  private runStarted = false;
  private finished = false;
  private finishing = false;
  private invulnerable = false;
  private jumpHoldMs = 0;
  private jumpExtending = false;
  private jumpsRemaining = MAX_JUMPS;
  private momentum = 0;
  private flowScore = 0;
  private flowCombo = 0;
  private latestFlowBonus = 0;
  private flowBonusVisibleUntil = 0;

  constructor() {
    super('runner');
  }

  init(data: Partial<RunSceneData> = {}) {
    this.runNumber = Phaser.Math.Clamp(Math.floor(data.runNumber ?? 1), 1, TOTAL_RUNS);
    this.setScore = Math.max(0, Math.floor(data.setScore ?? 0));
    this.setCoins = Math.max(0, Math.floor(data.setCoins ?? 0));
    this.setTime = Math.max(0, data.setTime ?? 0);
    this.upgrades = { ...createUpgradeState(), ...(data.upgrades ?? {}) };
    this.language = this.loadLanguage();
  }

  preload() {
    this.createTextures();
  }

  create() {
    this.score = 0;
    this.coinsCollected = 0;
    this.finished = false;
    this.finishing = false;
    this.invulnerable = false;
    this.runStarted = false;
    this.runStartedAt = 0;
    this.jumpHoldMs = 0;
    this.jumpExtending = false;
    this.jumpsRemaining = MAX_JUMPS;
    this.momentum = 0;
    this.flowScore = 0;
    this.flowCombo = 0;
    this.latestFlowBonus = 0;
    this.flowBonusVisibleUntil = 0;
    this.shockCharges = this.upgrades.shockAbsorbers;
    this.lastShockAbsorbAt = -1000;
    this.highScorePanel?.destroy(true);
    this.highScorePanel = undefined;
    this.upgradePanel?.destroy(true);
    this.upgradePanel = undefined;

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, HEIGHT + 220);
    this.addBackground();

    this.buildings = this.physics.add.staticGroup();
    this.addFlatGround();

    this.obstacles = this.physics.add.staticGroup();
    const routeObstacles: Array<[number, ObstacleTexture]> = [
      [520, 'vent'],
      [1240, 'crate'],
      [2050, 'duct'],
      [2860, 'tower'],
      [3700, 'crate'],
      [4550, 'duct'],
      [5420, 'tower'],
      [6280, 'crate'],
      [6880, 'tower']
    ];
    const sweptObstacleIndexes = new Set([1, 4, 7, 2].slice(0, this.upgrades.streetSweep * 2));
    routeObstacles.forEach(([x, texture], index) => {
      if (!sweptObstacleIndexes.has(index)) {
        this.addObstacle(x, GROUND_Y, texture);
      }
    });
    [1640, 3300, 5000, 6500].forEach(x => this.addGate(x));

    this.createPlayerAnimations();
    this.player = this.physics.add.sprite(90, GROUND_Y - 30, 'robot-idle');
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(1100);
    this.player.setMaxVelocity(BASE_RUN_SPEED, 620);
    this.player.body?.setSize(32, 58).setOffset(8, 6);
    this.player.setDepth(8);
    this.player.play('robot-idle');
    this.applyStartingMomentum();

    this.physics.add.collider(this.player, this.buildings);
    this.physics.add.collider(this.player, this.obstacles, () => this.handleObstacleCollision(), undefined, this);

    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    [
      [310, 410],
      [720, 408],
      [1010, 360],
      [1340, 404],
      [1640, 390],
      [1940, 350],
      [2250, 410],
      [2580, 372],
      [2880, 320],
      [3180, 410],
      [3300, 390],
      [3600, 350],
      [3940, 410],
      [4280, 372],
      [4560, 330],
      [4860, 408],
      [5000, 390],
      [5320, 350],
      [5660, 410],
      [6000, 382],
      [6280, 340],
      [6500, 390],
      [6780, 352],
      [7060, 410],
      [7280, 360]
    ].forEach(([x, y]) => {
      const coin = this.coins.create(x, y, 'coin') as Phaser.Physics.Arcade.Image;
      coin.setCircle(14, 8, 8);
      coin.setDepth(6);
    });
    this.totalCoins = this.coins.getLength();

    this.goal = this.physics.add.staticImage(FLAG_X, GROUND_Y, 'flag');
    this.goal.setOrigin(0.5, 1);
    this.goal.setDepth(7);
    this.goal.body?.setSize(48, 258).setOffset(20, 16);
    this.goal.refreshBody();

    this.physics.add.overlap(this.player, this.coins, (_player, coin) => this.collectCoin(coin as Phaser.GameObjects.GameObject), undefined, this);
    this.physics.add.overlap(this.player, this.goal, () => this.reachGoal(), undefined, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('A,D,W,SPACE') as typeof this.wasd;
    this.upgradeKeys = {
      ONE: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      TWO: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      THREE: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      FOUR: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      FIVE: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE)
    };
    this.input.keyboard!.once('keydown', () => {
      music.start();
      sounds.unlock();
    });
    this.input.once('pointerdown', () => {
      music.start();
      sounds.unlock();
    });

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, -120, 80);

    this.scoreText = this.add.text(22, 18, 'SCORE 0000', {
      fontFamily: RETRO_FONT,
      fontSize: '18px',
      color: '#ffd166',
      stroke: '#07101f',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setScrollFactor(0);

    this.coinsText = this.add.text(22, 50, `COINS 0/${this.totalCoins}`, {
      fontFamily: RETRO_FONT,
      fontSize: '15px',
      color: '#f8f4df',
      stroke: '#07101f',
      strokeThickness: 3,
      shadow: RETRO_SHADOW
    }).setScrollFactor(0);

    this.timeText = this.add.text(22, 76, 'TIME 0.0s', {
      fontFamily: RETRO_FONT,
      fontSize: '15px',
      color: '#9ee7ff',
      stroke: '#07101f',
      strokeThickness: 3,
      shadow: RETRO_SHADOW
    }).setScrollFactor(0);

    this.flowBadgeGlow = this.add.rectangle(WIDTH / 2, 54, 242, 48, 0xff4fd8, 0.12)
      .setScrollFactor(0)
      .setDepth(880);
    this.flowBadgeGlow.setStrokeStyle(2, 0xa7ff3f, 0.26);

    this.flowBadge = this.add.rectangle(WIDTH / 2, 54, 222, 36, 0x0b0714, 0.82)
      .setScrollFactor(0)
      .setDepth(881);
    this.flowBadge.setStrokeStyle(3, 0xff4fd8, 0.92);

    const flowBadgeTop = this.add.rectangle(WIDTH / 2, 38, 174, 3, 0xa7ff3f, 0.95)
      .setScrollFactor(0)
      .setDepth(882);
    const flowBadgeBottom = this.add.rectangle(WIDTH / 2, 70, 174, 3, 0x9a57ff, 0.95)
      .setScrollFactor(0)
      .setDepth(882);

    this.flowText = this.add.text(WIDTH / 2, 54, 'FLOW', {
      fontFamily: RETRO_FONT,
      fontSize: '18px',
      color: '#a7ff3f',
      stroke: '#07101f',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5).setScrollFactor(0).setDepth(883);

    this.speedBadge = this.add.rectangle(WIDTH / 2, 91, 222, 22, 0x0b0714, 0.72)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(880);
    this.speedBadge.setStrokeStyle(2, 0x9a57ff, 0.72);

    this.add.rectangle(WIDTH / 2, 97, 172, 5, 0x1b1230, 1)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(881);
    this.speedBar = this.add.rectangle(WIDTH / 2 - 86, 97, 1, 5, 0xff4fd8, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(882);
    this.speedText = this.add.text(WIDTH / 2, 86, 'SPEED 0%', {
      fontFamily: RETRO_FONT,
      fontSize: '12px',
      color: '#f8f4df',
      stroke: '#050914',
      strokeThickness: 2,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5).setScrollFactor(0).setDepth(883);

    this.messageText = this.add.text(WIDTH / 2, 142, '', {
      fontFamily: RETRO_FONT,
      fontSize: '24px',
      color: '#fff0a6',
      align: 'center',
      stroke: '#07101f',
      strokeThickness: 6,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5).setScrollFactor(0);

    this.languageBack = this.add.rectangle(WIDTH - 64, 28, 86, 28, 0x0b0714, 0.78)
      .setScrollFactor(0)
      .setDepth(884)
      .setInteractive({ useHandCursor: true });
    this.languageBack.setStrokeStyle(2, 0x9a57ff, 0.7);
    this.languageBack.on('pointerdown', () => this.toggleLanguage());

    this.languageActive = this.add.rectangle(WIDTH - 84, 28, 38, 20, 0xa7ff3f, 0.2)
      .setScrollFactor(0)
      .setDepth(885);
    this.languageActive.setStrokeStyle(1, 0xa7ff3f, 0.8);

    this.languageEnText = this.add.text(WIDTH - 84, 28, 'EN', {
      fontFamily: RETRO_FONT,
      fontSize: '14px',
      color: '#e4f0f2',
      stroke: '#07101f',
      strokeThickness: 3,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5).setScrollFactor(0).setDepth(886).setInteractive({ useHandCursor: true });
    this.languageEnText.on('pointerdown', () => this.setLanguage('en'));

    this.languageDeText = this.add.text(WIDTH - 44, 28, 'DE', {
      fontFamily: RETRO_FONT,
      fontSize: '14px',
      color: '#e4f0f2',
      stroke: '#07101f',
      strokeThickness: 3,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5).setScrollFactor(0).setDepth(886).setInteractive({ useHandCursor: true });
    this.languageDeText.on('pointerdown', () => this.setLanguage('de'));
    this.updateLanguageText();

    this.updateScoreHud();
  }

  update(_time: number, delta: number) {
    if (this.finished) {
      if (this.upgradePanel) {
        this.handleUpgradeInput();
        return;
      }

      if (Phaser.Input.Keyboard.JustDown(this.wasd.SPACE)) {
        this.scene.restart();
      }
      return;
    }

    if (this.finishing) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      this.player.setAccelerationX(0);
      this.player.setVelocityX(340);
      this.player.setFlipX(false);
      this.updatePlayerAnimation(false, true, body);
      return;
    }

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.W) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.SPACE);
    const jumpHeld = this.cursors.up.isDown || this.wasd.W.isDown || this.wasd.SPACE.isDown;
    const jumpReleased = Phaser.Input.Keyboard.JustUp(this.cursors.up) ||
      Phaser.Input.Keyboard.JustUp(this.wasd.W) ||
      Phaser.Input.Keyboard.JustUp(this.wasd.SPACE);
    const movementIntent = left || right || jumpPressed;

    if (movementIntent) {
      this.startRunTimer();
    }

    this.updateMomentum(right, left, delta);
    const runAcceleration = BASE_RUN_ACCELERATION * (1 + this.momentum * 0.62);

    if (left) {
      this.player.setAccelerationX(-runAcceleration);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setAccelerationX(runAcceleration);
      this.player.setFlipX(false);
    } else {
      this.player.setAccelerationX(0);
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.down) {
      this.jumpsRemaining = MAX_JUMPS;
    }

    if (jumpPressed && this.jumpsRemaining > 0) {
      const groundedJump = body.blocked.down;
      this.player.setVelocityY(groundedJump ? BASE_JUMP_VELOCITY : DOUBLE_JUMP_VELOCITY);
      sounds.playJump(!groundedJump);
      this.jumpHoldMs = 0;
      this.jumpExtending = true;
      this.jumpsRemaining -= 1;
    }

    if (this.jumpExtending && jumpHeld && this.player.body.velocity.y < 0 && this.jumpHoldMs < MAX_JUMP_HOLD_MS) {
      this.jumpHoldMs += delta;
      this.player.setVelocityY(this.player.body.velocity.y + JUMP_HOLD_ACCELERATION * (delta / 1000));
    }

    if (jumpReleased && this.player.body.velocity.y < JUMP_CUT_VELOCITY) {
      this.player.setVelocityY(JUMP_CUT_VELOCITY);
      this.jumpExtending = false;
    }

    if (!jumpHeld || this.jumpHoldMs >= MAX_JUMP_HOLD_MS || this.player.body.velocity.y >= 0) {
      this.jumpExtending = false;
    }

    this.updatePlayerAnimation(left, right, body);
    this.updateObstacleClears(body);

    if (this.player.y > HEIGHT + 60) {
      this.loseLife();
    }

    this.updateScoreHud();
  }

  private createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);

    this.createRobotTexture(graphics, 'robot-idle', 0, 0, false);
    this.createRobotTexture(graphics, 'robot-run-0', -5, 5, false);
    this.createRobotTexture(graphics, 'robot-run-1', 4, -4, false);
    this.createRobotTexture(graphics, 'robot-run-2', -3, 3, true);
    this.createRobotTexture(graphics, 'robot-jump', -6, -6, false);

    graphics.fillStyle(0x132033, 0.82);
    graphics.fillCircle(22, 22, 19);
    graphics.lineStyle(2, 0x9ee7ff, 0.75);
    graphics.strokeCircle(22, 22, 18);
    graphics.fillStyle(0xffd166, 1);
    graphics.fillCircle(22, 22, 14);
    graphics.lineStyle(3, 0xfff0a6, 1);
    graphics.strokeCircle(22, 22, 9);
    graphics.lineStyle(2, 0xb97f22, 1);
    graphics.strokeCircle(22, 22, 15);
    graphics.generateTexture('coin', 44, 44);
    graphics.clear();

    graphics.fillStyle(0x160f24, 1);
    graphics.fillRoundedRect(0, 0, 58, 30, 5);
    graphics.fillStyle(0x2a1740, 1);
    graphics.fillRoundedRect(4, 5, 50, 20, 4);
    graphics.fillStyle(0xff4fd8, 1);
    graphics.fillRect(6, 5, 8, 20);
    graphics.fillStyle(0xa7ff3f, 1);
    graphics.fillRect(18, 8, 30, 4);
    graphics.fillRect(18, 18, 30, 4);
    graphics.lineStyle(2, 0xff8bf0, 0.95);
    graphics.strokeRoundedRect(2, 2, 54, 26, 5);
    graphics.generateTexture('vent', 58, 30);
    graphics.clear();

    graphics.fillStyle(0x1b102b, 1);
    graphics.fillRoundedRect(0, 0, 46, 46, 5);
    graphics.fillStyle(0xff4fd8, 1);
    graphics.fillRect(3, 5, 40, 6);
    graphics.fillRect(3, 35, 40, 6);
    graphics.fillStyle(0xa7ff3f, 1);
    graphics.fillRect(8, 16, 30, 5);
    graphics.fillRect(8, 25, 30, 5);
    graphics.lineStyle(3, 0xff79e6, 1);
    graphics.strokeRoundedRect(2, 2, 42, 42, 5);
    graphics.lineStyle(2, 0x08101f, 0.8);
    graphics.lineBetween(8, 12, 36, 34);
    graphics.lineBetween(36, 12, 8, 34);
    graphics.generateTexture('crate', 46, 46);
    graphics.clear();

    graphics.fillStyle(0x140d24, 1);
    graphics.fillRoundedRect(0, 0, 58, 78, 6);
    graphics.fillStyle(0x28173d, 1);
    graphics.fillRoundedRect(5, 6, 48, 66, 4);
    graphics.fillStyle(0xff4fd8, 1);
    graphics.fillRect(9, 10, 8, 58);
    graphics.fillRect(41, 10, 8, 58);
    graphics.fillStyle(0xa7ff3f, 1);
    graphics.fillRect(20, 14, 18, 8);
    graphics.fillRect(20, 34, 18, 8);
    graphics.fillRect(20, 54, 18, 8);
    graphics.lineStyle(3, 0xff8bf0, 1);
    graphics.strokeRoundedRect(2, 2, 54, 74, 5);
    graphics.generateTexture('tower', 58, 78);
    graphics.clear();

    graphics.fillStyle(0x150d25, 1);
    graphics.fillRoundedRect(0, 0, 86, 26, 5);
    graphics.fillStyle(0x2a1842, 1);
    graphics.fillRoundedRect(5, 4, 76, 18, 4);
    graphics.fillStyle(0xff4fd8, 1);
    for (let x = 10; x < 72; x += 16) {
      graphics.fillRect(x, 4, 8, 18);
    }
    graphics.fillStyle(0xa7ff3f, 1);
    graphics.fillRect(12, 10, 62, 5);
    graphics.lineStyle(2, 0xff8bf0, 0.95);
    graphics.strokeRoundedRect(1, 1, 84, 24, 5);
    graphics.generateTexture('duct', 86, 26);
    graphics.clear();

    graphics.fillStyle(0x0b0714, 1);
    graphics.fillRoundedRect(0, 0, 82, 30, 6);
    graphics.fillStyle(0x2a1740, 1);
    graphics.fillRoundedRect(5, 4, 72, 22, 4);
    graphics.fillStyle(0xff4fd8, 1);
    graphics.fillRect(6, 4, 8, 22);
    graphics.fillRect(68, 4, 8, 22);
    graphics.fillStyle(0xa7ff3f, 1);
    graphics.fillRect(20, 11, 42, 7);
    graphics.lineStyle(2, 0xff8bf0, 1);
    graphics.strokeRoundedRect(1, 1, 80, 28, 6);
    graphics.generateTexture('gate-low', 82, 30);
    graphics.clear();

    graphics.fillStyle(0x0b0714, 1);
    graphics.fillRoundedRect(0, 0, 126, 32, 6);
    graphics.fillStyle(0x28133c, 1);
    graphics.fillRoundedRect(5, 5, 116, 22, 4);
    graphics.fillStyle(0xff4fd8, 1);
    graphics.fillRect(8, 6, 110, 5);
    graphics.fillRect(8, 22, 110, 5);
    graphics.fillStyle(0xa7ff3f, 1);
    for (let x = 18; x < 104; x += 20) {
      graphics.fillRect(x, 13, 11, 8);
    }
    graphics.lineStyle(2, 0xff8bf0, 1);
    graphics.strokeRoundedRect(1, 1, 124, 30, 6);
    graphics.generateTexture('gate-top', 126, 32);
    graphics.clear();

    graphics.lineStyle(5, 0xd8ebef, 1);
    graphics.lineBetween(26, 64, 26, 0);
    graphics.lineStyle(3, 0xff4fd8, 1);
    graphics.lineBetween(26, 8, 4, 34);
    graphics.lineBetween(26, 8, 48, 34);
    graphics.lineStyle(2, 0xa7ff3f, 0.9);
    graphics.lineBetween(26, 28, 8, 58);
    graphics.lineBetween(26, 28, 44, 58);
    graphics.fillStyle(0xff4fd8, 1);
    graphics.fillCircle(26, 8, 7);
    graphics.fillStyle(0xa7ff3f, 1);
    graphics.fillCircle(26, 8, 3);
    graphics.generateTexture('antenna', 52, 68);
    graphics.clear();

    graphics.fillStyle(0x08101f, 0.32);
    graphics.fillEllipse(41, 272, 82, 15);
    graphics.fillStyle(0x1d2a3a, 1);
    graphics.fillRoundedRect(16, 256, 50, 12, 4);
    graphics.fillStyle(0x4f6979, 1);
    graphics.fillRoundedRect(23, 246, 36, 13, 4);
    graphics.fillStyle(0xc8d9df, 1);
    graphics.fillRoundedRect(34, 13, 10, 238, 4);
    graphics.fillStyle(0xf8f4df, 0.72);
    graphics.fillRect(36, 19, 3, 226);
    graphics.fillStyle(0x6f8996, 1);
    graphics.fillRect(43, 21, 3, 224);
    graphics.fillStyle(0xffd166, 1);
    graphics.fillCircle(39, 10, 10);
    graphics.fillStyle(0xfff0a6, 1);
    graphics.fillCircle(36, 7, 3);
    graphics.lineStyle(2, 0x9a6a1d, 1);
    graphics.strokeCircle(39, 10, 8);

    graphics.lineStyle(3, 0xf8f4df, 0.85);
    graphics.lineBetween(47, 31, 47, 214);
    graphics.lineStyle(2, 0x9ee7ff, 0.7);
    graphics.lineBetween(31, 78, 53, 78);
    graphics.lineBetween(31, 144, 53, 144);
    graphics.fillStyle(0xffd166, 1);
    graphics.fillCircle(47, 78, 4);
    graphics.fillCircle(47, 144, 4);

    graphics.fillStyle(0x09111f, 0.45);
    graphics.fillTriangle(47, 33, 116, 53, 47, 102);
    graphics.fillStyle(0x4ecdc4, 1);
    graphics.fillTriangle(43, 27, 113, 48, 43, 95);
    graphics.fillStyle(0x76f3e9, 1);
    graphics.fillTriangle(43, 27, 78, 38, 43, 56);
    graphics.fillStyle(0x2bbdb4, 1);
    graphics.fillTriangle(43, 56, 113, 48, 43, 74);
    graphics.fillStyle(0x149f9a, 1);
    graphics.fillTriangle(43, 74, 95, 60, 43, 95);
    graphics.lineStyle(3, 0xf8f4df, 0.95);
    graphics.lineBetween(46, 30, 108, 48);
    graphics.lineStyle(2, 0x0d7672, 1);
    graphics.lineBetween(46, 93, 112, 49);
    graphics.lineStyle(2, 0xffffff, 0.42);
    graphics.lineBetween(55, 35, 77, 42);
    graphics.lineBetween(56, 64, 86, 57);

    graphics.generateTexture('flag', 122, 280);
    graphics.destroy();
  }

  private createRobotTexture(
    graphics: Phaser.GameObjects.Graphics,
    key: string,
    frontLegOffset: number,
    backLegOffset: number,
    bob: boolean
  ) {
    const bodyY = bob ? 9 : 7;
    const frontFootX = 28 + frontLegOffset;
    const backFootX = 13 + backLegOffset;
    const frontFootY = 55 - Math.max(0, frontLegOffset * 0.4);
    const backFootY = 55 - Math.max(0, -backLegOffset * 0.4);
    graphics.clear();

    graphics.lineStyle(4, 0xffd166, 1);
    graphics.lineBetween(16, bodyY + 29, 8, bodyY + 35 - backLegOffset / 3);
    graphics.lineBetween(32, bodyY + 29, 42, bodyY + 32 + frontLegOffset / 3);

    graphics.fillStyle(0x7ed7f0, 1);
    graphics.fillRoundedRect(13, bodyY + 21, 25, 21, 5);
    graphics.fillStyle(0x36566b, 1);
    graphics.fillRect(21, bodyY + 26, 12, 4);
    graphics.fillStyle(0xb8f3ff, 1);
    graphics.fillRoundedRect(12, bodyY + 1, 24, 22, 6);
    graphics.fillRoundedRect(30, bodyY + 7, 11, 12, 4);
    graphics.fillStyle(0x172033, 1);
    graphics.fillRoundedRect(25, bodyY + 8, 12, 9, 3);
    graphics.fillStyle(0x9ee7ff, 1);
    graphics.fillRect(30, bodyY + 11, 4, 4);
    graphics.fillStyle(0xffd166, 1);
    graphics.fillRect(34, bodyY + 18, 5, 2);
    graphics.fillStyle(0x9ee7ff, 1);
    graphics.fillRect(24, bodyY - 5, 3, 6);
    graphics.fillCircle(25, bodyY - 7, 3);

    graphics.lineStyle(6, 0x5f7480, 1);
    graphics.lineBetween(20, bodyY + 40, backFootX, backFootY - 2);
    graphics.lineBetween(31, bodyY + 40, frontFootX, frontFootY - 2);
    graphics.fillStyle(0x243243, 1);
    graphics.fillRoundedRect(backFootX - 7, backFootY - 4, 18, 8, 2);
    graphics.fillRoundedRect(frontFootX - 7, frontFootY - 4, 18, 8, 2);
    graphics.fillStyle(0xc8d9df, 1);
    graphics.fillRoundedRect(backFootX - 5, backFootY - 4, 14, 5, 2);
    graphics.fillRoundedRect(frontFootX - 5, frontFootY - 4, 14, 5, 2);
    graphics.generateTexture(key, 48, 60);
    graphics.clear();
  }

  private createPlayerAnimations() {
    if (this.anims.exists('robot-run')) {
      return;
    }

    this.anims.create({
      key: 'robot-idle',
      frames: [{ key: 'robot-idle' }],
      frameRate: 1
    });

    this.anims.create({
      key: 'robot-run',
      frames: [
        { key: 'robot-run-0' },
        { key: 'robot-run-1' },
        { key: 'robot-run-2' },
        { key: 'robot-run-1' }
      ],
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'robot-jump',
      frames: [{ key: 'robot-jump' }],
      frameRate: 1
    });
  }

  private addBackground() {
    this.cameras.main.setBackgroundColor('#101629');

    const sky = this.add.graphics();
    sky.setScrollFactor(0);
    sky.setDepth(-30);
    sky.fillStyle(0x070b17, 1);
    sky.fillRect(0, 0, WIDTH, HEIGHT);
    sky.fillStyle(0x101832, 1);
    sky.fillRect(0, 130, WIDTH, 190);
    sky.fillStyle(0x162241, 1);
    sky.fillRect(0, 300, WIDTH, HEIGHT - 300);
    sky.fillStyle(0x24304d, 0.35);
    sky.fillEllipse(520, 235, 920, 120);
    sky.fillStyle(0x111a30, 0.45);
    sky.fillEllipse(260, 315, 760, 90);
    sky.fillStyle(0xf2ddb2, 1);
    sky.fillCircle(818, 78, 38);
    sky.fillStyle(0x070b17, 1);
    sky.fillCircle(802, 68, 36);

    const stars = [
      [72, 74, 1], [116, 128, 2], [188, 96, 1], [254, 178, 1], [338, 58, 2],
      [432, 124, 1], [516, 86, 1], [602, 206, 1], [694, 112, 2], [770, 164, 1],
      [870, 132, 2], [932, 58, 1]
    ];
    stars.forEach(([x, y, radius], index) => {
      sky.fillStyle(index % 3 === 0 ? 0xf8f4df : 0x9ee7ff, index % 2 === 0 ? 0.95 : 0.65);
      sky.fillCircle(x, y, radius);
    });

    const distantSkyline = this.add.graphics();
    distantSkyline.setScrollFactor(0.22);
    distantSkyline.setDepth(-20);
    const midSkyline = this.add.graphics();
    midSkyline.setScrollFactor(0.42);
    midSkyline.setDepth(-15);
    const nearSkyline = this.add.graphics();
    nearSkyline.setScrollFactor(0.66);
    nearSkyline.setDepth(-10);

    type RoofStyle = 'flat' | 'antenna' | 'spire' | 'slant' | 'tank' | 'billboard';
    type WindowMode = 'grid' | 'stripes' | 'scattered';
    type Building = {
      graphics: Phaser.GameObjects.Graphics,
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
      windowColor: number,
      roof: RoofStyle,
      windows: WindowMode,
      alpha?: number
    };

    const drawWindows = (
      graphics: Phaser.GameObjects.Graphics,
      x: number,
      y: number,
      width: number,
      height: number,
      color: number,
      mode: WindowMode,
      alpha = 0.95
    ) => {
      if (mode === 'stripes') {
        for (let wy = y + 24; wy < y + height - 22; wy += 34) {
          graphics.fillStyle(color, alpha * 0.7);
          graphics.fillRect(x + 14, wy, width - 28, 5);
        }
        return;
      }

      for (let wx = x + 14; wx < x + width - 12; wx += 24) {
        for (let wy = y + 24; wy < y + height - 18; wy += 30) {
          const lit = mode === 'grid' ? (wx + wy) % 5 !== 0 : (wx * 3 + wy) % 7 < 3;
          graphics.fillStyle(lit ? color : 0x1a2540, lit ? alpha : 0.52);
          graphics.fillRect(wx, wy, mode === 'grid' ? 9 : 11, mode === 'grid' ? 13 : 9);
        }
      }
    };

    const drawBuilding = ({ graphics, x, y, w, h, color, windowColor, roof, windows, alpha = 1 }: Building) => {
      graphics.fillStyle(color, 1);
      graphics.fillRect(x, y, w, h);
      graphics.fillStyle(0x080d18, 0.86);
      graphics.fillRect(x - 4, y - 7, w + 8, 7);

      if (roof === 'spire') {
        graphics.fillStyle(color, alpha);
        graphics.fillTriangle(x + w * 0.24, y, x + w * 0.5, y - 48, x + w * 0.76, y);
        graphics.lineStyle(3, 0x7dd3fc, 0.72);
        graphics.lineBetween(x + w * 0.5, y - 48, x + w * 0.5, y - 76);
      } else if (roof === 'slant') {
        graphics.fillStyle(0x0b1020, 0.9);
        graphics.fillTriangle(x - 5, y, x + w + 5, y, x + w + 5, y - 28);
      } else if (roof === 'antenna') {
        graphics.lineStyle(3, 0x8fb3c4, 0.9);
        graphics.lineBetween(x + w * 0.5, y - 4, x + w * 0.5, y - 58);
        graphics.lineStyle(2, 0x7dd3fc, 0.75);
        graphics.lineBetween(x + w * 0.5, y - 42, x + w * 0.34, y - 24);
        graphics.lineBetween(x + w * 0.5, y - 42, x + w * 0.66, y - 24);
      } else if (roof === 'tank') {
        graphics.fillStyle(0x9ab6c2, 0.85);
        graphics.fillEllipse(x + w * 0.5, y - 17, 54, 20);
        graphics.fillRect(x + w * 0.5 - 26, y - 20, 52, 18);
        graphics.lineStyle(3, 0x5e7480, 0.9);
        graphics.lineBetween(x + w * 0.5 - 20, y - 2, x + w * 0.5 - 28, y + 18);
        graphics.lineBetween(x + w * 0.5 + 20, y - 2, x + w * 0.5 + 28, y + 18);
      } else if (roof === 'billboard') {
        graphics.fillStyle(0xffd166, 0.95);
        graphics.fillRoundedRect(x + 16, y - 38, w - 32, 24, 3);
        graphics.fillStyle(0x172033, 1);
        graphics.fillRect(x + 26, y - 29, w - 52, 6);
        graphics.lineStyle(3, 0x5f7480, 0.8);
        graphics.lineBetween(x + 28, y - 14, x + 28, y + 4);
        graphics.lineBetween(x + w - 28, y - 14, x + w - 28, y + 4);
      }

      drawWindows(graphics, x, y, w, h, windowColor, windows, alpha);
    };

    const distantBuildings: Building[] = [
      { graphics: distantSkyline, x: -80, y: 290, w: 160, h: 210, color: 0x111a2f, windowColor: 0x557b99, roof: 'flat', windows: 'stripes', alpha: 0.45 },
      { graphics: distantSkyline, x: 120, y: 246, w: 120, h: 254, color: 0x151d33, windowColor: 0x5ba8c7, roof: 'spire', windows: 'grid', alpha: 0.5 },
      { graphics: distantSkyline, x: 310, y: 316, w: 180, h: 184, color: 0x101a30, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'scattered', alpha: 0.45 },
      { graphics: distantSkyline, x: 560, y: 268, w: 140, h: 232, color: 0x172039, windowColor: 0xffd166, roof: 'flat', windows: 'grid', alpha: 0.45 },
      { graphics: distantSkyline, x: 760, y: 338, w: 210, h: 162, color: 0x11182c, windowColor: 0x6ec6e7, roof: 'slant', windows: 'stripes', alpha: 0.42 },
      { graphics: distantSkyline, x: 1050, y: 250, w: 155, h: 250, color: 0x16213b, windowColor: 0x9ee7ff, roof: 'spire', windows: 'scattered', alpha: 0.48 },
      { graphics: distantSkyline, x: 1290, y: 302, w: 190, h: 198, color: 0x10182e, windowColor: 0xffd166, roof: 'flat', windows: 'grid', alpha: 0.44 },
      { graphics: distantSkyline, x: 1560, y: 276, w: 130, h: 224, color: 0x17203a, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'stripes', alpha: 0.45 },
      { graphics: distantSkyline, x: 1780, y: 322, w: 230, h: 178, color: 0x111a30, windowColor: 0x6ec6e7, roof: 'tank', windows: 'scattered', alpha: 0.43 },
      { graphics: distantSkyline, x: 2100, y: 256, w: 170, h: 244, color: 0x141e37, windowColor: 0xffd166, roof: 'billboard', windows: 'grid', alpha: 0.45 },
      { graphics: distantSkyline, x: 2380, y: 304, w: 180, h: 196, color: 0x10182d, windowColor: 0x9ee7ff, roof: 'flat', windows: 'stripes', alpha: 0.43 },
      { graphics: distantSkyline, x: 2660, y: 238, w: 140, h: 262, color: 0x15203a, windowColor: 0x7dd3fc, roof: 'spire', windows: 'scattered', alpha: 0.46 },
      { graphics: distantSkyline, x: 2880, y: 330, w: 250, h: 170, color: 0x11192f, windowColor: 0xffd166, roof: 'slant', windows: 'grid', alpha: 0.42 },
      { graphics: distantSkyline, x: 3200, y: 284, w: 180, h: 216, color: 0x16203a, windowColor: 0x6ec6e7, roof: 'antenna', windows: 'stripes', alpha: 0.46 },
      { graphics: distantSkyline, x: 3460, y: 320, w: 210, h: 180, color: 0x10182d, windowColor: 0x9ee7ff, roof: 'flat', windows: 'grid', alpha: 0.43 },
      { graphics: distantSkyline, x: 3760, y: 256, w: 150, h: 244, color: 0x16213b, windowColor: 0xffd166, roof: 'spire', windows: 'scattered', alpha: 0.46 },
      { graphics: distantSkyline, x: 4020, y: 304, w: 190, h: 196, color: 0x111a30, windowColor: 0x6ec6e7, roof: 'tank', windows: 'stripes', alpha: 0.42 },
      { graphics: distantSkyline, x: 4300, y: 268, w: 170, h: 232, color: 0x172039, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'grid', alpha: 0.45 },
      { graphics: distantSkyline, x: 4560, y: 330, w: 250, h: 170, color: 0x11182c, windowColor: 0xffd166, roof: 'slant', windows: 'scattered', alpha: 0.42 },
      { graphics: distantSkyline, x: 4880, y: 286, w: 200, h: 214, color: 0x10182e, windowColor: 0x9ee7ff, roof: 'billboard', windows: 'grid', alpha: 0.44 },
      { graphics: distantSkyline, x: 5180, y: 318, w: 220, h: 182, color: 0x151d33, windowColor: 0x6ec6e7, roof: 'flat', windows: 'stripes', alpha: 0.43 },
      { graphics: distantSkyline, x: 5520, y: 250, w: 155, h: 250, color: 0x16213b, windowColor: 0xffd166, roof: 'spire', windows: 'scattered', alpha: 0.46 },
      { graphics: distantSkyline, x: 5780, y: 322, w: 230, h: 178, color: 0x111a30, windowColor: 0x6ec6e7, roof: 'tank', windows: 'grid', alpha: 0.42 },
      { graphics: distantSkyline, x: 6100, y: 276, w: 130, h: 224, color: 0x17203a, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'stripes', alpha: 0.45 },
      { graphics: distantSkyline, x: 6320, y: 330, w: 250, h: 170, color: 0x11192f, windowColor: 0xffd166, roof: 'slant', windows: 'grid', alpha: 0.42 },
      { graphics: distantSkyline, x: 6660, y: 256, w: 170, h: 244, color: 0x141e37, windowColor: 0x9ee7ff, roof: 'billboard', windows: 'scattered', alpha: 0.45 },
      { graphics: distantSkyline, x: 6940, y: 304, w: 180, h: 196, color: 0x10182d, windowColor: 0x6ec6e7, roof: 'flat', windows: 'stripes', alpha: 0.43 },
      { graphics: distantSkyline, x: 7220, y: 238, w: 140, h: 262, color: 0x15203a, windowColor: 0xffd166, roof: 'spire', windows: 'grid', alpha: 0.46 },
      { graphics: distantSkyline, x: 7480, y: 320, w: 250, h: 180, color: 0x11182c, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'scattered', alpha: 0.43 }
    ];
    distantBuildings.forEach(drawBuilding);

    const midBuildings: Building[] = [
      { graphics: midSkyline, x: -20, y: 352, w: 130, h: 150, color: 0x1d2946, windowColor: 0x7dd3fc, roof: 'billboard', windows: 'grid' },
      { graphics: midSkyline, x: 170, y: 284, w: 145, h: 218, color: 0x202d4d, windowColor: 0xffd166, roof: 'flat', windows: 'scattered' },
      { graphics: midSkyline, x: 390, y: 334, w: 115, h: 168, color: 0x1b2745, windowColor: 0x9ee7ff, roof: 'tank', windows: 'stripes' },
      { graphics: midSkyline, x: 590, y: 252, w: 150, h: 250, color: 0x253356, windowColor: 0xffd166, roof: 'slant', windows: 'grid' },
      { graphics: midSkyline, x: 820, y: 322, w: 180, h: 180, color: 0x1f2b4b, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'scattered' },
      { graphics: midSkyline, x: 1090, y: 292, w: 130, h: 210, color: 0x243155, windowColor: 0xf8f4df, roof: 'flat', windows: 'stripes' },
      { graphics: midSkyline, x: 1300, y: 356, w: 190, h: 146, color: 0x1b2747, windowColor: 0xffd166, roof: 'billboard', windows: 'grid' },
      { graphics: midSkyline, x: 1570, y: 272, w: 150, h: 230, color: 0x26375b, windowColor: 0x9ee7ff, roof: 'spire', windows: 'scattered' },
      { graphics: midSkyline, x: 1800, y: 332, w: 165, h: 170, color: 0x1f2c4c, windowColor: 0xffd166, roof: 'tank', windows: 'grid' },
      { graphics: midSkyline, x: 2050, y: 248, w: 150, h: 254, color: 0x263559, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'stripes' },
      { graphics: midSkyline, x: 2290, y: 350, w: 210, h: 152, color: 0x1b2743, windowColor: 0xf8f4df, roof: 'slant', windows: 'scattered' },
      { graphics: midSkyline, x: 2590, y: 292, w: 140, h: 210, color: 0x223152, windowColor: 0xffd166, roof: 'flat', windows: 'grid' },
      { graphics: midSkyline, x: 2820, y: 326, w: 185, h: 176, color: 0x1d2a49, windowColor: 0x9ee7ff, roof: 'billboard', windows: 'stripes' },
      { graphics: midSkyline, x: 3120, y: 264, w: 150, h: 238, color: 0x25365a, windowColor: 0xffd166, roof: 'spire', windows: 'grid' },
      { graphics: midSkyline, x: 3390, y: 348, w: 210, h: 154, color: 0x1b2743, windowColor: 0xf8f4df, roof: 'slant', windows: 'scattered' },
      { graphics: midSkyline, x: 3700, y: 282, w: 150, h: 220, color: 0x263559, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'stripes' },
      { graphics: midSkyline, x: 3940, y: 332, w: 175, h: 170, color: 0x1f2c4c, windowColor: 0xffd166, roof: 'tank', windows: 'grid' },
      { graphics: midSkyline, x: 4200, y: 272, w: 150, h: 230, color: 0x26375b, windowColor: 0x9ee7ff, roof: 'spire', windows: 'scattered' },
      { graphics: midSkyline, x: 4440, y: 356, w: 190, h: 146, color: 0x1b2747, windowColor: 0xffd166, roof: 'billboard', windows: 'grid' },
      { graphics: midSkyline, x: 4720, y: 292, w: 145, h: 210, color: 0x243155, windowColor: 0xf8f4df, roof: 'flat', windows: 'stripes' },
      { graphics: midSkyline, x: 4960, y: 322, w: 180, h: 180, color: 0x1f2b4b, windowColor: 0x7dd3fc, roof: 'antenna', windows: 'scattered' },
      { graphics: midSkyline, x: 5240, y: 284, w: 145, h: 218, color: 0x202d4d, windowColor: 0xffd166, roof: 'flat', windows: 'grid' },
      { graphics: midSkyline, x: 5520, y: 350, w: 210, h: 152, color: 0x1b2743, windowColor: 0xf8f4df, roof: 'slant', windows: 'scattered' },
      { graphics: midSkyline, x: 5820, y: 292, w: 140, h: 210, color: 0x223152, windowColor: 0xffd166, roof: 'flat', windows: 'grid' },
      { graphics: midSkyline, x: 6040, y: 326, w: 185, h: 176, color: 0x1d2a49, windowColor: 0x9ee7ff, roof: 'billboard', windows: 'stripes' },
      { graphics: midSkyline, x: 6340, y: 264, w: 150, h: 238, color: 0x25365a, windowColor: 0xffd166, roof: 'spire', windows: 'grid' },
      { graphics: midSkyline, x: 6600, y: 356, w: 190, h: 146, color: 0x1b2747, windowColor: 0x7dd3fc, roof: 'billboard', windows: 'scattered' },
      { graphics: midSkyline, x: 6900, y: 248, w: 150, h: 254, color: 0x263559, windowColor: 0x9ee7ff, roof: 'antenna', windows: 'stripes' },
      { graphics: midSkyline, x: 7160, y: 332, w: 165, h: 170, color: 0x1f2c4c, windowColor: 0xffd166, roof: 'tank', windows: 'grid' },
      { graphics: midSkyline, x: 7420, y: 272, w: 150, h: 230, color: 0x26375b, windowColor: 0x9ee7ff, roof: 'spire', windows: 'scattered' }
    ];
    midBuildings.forEach(drawBuilding);

    const nearBuildings: Building[] = [
      { graphics: nearSkyline, x: 36, y: 372, w: 95, h: 130, color: 0x293b58, windowColor: 0xffd166, roof: 'tank', windows: 'grid' },
      { graphics: nearSkyline, x: 250, y: 318, w: 130, h: 184, color: 0x314260, windowColor: 0x9ee7ff, roof: 'billboard', windows: 'stripes' },
      { graphics: nearSkyline, x: 540, y: 362, w: 105, h: 140, color: 0x283b59, windowColor: 0xffd166, roof: 'antenna', windows: 'scattered' },
      { graphics: nearSkyline, x: 760, y: 306, w: 135, h: 196, color: 0x354865, windowColor: 0xf8f4df, roof: 'slant', windows: 'grid' },
      { graphics: nearSkyline, x: 1020, y: 378, w: 150, h: 124, color: 0x283a57, windowColor: 0x7dd3fc, roof: 'flat', windows: 'stripes' },
      { graphics: nearSkyline, x: 1280, y: 330, w: 120, h: 172, color: 0x334661, windowColor: 0xffd166, roof: 'tank', windows: 'scattered' },
      { graphics: nearSkyline, x: 1510, y: 372, w: 175, h: 130, color: 0x283a58, windowColor: 0x9ee7ff, roof: 'billboard', windows: 'grid' },
      { graphics: nearSkyline, x: 1810, y: 310, w: 120, h: 192, color: 0x344762, windowColor: 0xffd166, roof: 'antenna', windows: 'stripes' },
      { graphics: nearSkyline, x: 2030, y: 360, w: 145, h: 142, color: 0x2c405d, windowColor: 0x7dd3fc, roof: 'flat', windows: 'scattered' },
      { graphics: nearSkyline, x: 2300, y: 328, w: 130, h: 174, color: 0x354a67, windowColor: 0xf8f4df, roof: 'slant', windows: 'grid' },
      { graphics: nearSkyline, x: 2540, y: 382, w: 200, h: 120, color: 0x293c59, windowColor: 0xffd166, roof: 'billboard', windows: 'stripes' },
      { graphics: nearSkyline, x: 2860, y: 318, w: 120, h: 184, color: 0x334762, windowColor: 0x9ee7ff, roof: 'tank', windows: 'scattered' },
      { graphics: nearSkyline, x: 3090, y: 370, w: 190, h: 132, color: 0x2b3e5b, windowColor: 0xffd166, roof: 'flat', windows: 'grid' },
      { graphics: nearSkyline, x: 3380, y: 330, w: 120, h: 172, color: 0x334661, windowColor: 0xffd166, roof: 'tank', windows: 'scattered' },
      { graphics: nearSkyline, x: 3620, y: 372, w: 175, h: 130, color: 0x283a58, windowColor: 0x9ee7ff, roof: 'billboard', windows: 'grid' },
      { graphics: nearSkyline, x: 3920, y: 310, w: 120, h: 192, color: 0x344762, windowColor: 0xffd166, roof: 'antenna', windows: 'stripes' },
      { graphics: nearSkyline, x: 4140, y: 360, w: 145, h: 142, color: 0x2c405d, windowColor: 0x7dd3fc, roof: 'flat', windows: 'scattered' },
      { graphics: nearSkyline, x: 4420, y: 328, w: 130, h: 174, color: 0x354a67, windowColor: 0xf8f4df, roof: 'slant', windows: 'grid' },
      { graphics: nearSkyline, x: 4660, y: 382, w: 200, h: 120, color: 0x293c59, windowColor: 0xffd166, roof: 'billboard', windows: 'stripes' },
      { graphics: nearSkyline, x: 4980, y: 318, w: 120, h: 184, color: 0x334762, windowColor: 0x9ee7ff, roof: 'tank', windows: 'scattered' },
      { graphics: nearSkyline, x: 5210, y: 370, w: 190, h: 132, color: 0x2b3e5b, windowColor: 0xffd166, roof: 'flat', windows: 'grid' },
      { graphics: nearSkyline, x: 5520, y: 328, w: 130, h: 174, color: 0x354a67, windowColor: 0xf8f4df, roof: 'slant', windows: 'grid' },
      { graphics: nearSkyline, x: 5760, y: 382, w: 200, h: 120, color: 0x293c59, windowColor: 0xffd166, roof: 'billboard', windows: 'stripes' },
      { graphics: nearSkyline, x: 6080, y: 318, w: 120, h: 184, color: 0x334762, windowColor: 0x9ee7ff, roof: 'tank', windows: 'scattered' },
      { graphics: nearSkyline, x: 6320, y: 370, w: 190, h: 132, color: 0x2b3e5b, windowColor: 0xffd166, roof: 'flat', windows: 'grid' },
      { graphics: nearSkyline, x: 6620, y: 330, w: 120, h: 172, color: 0x334661, windowColor: 0xffd166, roof: 'tank', windows: 'scattered' },
      { graphics: nearSkyline, x: 6860, y: 372, w: 175, h: 130, color: 0x283a58, windowColor: 0x9ee7ff, roof: 'billboard', windows: 'grid' },
      { graphics: nearSkyline, x: 7160, y: 310, w: 120, h: 192, color: 0x344762, windowColor: 0xffd166, roof: 'antenna', windows: 'stripes' },
      { graphics: nearSkyline, x: 7380, y: 360, w: 145, h: 142, color: 0x2c405d, windowColor: 0x7dd3fc, roof: 'flat', windows: 'scattered' }
    ];
    nearBuildings.forEach(drawBuilding);

    nearSkyline.lineStyle(3, 0x4ecdc4, 0.42);
    nearSkyline.lineBetween(0, 474, WORLD_WIDTH, 474);
    nearSkyline.fillStyle(0x0b1020, 0.9);
    nearSkyline.fillRect(0, 492, WORLD_WIDTH, 16);
  }

  private addFlatGround() {
    const height = STREET_LEVEL - GROUND_Y;
    const ground = this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + height / 2, WORLD_WIDTH, height, 0x1b1230);
    ground.setStrokeStyle(3, 0xff4fd8, 0.9);
    ground.setDepth(2);
    this.physics.add.existing(ground, true);
    this.buildings.add(ground);

    const details = this.add.graphics();
    details.setDepth(3);
    details.fillStyle(0x0b0714, 1);
    details.fillRect(0, GROUND_Y - 18, WORLD_WIDTH, 18);
    details.fillStyle(0xff4fd8, 1);
    details.fillRect(0, GROUND_Y - 7, WORLD_WIDTH, 4);
    details.fillStyle(0xa7ff3f, 0.9);
    details.fillRect(0, GROUND_Y - 2, WORLD_WIDTH, 3);

    for (let x = 0; x < WORLD_WIDTH; x += 56) {
      details.fillStyle(0x28133c, 1);
      details.fillTriangle(x, GROUND_Y - 18, x + 26, GROUND_Y - 18, x, GROUND_Y - 7);
      details.fillStyle(0xa7ff3f, 1);
      details.fillTriangle(x + 30, GROUND_Y - 7, x + 56, GROUND_Y - 7, x + 56, GROUND_Y - 18);
    }

    details.fillStyle(0x130d23, 1);
    details.fillRect(14, GROUND_Y + 12, WORLD_WIDTH - 28, 9);
    details.fillStyle(0xff4fd8, 0.35);
    details.fillRect(14, GROUND_Y + 25, WORLD_WIDTH - 28, 3);
    details.lineStyle(2, 0x9a57ff, 0.5);

    for (let x = 44; x < WORLD_WIDTH; x += 150) {
      details.lineBetween(x, GROUND_Y + 2, x, GROUND_Y + 112);
      details.fillStyle(0x2a1740, 1);
      details.fillRect(x - 30, GROUND_Y + 50, 60, 18);
      details.fillStyle(0x0d0718, 1);
      details.fillRect(x - 23, GROUND_Y + 56, 46, 7);
    }

    details.lineStyle(5, 0xff4fd8, 0.85);
    for (let x = 90; x < WORLD_WIDTH; x += 360) {
      details.lineBetween(x, GROUND_Y + 36, x + 130, GROUND_Y + 36);
      details.lineStyle(3, 0xa7ff3f, 0.82);
      details.lineBetween(x + 18, GROUND_Y + 48, x + 148, GROUND_Y + 48);
      details.lineStyle(5, 0xff4fd8, 0.85);
    }
  }

  private addObstacle(x: number, roofY: number, texture: ObstacleTexture) {
    const obstacle = this.physics.add.staticImage(x, roofY, texture);
    obstacle.setOrigin(0.5, 1);
    obstacle.setDepth(4);
    obstacle.setData('cleared', false);
    obstacle.setData('flowTarget', true);

    if (texture === 'tower') {
      obstacle.body?.setSize(48, 72).setOffset(5, 6);
    } else if (texture === 'duct') {
      obstacle.body?.setSize(78, 22).setOffset(4, 4);
    } else {
      obstacle.body?.setSize(obstacle.width - 8, obstacle.height - 4).setOffset(4, 4);
    }

    obstacle.refreshBody();
    this.obstacles.add(obstacle);
  }

  private addGate(x: number) {
    const lower = this.physics.add.staticImage(x, GROUND_Y, 'gate-low');
    lower.setOrigin(0.5, 1);
    lower.setDepth(5);
    lower.setData('cleared', false);
    lower.setData('flowTarget', true);
    lower.body?.setSize(74, 26).setOffset(4, 4);
    lower.refreshBody();
    this.obstacles.add(lower);

    const upper = this.physics.add.staticImage(x, GROUND_Y - 140, 'gate-top');
    upper.setOrigin(0.5, 1);
    upper.setDepth(5);
    upper.setData('cleared', true);
    upper.setData('flowTarget', false);
    upper.body?.setSize(118, 28).setOffset(4, 2);
    upper.refreshBody();
    this.obstacles.add(upper);
  }

  private applyStartingMomentum() {
    if (this.upgrades.turboStart === 0) {
      return;
    }

    this.momentum = Math.min(0.58, this.upgrades.turboStart * 0.24);
    const maxSpeed = Phaser.Math.Linear(BASE_RUN_SPEED, MAX_RUN_SPEED, this.momentum);
    this.player.setMaxVelocity(maxSpeed, 620);
  }

  private handleObstacleCollision() {
    if (this.shockCharges > 0 && this.time.now - this.lastShockAbsorbAt > 650) {
      this.shockCharges -= 1;
      this.lastShockAbsorbAt = this.time.now;
      this.player.setVelocityX(Math.max(this.player.body.velocity.x, BASE_RUN_SPEED + this.momentum * 160));
      this.showRunMessage(this.copy().shockLeft(this.shockCharges), '#a7ff3f');
      return;
    }

    this.resetMomentum();
    this.resetFlow();
  }

  private showRunMessage(text: string, color = '#fff0a6') {
    this.messageText.setText(text);
    this.messageText.setColor(color);
    this.tweens.add({
      targets: this.messageText,
      scale: 1.1,
      yoyo: true,
      duration: 120,
      ease: 'Sine.easeOut'
    });
    this.time.delayedCall(900, () => {
      if (this.messageText.text === text && !this.finishing && !this.finished) {
        this.messageText.setText('');
        this.messageText.setColor('#fff0a6');
      }
    });
  }

  private copy() {
    return UI_COPY[this.language];
  }

  private loadLanguage(): Language {
    try {
      return window.localStorage.getItem(LANGUAGE_KEY) === 'de' ? 'de' : 'en';
    } catch {
      return 'en';
    }
  }

  private saveLanguage() {
    try {
      window.localStorage.setItem(LANGUAGE_KEY, this.language);
    } catch {
      // Language switching should still work for the current session.
    }
  }

  private toggleLanguage() {
    this.setLanguage(this.language === 'en' ? 'de' : 'en');
  }

  private setLanguage(language: Language) {
    if (this.language === language) {
      return;
    }

    this.language = language;
    this.saveLanguage();
    this.updateLanguageText();
    this.updateScoreHud();
  }

  private updateLanguageText() {
    const english = this.language === 'en';
    this.languageActive?.setPosition(english ? WIDTH - 84 : WIDTH - 44, 28);
    this.languageActive?.setFillStyle(english ? 0x9ee7ff : 0xa7ff3f, 0.22);
    this.languageActive?.setStrokeStyle(1, english ? 0x9ee7ff : 0xa7ff3f, 0.88);
    this.languageEnText?.setColor(english ? '#ffffff' : '#7f91a6');
    this.languageDeText?.setColor(english ? '#7f91a6' : '#ffffff');
    this.languageBack?.setStrokeStyle(2, english ? 0x9ee7ff : 0xa7ff3f, 0.72);
  }

  private collectCoin(coin: Phaser.GameObjects.GameObject) {
    coin.destroy();
    this.coinsCollected += 1;
    sounds.playCoin();
    this.updateScoreHud();
    this.tweens.add({
      targets: this.scoreText,
      scale: 1.16,
      yoyo: true,
      duration: 90
    });
  }

  private updateObstacleClears(body: Phaser.Physics.Arcade.Body) {
    this.obstacles.getChildren().forEach(child => {
      const obstacle = child as Phaser.Physics.Arcade.Image;
      if (!obstacle.getData('flowTarget')) {
        return;
      }

      if (obstacle.getData('cleared')) {
        return;
      }

      const clearLine = obstacle.x + obstacle.displayWidth / 2 + FLOW_CLEAR_DISTANCE;
      if (this.player.x < clearLine) {
        return;
      }

      obstacle.setData('cleared', true);
      const airborneClear = this.player.y < FLOW_AIR_BONUS_MIN_Y;
      const fastClear = body.velocity.x > BASE_RUN_SPEED * 0.86;

      if (airborneClear && fastClear) {
        this.awardFlowClear(obstacle);
      } else {
        this.resetFlow();
      }
    });
  }

  private awardFlowClear(obstacle: Phaser.Physics.Arcade.Image) {
    this.flowCombo += 1;

    const baseBonus = 120 + this.flowCombo * 80 + Math.round(this.momentum * 140);
    const bonus = Math.round(baseBonus * (1 + this.upgrades.flowMultiplier * 0.35));
    this.flowScore += bonus;
    this.latestFlowBonus = bonus;
    this.flowBonusVisibleUntil = this.time.now + 900;
    this.updateFlowHud();

    const popup = this.add.text(obstacle.x, Math.max(210, this.player.y - 86), `${this.copy().flow} +${bonus}`, {
      fontFamily: RETRO_FONT,
      fontSize: '17px',
      color: '#a7ff3f',
      stroke: '#050914',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5).setDepth(90);

    this.tweens.add({
      targets: popup,
      y: popup.y - 34,
      alpha: 0,
      duration: 760,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy()
    });

    this.tweens.add({
      targets: [this.flowText, this.flowBadge],
      scale: 1.12,
      yoyo: true,
      duration: 120,
      ease: 'Sine.easeOut'
    });

    this.tweens.add({
      targets: this.flowBadgeGlow,
      alpha: 0.34,
      yoyo: true,
      duration: 150,
      ease: 'Sine.easeOut'
    });
  }

  private loseLife() {
    if (this.invulnerable || this.finished || this.finishing) {
      return;
    }

    this.invulnerable = true;
    this.player.setPosition(Math.max(90, this.player.x - 160), 330);
    this.player.setVelocity(0, -120);
    this.player.setAlpha(0.45);
    this.time.delayedCall(900, () => {
      this.invulnerable = false;
      this.player.setAlpha(1);
    });
  }

  private reachGoal() {
    if (this.finished || this.finishing) {
      return;
    }

    this.finishing = true;
    const elapsedSeconds = this.elapsedSeconds();
    const coinScore = this.coinsCollected * 250;
    const speedScore = this.speedScore(elapsedSeconds);
    const flagBonus = this.flagBonus();
    const total = coinScore + speedScore + this.flowScore + flagBonus;
    const nextSetScore = this.setScore + total;
    const nextSetCoins = this.setCoins + this.coinsCollected;
    const nextSetTime = this.setTime + elapsedSeconds;

    this.score = total;
    this.scoreText.setText(`${this.copy().score} ${total}`);
    this.messageText.setText(`${this.copy().flag} +${flagBonus}`);
    this.player.setAccelerationX(0);
    this.player.setMaxVelocity(360, 620);
    this.player.setVelocityX(340);
    this.player.setFlipX(false);
    this.player.play('robot-run', true);
    this.goal.body.enable = false;
    this.playFinishEffect(flagBonus);
    this.time.delayedCall(1250, () => {
      this.finishing = false;
      this.finished = true;
      this.player.setAccelerationX(0);
      this.player.setVelocity(0, 0);
      this.setScore = nextSetScore;
      this.setCoins = nextSetCoins;
      this.setTime = nextSetTime;

      if (this.runNumber < TOTAL_RUNS) {
        this.showUpgradeScreen(total, coinScore, speedScore, this.flowScore, flagBonus, elapsedSeconds);
        return;
      }

      const { scores, rank } = this.saveHighScore({
        score: this.setScore,
        coins: this.setCoins,
        time: this.setTime,
        date: new Date().toISOString()
      });
      this.showHighScoreScreen(this.setScore, this.setCoins, this.setTime, scores, rank);
    });
  }

  private playFinishEffect(flagBonus: number) {
    this.cameras.main.flash(420, 255, 241, 180);
    this.cameras.main.shake(240, 0.004);

    this.tweens.add({
      targets: this.goal,
      scale: 1.08,
      yoyo: true,
      repeat: 3,
      duration: 120,
      ease: 'Sine.easeInOut'
    });

    const markerY = Phaser.Math.Clamp(this.player.y - 30, FLAG_TOP_Y + 6, FLAG_BOTTOM_Y);
    const flagMarker = this.add.text(this.goal.x + 40, markerY, `+${flagBonus}`, {
      fontFamily: RETRO_FONT,
      fontSize: '22px',
      color: '#ffd166',
      stroke: '#050914',
      strokeThickness: 5,
      shadow: RETRO_SHADOW
    }).setOrigin(0, 0.5).setDepth(90);

    this.tweens.add({
      targets: flagMarker,
      y: markerY - 48,
      alpha: 0,
      duration: 1050,
      ease: 'Cubic.easeOut',
      onComplete: () => flagMarker.destroy()
    });

    const finishRibbon = this.add.rectangle(this.goal.x + 15, markerY, 78, 5, 0xffd166, 0.9).setDepth(88);
    this.tweens.add({
      targets: finishRibbon,
      x: this.goal.x + 80,
      alpha: 0,
      duration: 640,
      ease: 'Sine.easeOut',
      onComplete: () => finishRibbon.destroy()
    });

    const colors = [0xffd166, 0x4ecdc4, 0xf25f5c, 0xf8f4df, 0x9ee7ff];
    for (let i = 0; i < 52; i += 1) {
      const piece = this.add.rectangle(
        this.goal.x,
        this.goal.y - 42,
        Phaser.Math.Between(5, 10),
        Phaser.Math.Between(8, 14),
        colors[i % colors.length]
      );
      piece.setDepth(80);
      piece.setAngle(Phaser.Math.Between(0, 180));

      this.tweens.add({
        targets: piece,
        x: this.goal.x + Phaser.Math.Between(-180, 180),
        y: this.goal.y + Phaser.Math.Between(-170, 70),
        angle: piece.angle + Phaser.Math.Between(180, 720),
        alpha: 0,
        duration: Phaser.Math.Between(850, 1350),
        ease: 'Cubic.easeOut',
        onComplete: () => piece.destroy()
      });
    }
  }

  private showUpgradeScreen(
    runScore: number,
    coinScore: number,
    speedScore: number,
    flowScore: number,
    flagBonus: number,
    elapsedSeconds: number
  ) {
    const copy = this.copy();
    this.messageText.setText('');
    this.upgradePanel?.destroy(true);

    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setScrollFactor(0).setDepth(1000);
    const backdrop = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x050914, 0.66);
    const card = this.add.rectangle(0, 0, 720, 408, 0x10182e, 0.98);
    const cardGlow = this.add.rectangle(0, 0, 736, 424).setStrokeStyle(2, 0xff4fd8, 0.24);
    const cardStroke = this.add.rectangle(0, 0, 720, 408).setStrokeStyle(3, 0xa7ff3f, 0.82);
    const titleBar = this.add.rectangle(0, -170, 610, 3, 0xff4fd8, 0.9);
    const title = this.add.text(0, -172, `${copy.run} ${this.runNumber} ${copy.complete}`, {
      fontFamily: RETRO_FONT,
      fontSize: '26px',
      color: '#ffd166',
      stroke: '#050914',
      strokeThickness: 6,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5);

    const summary = this.add.text(0, -132, `${copy.score} ${runScore}   ${copy.set} ${this.setScore}   ${copy.coins} ${this.setCoins}   ${this.setTime.toFixed(1)}s`, {
      fontFamily: RETRO_FONT,
      fontSize: '13px',
      color: '#fff0a6',
      stroke: '#050914',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5);

    const breakdown = this.add.text(0, -108, `${copy.coins} ${coinScore}   ${copy.speed} ${speedScore}   ${copy.flow} ${flowScore}   ${copy.flag} ${flagBonus}   ${elapsedSeconds.toFixed(1)}s`, {
      fontFamily: RETRO_FONT,
      fontSize: '12px',
      color: '#9ee7ff',
      stroke: '#050914',
      strokeThickness: 3,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5);

    const choose = this.add.text(0, -78, `${copy.chooseUpgrade} - ${copy.run} ${this.runNumber + 1}`, {
      fontFamily: RETRO_FONT,
      fontSize: '17px',
      color: '#a7ff3f',
      stroke: '#050914',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5);

    panel.add([backdrop, cardGlow, card, cardStroke, titleBar, title, summary, breakdown, choose]);

    UPGRADE_DEFINITIONS.forEach((upgrade, index) => {
      const y = -34 + index * 48;
      const level = this.upgrades[upgrade.id];
      const rowBack = this.add.rectangle(0, y, 620, 38, 0x17233a, 0.82);
      const keyText = this.add.text(-294, y, `${index + 1}`, {
        fontFamily: RETRO_FONT,
        fontSize: '20px',
        color: '#ff8bf0',
        stroke: '#050914',
        strokeThickness: 4,
        shadow: RETRO_SHADOW
      }).setOrigin(0.5);
      const label = this.add.text(-264, y - 7, `${upgrade.name[this.language]}  ${level}`, {
        fontFamily: RETRO_FONT,
        fontSize: '14px',
        color: '#f8f4df',
        stroke: '#050914',
        strokeThickness: 3,
        shadow: RETRO_SHADOW
      }).setOrigin(0, 0.5);
      const short = this.add.text(288, y - 7, upgrade.short[this.language], {
        fontFamily: RETRO_FONT,
        fontSize: '12px',
        color: '#ffd166',
        stroke: '#050914',
        strokeThickness: 3,
        shadow: RETRO_SHADOW
      }).setOrigin(1, 0.5);
      const description = this.add.text(-264, y + 10, upgrade.description[this.language], {
        fontFamily: RETRO_FONT,
        fontSize: '12px',
        color: '#9ee7ff',
        stroke: '#050914',
        strokeThickness: 2
      }).setOrigin(0, 0.5);

      panel.add([rowBack, keyText, label, short, description]);
    });

    const prompt = this.add.text(0, 176, copy.selectUpgrade, {
      fontFamily: RETRO_FONT,
      fontSize: '16px',
      color: '#4ecdc4',
      stroke: '#050914',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5);
    panel.add(prompt);

    panel.setScale(0.84);
    panel.setAlpha(0);
    this.tweens.add({
      targets: panel,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut'
    });

    this.upgradePanel = panel;
  }

  private handleUpgradeInput() {
    const keyIndex = [
      this.upgradeKeys.ONE,
      this.upgradeKeys.TWO,
      this.upgradeKeys.THREE,
      this.upgradeKeys.FOUR,
      this.upgradeKeys.FIVE
    ].findIndex(key => Phaser.Input.Keyboard.JustDown(key));

    if (keyIndex === -1) {
      return;
    }

    this.chooseUpgrade(UPGRADE_DEFINITIONS[keyIndex].id);
  }

  private chooseUpgrade(id: UpgradeId) {
    const upgrades = { ...this.upgrades, [id]: this.upgrades[id] + 1 };
    this.scene.restart({
      runNumber: this.runNumber + 1,
      setScore: this.setScore,
      setCoins: this.setCoins,
      setTime: this.setTime,
      upgrades
    } satisfies RunSceneData);
  }

  private showHighScoreScreen(
    total: number,
    coins: number,
    elapsedSeconds: number,
    scores: HighScoreEntry[],
    rank: number
  ) {
    const copy = this.copy();
    this.messageText.setText('');
    this.highScorePanel?.destroy(true);

    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setScrollFactor(0).setDepth(1000);
    const backdrop = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x050914, 0.62);
    const card = this.add.rectangle(0, 0, 620, 420, 0x10182e, 0.97);
    const cardGlow = this.add.rectangle(0, 0, 636, 436).setStrokeStyle(2, 0xff4fd8, 0.26);
    const cardStroke = this.add.rectangle(0, 0, 620, 420).setStrokeStyle(3, 0xffd166, 0.86);
    const titleBar = this.add.rectangle(0, -174, 520, 3, 0x4ecdc4, 0.9);
    const title = this.add.text(0, -176, rank === 1 ? copy.newHighScore : copy.finish, {
      fontFamily: RETRO_FONT,
      fontSize: '32px',
      color: '#ffd166',
      stroke: '#050914',
      strokeThickness: 6,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5);

    const breakdown = this.add.text(0, -130, `${copy.set} ${total}   ${copy.runs} ${TOTAL_RUNS}/${TOTAL_RUNS}   ${copy.coins} ${coins}   ${elapsedSeconds.toFixed(1)}s`, {
      fontFamily: RETRO_FONT,
      fontSize: '13px',
      color: '#fff0a6',
      stroke: '#050914',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5);

    const heading = this.add.text(-236, -62, copy.highScores, {
      fontFamily: RETRO_FONT,
      fontSize: '18px',
      color: '#9ee7ff',
      stroke: '#050914',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setOrigin(0, 0.5);

    const headingRule = this.add.rectangle(0, -42, 500, 2, 0x2f4f6b, 1);
    panel.add([backdrop, cardGlow, card, cardStroke, titleBar, title, breakdown, heading, headingRule]);

    const rows = scores.length > 0 ? scores : [{ score: total, coins: this.coinsCollected, time: elapsedSeconds, date: new Date().toISOString() }];
    rows.slice(0, 5).forEach((entry, index) => {
      const isCurrent = index + 1 === rank;
      const y = -24 + index * 40;
      const rowBack = this.add.rectangle(0, y, 500, 32, isCurrent ? 0x29445a : 0x17233a, isCurrent ? 0.95 : 0.74);
      const row = this.add.text(-238, y, `${index + 1}  ${entry.score} ${copy.points}    ${entry.coins} ${copy.coins}    ${entry.time.toFixed(1)}s`, {
        fontFamily: RETRO_FONT,
        fontSize: '15px',
        color: isCurrent ? '#ffd166' : '#f8f4df',
        stroke: '#050914',
        strokeThickness: 2
      }).setOrigin(0, 0.5);
      panel.add([rowBack, row]);
    });

    const prompt = this.add.text(0, 170, copy.playAgain, {
      fontFamily: RETRO_FONT,
      fontSize: '18px',
      color: '#4ecdc4',
      stroke: '#050914',
      strokeThickness: 4,
      shadow: RETRO_SHADOW
    }).setOrigin(0.5);
    panel.add(prompt);

    panel.setScale(0.82);
    panel.setAlpha(0);
    this.tweens.add({
      targets: panel,
      alpha: 1,
      scale: 1,
      duration: 280,
      ease: 'Back.easeOut'
    });

    this.highScorePanel = panel;
  }

  private saveHighScore(entry: HighScoreEntry) {
    const existing = this.loadHighScores();
    const scores = [...existing, entry]
      .sort((a, b) => b.score - a.score || a.time - b.time)
      .slice(0, 5);
    const rank = scores.indexOf(entry) + 1;

    try {
      window.localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(scores));
    } catch {
      // High scores are a nicety; the finish screen still works without storage.
    }

    return { scores, rank };
  }

  private loadHighScores(): HighScoreEntry[] {
    try {
      const raw = window.localStorage.getItem(HIGH_SCORE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as HighScoreEntry[];
      return parsed.filter(entry =>
        Number.isFinite(entry.score) &&
        Number.isFinite(entry.coins) &&
        Number.isFinite(entry.time) &&
        typeof entry.date === 'string'
      );
    } catch {
      return [];
    }
  }

  private flagBonus() {
    const hitY = this.player.body.center.y;
    const heightScore = Phaser.Math.Clamp((FLAG_BOTTOM_Y - hitY) / (FLAG_BOTTOM_Y - FLAG_TOP_Y), 0, 1);
    return Phaser.Math.Snap.To(Math.round(Phaser.Math.Linear(500, 2500, heightScore)), 100);
  }

  private updateScoreHud() {
    const copy = this.copy();
    const elapsedSeconds = this.elapsedSeconds();
    this.score = this.coinsCollected * 250 + this.speedScore(elapsedSeconds) + this.flowScore;
    this.scoreText.setText(`${copy.run} ${this.runNumber}/${TOTAL_RUNS}  ${this.score}`);
    this.coinsText.setText(`${copy.coins} ${this.coinsCollected}/${this.totalCoins}`);
    this.timeText.setText(`${elapsedSeconds.toFixed(1)}s  ${copy.set} ${this.setScore}`);
    this.updateFlowHud();
    this.updateSpeedHud();
  }

  private updateSpeedHud() {
    const copy = this.copy();
    const percent = Math.round(this.momentum * 100);
    const currentMax = Math.round(Phaser.Math.Linear(BASE_RUN_SPEED, MAX_RUN_SPEED, this.momentum));
    this.speedText.setText(`${copy.speed} ${percent}%  ${currentMax}`);
    this.speedText.setColor(percent >= 80 ? '#a7ff3f' : percent >= 35 ? '#ff8bf0' : '#f8f4df');
    this.speedBar.displayWidth = Math.max(1, 172 * this.momentum);
    this.speedBar.fillColor = percent >= 80 ? 0xa7ff3f : 0xff4fd8;
    this.speedBadge.setStrokeStyle(2, percent >= 80 ? 0xa7ff3f : 0x9a57ff, percent > 0 ? 0.88 : 0.58);
  }

  private updateFlowHud() {
    const copy = this.copy();
    if (this.flowCombo > 0 && this.time.now < this.flowBonusVisibleUntil) {
      this.flowText.setText(`${copy.flow} x${this.flowCombo}  +${this.latestFlowBonus}`);
      this.flowText.setColor('#a7ff3f');
      this.flowBadge.setStrokeStyle(3, 0xa7ff3f, 0.98);
      return;
    }

    if (this.flowCombo > 0) {
      this.flowText.setText(`${copy.flow} x${this.flowCombo}  ${this.flowScore}`);
      this.flowText.setColor('#ff8bf0');
      this.flowBadge.setStrokeStyle(3, 0xff4fd8, 0.92);
      return;
    }

    this.flowText.setText(this.flowScore > 0 ? `${copy.flow} ${this.flowScore}` : `${copy.flow} ${copy.ready}`);
    this.flowText.setColor(this.flowScore > 0 ? '#f8f4df' : '#a7ff3f');
    this.flowBadge.setStrokeStyle(3, 0xff4fd8, 0.82);
  }

  private elapsedSeconds() {
    if (!this.runStarted) {
      return 0;
    }

    return Math.max(0, (this.time.now - this.runStartedAt) / 1000);
  }

  private speedScore(elapsedSeconds: number) {
    return Math.max(0, Math.round(6000 - elapsedSeconds * 100));
  }

  private updateMomentum(right: boolean, left: boolean, delta: number) {
    const movingRight = right && !left;
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    if (!movingRight || Math.abs(body.velocity.x) < 20) {
      this.resetMomentum();
      this.resetFlow();
      return;
    }

    if (body.blocked.down) {
      const buildRate = MOMENTUM_BUILD_PER_SECOND * (1 + this.upgrades.overdrive * 0.55);
      this.momentum = Math.min(1, this.momentum + buildRate * (delta / 1000));
    }

    const maxSpeed = Phaser.Math.Linear(BASE_RUN_SPEED, MAX_RUN_SPEED, this.momentum);
    this.player.setMaxVelocity(maxSpeed, 620);
  }

  private resetMomentum() {
    if (this.momentum === 0) {
      return;
    }

    this.momentum = 0;
    this.player.setMaxVelocity(BASE_RUN_SPEED, 620);
  }

  private resetFlow() {
    if (this.flowCombo === 0) {
      return;
    }

    this.flowCombo = 0;
    this.flowBonusVisibleUntil = 0;
    this.updateFlowHud();
  }

  private updatePlayerAnimation(left: boolean, right: boolean, body: Phaser.Physics.Arcade.Body) {
    if (!body.blocked.down) {
      this.player.play('robot-jump', true);
      return;
    }

    if ((left || right) && Math.abs(body.velocity.x) > 24) {
      this.player.play('robot-run', true);
      return;
    }

    this.player.play('robot-idle', true);
  }

  private startRunTimer() {
    if (this.runStarted) {
      return;
    }

    this.runStarted = true;
    this.runStartedAt = this.time.now;
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#101629',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1100 },
      debug: false
    }
  },
  scene: RunnerScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  pixelArt: false
});
