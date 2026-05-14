import Phaser from 'phaser';
import './styles.css';

const WIDTH = 960;
const HEIGHT = 540;
const WORLD_WIDTH = 3400;
const STREET_LEVEL = 600;
const GROUND_Y = 456;
const HIGH_SCORE_KEY = 'jumper-man-high-scores';
const BASE_JUMP_VELOCITY = -430;
const JUMP_HOLD_ACCELERATION = -1500;
const MAX_JUMP_HOLD_MS = 190;
const JUMP_CUT_VELOCITY = -230;
const BASE_RUN_ACCELERATION = 1500;
const BASE_RUN_SPEED = 330;
const MAX_RUN_SPEED = 430;
const MOMENTUM_BUILD_PER_SECOND = 0.09;

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
  private messageText!: Phaser.GameObjects.Text;
  private highScorePanel?: Phaser.GameObjects.Container;
  private score = 0;
  private coinsCollected = 0;
  private totalCoins = 0;
  private runStartedAt = 0;
  private runStarted = false;
  private finished = false;
  private invulnerable = false;
  private jumpHoldMs = 0;
  private jumpExtending = false;
  private momentum = 0;

  constructor() {
    super('runner');
  }

  preload() {
    this.createTextures();
  }

  create() {
    this.score = 0;
    this.coinsCollected = 0;
    this.finished = false;
    this.invulnerable = false;
    this.runStarted = false;
    this.runStartedAt = 0;
    this.jumpHoldMs = 0;
    this.jumpExtending = false;
    this.momentum = 0;
    this.highScorePanel?.destroy(true);
    this.highScorePanel = undefined;

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, HEIGHT + 220);
    this.addBackground();

    this.buildings = this.physics.add.staticGroup();
    this.addFlatGround();

    this.obstacles = this.physics.add.staticGroup();
    this.addObstacle(260, GROUND_Y, 'vent');
    this.addObstacle(540, GROUND_Y, 'crate');
    this.addObstacle(850, GROUND_Y, 'duct');
    this.addObstacle(1160, GROUND_Y, 'tower');
    this.addObstacle(1510, GROUND_Y, 'crate');
    this.addObstacle(1780, GROUND_Y, 'antenna');
    this.addObstacle(2070, GROUND_Y, 'tower');
    this.addObstacle(2390, GROUND_Y, 'duct');
    this.addObstacle(2680, GROUND_Y, 'crate');
    this.addObstacle(2960, GROUND_Y, 'tower');

    this.createPlayerAnimations();
    this.player = this.physics.add.sprite(90, GROUND_Y - 30, 'robot-idle');
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(1100);
    this.player.setMaxVelocity(BASE_RUN_SPEED, 620);
    this.player.body?.setSize(32, 54).setOffset(8, 4);
    this.player.setDepth(8);
    this.player.play('robot-idle');

    this.physics.add.collider(this.player, this.buildings);
    this.physics.add.collider(this.player, this.obstacles, () => this.resetMomentum(), undefined, this);

    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    [
      [360, 410],
      [670, 388],
      [970, 410],
      [1280, 350],
      [1630, 410],
      [1910, 370],
      [2190, 350],
      [2510, 410],
      [2795, 388],
      [3090, 350],
      [3260, 410]
    ].forEach(([x, y]) => {
      const coin = this.coins.create(x, y, 'coin') as Phaser.Physics.Arcade.Image;
      coin.setCircle(14, 8, 8);
      coin.setDepth(6);
    });
    this.totalCoins = this.coins.getLength();

    this.goal = this.physics.add.staticImage(3310, GROUND_Y - 60, 'flag');
    this.goal.body?.setSize(60, 110).setOffset(10, 10);

    this.physics.add.overlap(this.player, this.coins, (_player, coin) => this.collectCoin(coin as Phaser.GameObjects.GameObject), undefined, this);
    this.physics.add.overlap(this.player, this.goal, () => this.reachGoal(), undefined, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('A,D,W,SPACE') as typeof this.wasd;
    this.input.keyboard!.once('keydown', () => music.start());
    this.input.once('pointerdown', () => music.start());

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, -120, 80);

    this.scoreText = this.add.text(22, 18, 'Score 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#f8f4df',
      stroke: '#12202c',
      strokeThickness: 5
    }).setScrollFactor(0);

    this.coinsText = this.add.text(22, 52, `Coins 0/${this.totalCoins}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      color: '#f8f4df',
      stroke: '#12202c',
      strokeThickness: 4
    }).setScrollFactor(0);

    this.timeText = this.add.text(22, 80, 'Time 0.0s', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      color: '#f8f4df',
      stroke: '#12202c',
      strokeThickness: 4
    }).setScrollFactor(0);

    this.messageText = this.add.text(WIDTH / 2, 92, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      align: 'center',
      stroke: '#12202c',
      strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0);

    this.add.text(WIDTH - 24, 20, 'Arrow keys / WASD to move and jump', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      color: '#e4f0f2',
      stroke: '#12202c',
      strokeThickness: 3
    }).setOrigin(1, 0).setScrollFactor(0);

    this.updateScoreHud();
  }

  update(_time: number, delta: number) {
    if (this.finished) {
      if (Phaser.Input.Keyboard.JustDown(this.wasd.SPACE)) {
        this.scene.restart();
      }
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
    const runAcceleration = BASE_RUN_ACCELERATION * (1 + this.momentum * 0.35);

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
    if (jumpPressed && body.blocked.down) {
      this.player.setVelocityY(BASE_JUMP_VELOCITY);
      this.jumpHoldMs = 0;
      this.jumpExtending = true;
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

    graphics.fillStyle(0xc8d9df, 1);
    graphics.fillRoundedRect(0, 0, 58, 30, 5);
    graphics.fillStyle(0x243243, 1);
    graphics.fillRect(8, 8, 42, 8);
    graphics.lineStyle(3, 0x6f8996, 1);
    graphics.lineBetween(8, 22, 50, 22);
    graphics.generateTexture('vent', 58, 30);
    graphics.clear();

    graphics.fillStyle(0xf5c15f, 1);
    graphics.fillRoundedRect(0, 0, 46, 46, 5);
    graphics.lineStyle(3, 0x7a5125, 1);
    graphics.strokeRect(3, 3, 40, 40);
    graphics.lineBetween(5, 5, 41, 41);
    graphics.lineBetween(41, 5, 5, 41);
    graphics.generateTexture('crate', 46, 46);
    graphics.clear();

    graphics.fillStyle(0x8fd3e8, 1);
    graphics.fillRoundedRect(0, 0, 58, 78, 6);
    graphics.fillStyle(0x223044, 1);
    graphics.fillRect(10, 12, 38, 10);
    graphics.fillRect(10, 32, 38, 10);
    graphics.fillRect(10, 52, 38, 10);
    graphics.lineStyle(3, 0xd7eef5, 1);
    graphics.strokeRoundedRect(2, 2, 54, 74, 5);
    graphics.generateTexture('tower', 58, 78);
    graphics.clear();

    graphics.fillStyle(0x7ed7f0, 1);
    graphics.fillRoundedRect(0, 0, 86, 26, 5);
    graphics.fillStyle(0x223044, 1);
    graphics.fillRect(10, 8, 66, 8);
    graphics.generateTexture('duct', 86, 26);
    graphics.clear();

    graphics.lineStyle(5, 0xc8d9df, 1);
    graphics.lineBetween(26, 64, 26, 0);
    graphics.lineStyle(3, 0x7ed7f0, 1);
    graphics.lineBetween(26, 8, 4, 34);
    graphics.lineBetween(26, 8, 48, 34);
    graphics.fillStyle(0xffd166, 1);
    graphics.fillCircle(26, 8, 7);
    graphics.generateTexture('antenna', 52, 68);
    graphics.clear();

    graphics.fillStyle(0x27384a, 1);
    graphics.fillRect(8, 0, 8, 120);
    graphics.fillStyle(0x4ecdc4, 1);
    graphics.fillTriangle(16, 8, 76, 31, 16, 54);
    graphics.fillStyle(0xf8f4df, 1);
    graphics.fillCircle(12, 4, 8);
    graphics.generateTexture('flag', 84, 124);
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
    graphics.fillStyle(0xc8d9df, 1);
    graphics.fillRoundedRect(backFootX - 5, backFootY - 3, 15, 6, 2);
    graphics.fillRoundedRect(frontFootX - 5, frontFootY - 3, 15, 6, 2);
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
      { graphics: distantSkyline, x: 3200, y: 284, w: 180, h: 216, color: 0x16203a, windowColor: 0x6ec6e7, roof: 'antenna', windows: 'stripes', alpha: 0.46 }
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
      { graphics: midSkyline, x: 3120, y: 264, w: 150, h: 238, color: 0x25365a, windowColor: 0xffd166, roof: 'spire', windows: 'grid' }
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
      { graphics: nearSkyline, x: 3090, y: 370, w: 190, h: 132, color: 0x2b3e5b, windowColor: 0xffd166, roof: 'flat', windows: 'grid' }
    ];
    nearBuildings.forEach(drawBuilding);

    nearSkyline.lineStyle(3, 0x4ecdc4, 0.42);
    nearSkyline.lineBetween(0, 474, WORLD_WIDTH, 474);
    nearSkyline.fillStyle(0x0b1020, 0.9);
    nearSkyline.fillRect(0, 492, WORLD_WIDTH, 16);
  }

  private addFlatGround() {
    const height = STREET_LEVEL - GROUND_Y;
    const ground = this.add.rectangle(WORLD_WIDTH / 2, GROUND_Y + height / 2, WORLD_WIDTH, height, 0x425b6f);
    ground.setStrokeStyle(4, 0xa8c0ca, 0.9);
    ground.setDepth(2);
    this.physics.add.existing(ground, true);
    this.buildings.add(ground);

    const details = this.add.graphics();
    details.setDepth(3);
    details.fillStyle(0xc6d6dc, 1);
    details.fillRect(0, GROUND_Y - 8, WORLD_WIDTH, 10);
    details.fillStyle(0x1b2534, 1);
    details.fillRect(14, GROUND_Y + 12, WORLD_WIDTH - 28, 8);
    details.fillStyle(0x31495c, 1);

    for (let x = 0; x < WORLD_WIDTH; x += 92) {
      details.fillRect(x + 22, GROUND_Y + 48, 44, 16);
      details.fillRect(x + 44, GROUND_Y + 92, 44, 16);
    }
  }

  private addObstacle(x: number, roofY: number, texture: 'vent' | 'crate' | 'duct' | 'antenna' | 'tower') {
    const obstacle = this.physics.add.staticImage(x, roofY, texture);
    obstacle.setOrigin(0.5, 1);
    obstacle.setDepth(4);

    if (texture === 'antenna') {
      obstacle.body?.setSize(34, 58).setOffset(9, 10);
    } else if (texture === 'tower') {
      obstacle.body?.setSize(48, 72).setOffset(5, 6);
    } else if (texture === 'duct') {
      obstacle.body?.setSize(78, 22).setOffset(4, 4);
    } else {
      obstacle.body?.setSize(obstacle.width - 8, obstacle.height - 4).setOffset(4, 4);
    }

    obstacle.refreshBody();
    this.obstacles.add(obstacle);
  }

  private collectCoin(coin: Phaser.GameObjects.GameObject) {
    coin.destroy();
    this.coinsCollected += 1;
    this.updateScoreHud();
    this.tweens.add({
      targets: this.scoreText,
      scale: 1.16,
      yoyo: true,
      duration: 90
    });
  }

  private loseLife() {
    if (this.invulnerable || this.finished) {
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
    if (this.finished) {
      return;
    }

    this.finished = true;
    const elapsedSeconds = this.elapsedSeconds();
    const coinScore = this.coinsCollected * 250;
    const speedScore = this.speedScore(elapsedSeconds);
    const total = coinScore + speedScore;
    const { scores, rank } = this.saveHighScore({
      score: total,
      coins: this.coinsCollected,
      time: elapsedSeconds,
      date: new Date().toISOString()
    });

    this.score = total;
    this.scoreText.setText(`Score ${total}`);
    this.player.setAccelerationX(0);
    this.player.setVelocity(0, 0);
    this.playFinishEffect();
    this.time.delayedCall(500, () => {
      this.showHighScoreScreen(total, coinScore, speedScore, elapsedSeconds, scores, rank);
    });
  }

  private endGame(message: string) {
    this.finished = true;
    this.player.setAccelerationX(0);
    this.player.setVelocity(0, 0);
    this.messageText.setText(message);
  }

  private playFinishEffect() {
    this.cameras.main.flash(420, 255, 241, 180);
    this.cameras.main.shake(240, 0.004);

    this.tweens.add({
      targets: this.goal,
      scale: 1.14,
      yoyo: true,
      repeat: 3,
      duration: 120,
      ease: 'Sine.easeInOut'
    });

    this.tweens.add({
      targets: this.player,
      y: this.player.y - 22,
      yoyo: true,
      duration: 180,
      ease: 'Sine.easeOut'
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

  private showHighScoreScreen(
    total: number,
    coinScore: number,
    speedScore: number,
    elapsedSeconds: number,
    scores: HighScoreEntry[],
    rank: number
  ) {
    this.messageText.setText('');
    this.highScorePanel?.destroy(true);

    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setScrollFactor(0).setDepth(1000);
    const backdrop = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x050914, 0.58);
    const card = this.add.rectangle(0, 0, 560, 390, 0x132033, 0.96);
    const cardStroke = this.add.rectangle(0, 0, 560, 390).setStrokeStyle(3, 0x9ee7ff, 0.9);
    const title = this.add.text(0, -158, rank === 1 ? 'NEW HIGH SCORE' : 'FINISH', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '34px',
      color: '#ffd166',
      stroke: '#050914',
      strokeThickness: 6
    }).setOrigin(0.5);

    const breakdown = this.add.text(0, -112, `Score ${total}   Coins ${coinScore}   Speed ${speedScore}   Time ${elapsedSeconds.toFixed(1)}s`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#f8f4df',
      stroke: '#050914',
      strokeThickness: 4
    }).setOrigin(0.5);

    const heading = this.add.text(-224, -62, 'HIGH SCORES', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      color: '#9ee7ff',
      stroke: '#050914',
      strokeThickness: 4
    }).setOrigin(0, 0.5);

    panel.add([backdrop, card, cardStroke, title, breakdown, heading]);

    const rows = scores.length > 0 ? scores : [{ score: total, coins: this.coinsCollected, time: elapsedSeconds, date: new Date().toISOString() }];
    rows.slice(0, 5).forEach((entry, index) => {
      const isCurrent = index + 1 === rank;
      const y = -24 + index * 42;
      const rowBack = this.add.rectangle(0, y, 472, 32, isCurrent ? 0x29445a : 0x1b2a42, isCurrent ? 0.95 : 0.65);
      const row = this.add.text(-224, y, `${index + 1}.  ${entry.score} pts    ${entry.coins}/${this.totalCoins} coins    ${entry.time.toFixed(1)}s`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        color: isCurrent ? '#ffd166' : '#f8f4df'
      }).setOrigin(0, 0.5);
      panel.add([rowBack, row]);
    });

    const prompt = this.add.text(0, 158, 'Press Space to run again', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      color: '#4ecdc4',
      stroke: '#050914',
      strokeThickness: 4
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

  private updateScoreHud() {
    const elapsedSeconds = this.elapsedSeconds();
    this.score = this.coinsCollected * 250 + this.speedScore(elapsedSeconds);
    this.scoreText.setText(`Score ${this.score}`);
    this.coinsText.setText(`Coins ${this.coinsCollected}/${this.totalCoins}`);
    this.timeText.setText(`Time ${elapsedSeconds.toFixed(1)}s`);
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
      return;
    }

    this.momentum = Math.min(1, this.momentum + MOMENTUM_BUILD_PER_SECOND * (delta / 1000));
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
