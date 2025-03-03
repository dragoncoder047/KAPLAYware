import { Asset, AudioPlay, AudioPlayOpt, Color, GameObj, KAPLAYCtx, KAPLAYOpt, KEventController, Key, SpriteCompOpt, SpriteData } from "kaplay";
import k from "./engine";
import { addBomb, addPrompt } from "./objects";
import { overload2 } from "./overload";
import cursor from "./plugins/cursor";
import { loseTransition, prepTransition, speedupTransition, winTransition } from "./transitions";
import { Button, KaplayWareCtx, KAPLAYwareOpts, LoadCtx, Minigame, MinigameAPI, MinigameCtx } from "./types";

export const friends = [
	"bobo",
	"bag",
	"ghosty",
	"goldfly",
	"marroc",
	"tga",
	"gigagantrum",
];

export const loadAPIs = [
	"loadRoot",
	"loadSprite",
	"loadSpriteAtlas",
	"loadAseprite",
	"loadPedit",
	"loadBean",
	"loadJSON",
	"loadSound",
	"loadFont",
	"loadBitmapFont",
	"loadShader",
	"loadShaderURL",
	"load",
	"loadProgress",
] as const;

export const gameAPIs = [
	"make",
	"pos",
	"scale",
	"rotate",
	"color",
	"opacity",
	"sprite",
	// "sprite",
	"text",
	"rect",
	"circle",
	"uvquad",
	"area",
	"anchor",
	"z",
	"outline",
	"body",
	"doubleJump",
	"move",
	"offscreen",
	"follow",
	"shader",
	"timer",
	"fixed",
	"stay",
	"health",
	"lifespan",
	"state",
	"fadeIn",
	"play",
	"rand",
	"randi",
	"dt",
	"time",
	"vec2",
	"rgb",
	"hsl2rgb",
	"choose",
	"chance",
	"easings",
	"map",
	"mapc",
	"wave",
	"lerp",
	"deg2rad",
	"rad2deg",
	"clamp",
	"width",
	"height",
	"mousePos",
	"mouseDeltaPos",
	"camPos",
	"camScale",
	"camRot",
	"center",
	"isFocused",
	"isTouchscreen",
	"drawSprite",
	"drawText",
	"formatText",
	"drawRect",
	"drawLine",
	"drawLines",
	"drawTriangle",
	"drawCircle",
	"drawEllipse",
	"drawUVQuad",
	"drawPolygon",
	"drawFormattedText",
	"drawMasked",
	"drawSubtracted",
	"pushTransform",
	"popTransform",
	"pushTranslate",
	"pushScale",
	"pushRotate",
	"pushMatrix",
	"LEFT",
	"RIGHT",
	"UP",
	"DOWN",
	"addKaboom",
	"debug",
	"Line",
	"Rect",
	"Circle",
	"Polygon",
	"Vec2",
	"Color",
	"Mat4",
	"Quad",
	"RNG",
	"burp",
	"onClick",
	"loop",
	"wait",
	"tween",
	"addLevel",
	// colors
	"BLACK",
	"RED",
	"GREEN",
	"BLUE",
	"YELLOW",
	"WHITE",
	"setGravity",
	"shake",
	"drag",
] as const;

const DEFAULT_DURATION = 4;
const FORCE_SPEED_ON_GAME = false;

export default function kaplayware(games: Minigame[] = [], opts: KAPLAYwareOpts = {}): KaplayWareCtx {
	const coolPrompt = (prompt: string) => prompt.toUpperCase() + (prompt[prompt.length - 1] == "!" ? "" : "!");
	const getGameID = (g: Minigame) => `${g.author}:${g.prompt}`;
	const getByID = (id: string) => games.find((minigame) => `${minigame.author}:${minigame.prompt}` == id);
	let wonLastGame: boolean = null;
	let minigameHistory: string[] = []; // this is so you can't get X minigame, Y minigame, then X minigame again

	/** Game object that runs everything in the gamescene */
	const GameScene = k.add([]);

	/** The container for minigames, if you want to pause the minigame you should pause this */
	const gameBox = GameScene.add([k.fixed(), k.pos()]);

	GameScene.onUpdate(() => {
		gameBox.paused = !wareCtx.gameRunning;
		cursor.canPoint = wareCtx.gameRunning;
	});

	const wareCtx: KaplayWareCtx = {
		inputEnabled: false,
		gameRunning: false,
		time: 0,
		score: 1,
		lives: 4,
		speed: 1,
		difficulty: 1,
		gameIdx: 0,
		timesSpeed: 0,
		gamesPlayed: 0,

		runGame(g) {
			// SETUP
			if (g.prompt.length > 12) throw new Error("Prompt cannot exceed 12 characters!");

			const onTimeoutEvent = new k.KEvent();
			const timerEvents: KEventController[] = [];
			const inputEvents: KEventController[] = [];
			const queuedSounds: AudioPlay[] = [];
			const audioPlays: AudioPlay[] = [];

			let bomb: ReturnType<typeof addBomb> = null;
			let addedBomb = false;
			let clockRunning = true;
			let canPlaySounds = false;

			const minigameUpdate = GameScene.onUpdate(() => {
				timerEvents.forEach((ev) => ev.paused = !wareCtx.gameRunning);
				inputEvents.forEach((ev) => ev.paused = !wareCtx.gameRunning);
			});

			const gameCtx = {};
			for (const api of gameAPIs) {
				gameCtx[api] = k[api];

				if (api == "sprite") {
					gameCtx[api] = (spr: string | SpriteData | Asset<SpriteData>, opts?: SpriteCompOpt) => {
						const spriteComp = k.sprite(`${getGameID(g)}-${spr}`, opts);
						return {
							...spriteComp,
							set sprite(val: string) {
								spriteComp.sprite = `${getGameID(g)}-${val}`;
							},

							get sprite() {
								return spr.toString();
							},
						};
					};
				}
				else if (api == "onClick") {
					gameCtx[api] = overload2((action: () => void) => {
						const func = () => wareCtx.inputEnabled ? action() : false;
						const ev = k.onMousePress("left", func);
						inputEvents.push(ev);
					}, (tag: string, action: (a: GameObj) => void) => {
						const ev = k.onClick(tag, () => wareCtx.inputEnabled ? action : false);
						inputEvents.push(ev);
						return ev;
					});
				}
				else if (api == "area") {
					// override area onClick too!!
					gameCtx[api] = (...args: any[]) => {
						const areaComp = k.area(...args);
						return {
							...areaComp,
							onClick(action: () => void) {
								const ev = k.onMousePress("left", () => {
									if (wareCtx.inputEnabled && this.isHovering()) action();
								});
								inputEvents.push(ev);
								return ev;
							},
						};
					};
				}
				else if (api == "wait") {
					gameCtx[api] = (...args: any[]) => {
						const ev = k.wait(args[0], args[1]);
						timerEvents.push(ev);
						return ev;
					};
				}
				else if (api == "loop") {
					gameCtx[api] = (...args: any[]) => {
						const ev = k.loop(args[0], args[1]);
						timerEvents.push(ev);
						return ev;
					};
				}
				else if (api == "tween") {
					gameCtx[api] = (...args: any[]) => {
						// @ts-ignore
						const ev = k.tween(...args);
						timerEvents.push(ev);
						return ev;
					};
				}
				else if (api == "addLevel") {
					gameCtx[api] = (...args: any[]) => {
						// @ts-ignore
						const level = k.addLevel(...args);
						level.onUpdate(() => level.paused = !wareCtx.gameRunning);
						return level;
					};
				}
				else if (api == "play") {
					gameCtx[api] = (soundName: any, opts: AudioPlayOpt) => {
						const sound = k.play(`${getGameID(g)}-${soundName}`, opts);
						const newSound = {
							...sound,
							set paused(param: boolean) {
								// this means that it was queued to play but the user paused it
								if (!canPlaySounds && queuedSounds.includes(sound) && param == true) {
									queuedSounds.splice(queuedSounds.indexOf(sound), 1);
									sound.paused = true;
								}

								// this means the user removed it from queue but wants to add it again probably
								if (!canPlaySounds && !queuedSounds.includes(sound) && param == false) {
									queuedSounds.push(sound);
									sound.paused = true;
								}

								if (canPlaySounds) sound.paused = param;
							},
							get paused() {
								return sound.paused;
							},
						};

						if (!canPlaySounds) {
							if (opts && opts.paused) return;
							queuedSounds.push(sound);
							sound.paused = true;
						}

						audioPlays.push(newSound);
						return newSound;
					};
				}
			}

			// OBJECT STUFF
			gameBox.removeAll();

			function dirToKeys(button: Button): Key[] {
				if (button == "left") return ["left", "a"];
				else if (button == "down") return ["down", "s"];
				else if (button == "up") return ["up", "w"];
				else if (button == "right") return ["right", "d"];
				else if (button == "action") return ["space"];
			}

			const gameAPI: MinigameAPI = {
				onButtonPress: (btn, action) => {
					const func = () => wareCtx.inputEnabled ? action() : false;
					let ev: KEventController = null;
					if (btn == "click") ev = gameBox.onMousePress("left", func);
					else ev = gameBox.onKeyPress(dirToKeys(btn), func);
					inputEvents.push(ev);
					return ev;
				},
				onButtonRelease: (btn, action) => {
					const func = () => wareCtx.inputEnabled ? action() : false;
					let ev: KEventController = null;
					if (btn == "click") ev = gameBox.onMouseRelease("left", func);
					else ev = gameBox.onKeyRelease(dirToKeys(btn), func);
					inputEvents.push(ev);
					return ev;
				},
				onButtonDown: (btn, action) => {
					const func = () => wareCtx.inputEnabled ? action() : false;
					let ev: KEventController = null;
					if (btn == "click") ev = gameBox.onMouseDown("left", func);
					else ev = gameBox.onKeyDown(dirToKeys(btn), func);
					inputEvents.push(ev);
					return ev;
				},
				onTimeout: (action) => onTimeoutEvent.add(action),
				win() {
					wareCtx.score++;
					clockRunning = false;
					wonLastGame = true;
					if (bomb) bomb.turnOff();
				},
				lose: () => {
					wareCtx.lives--;
					clockRunning = false;
					wonLastGame = false;
				},
				finish: () => {
					inputEvents.forEach((ev) => ev.cancel());
					timerEvents.forEach((ev) => ev.cancel());
					audioPlays.forEach((sound) => sound.stop());
					wareCtx.nextGame();

					if (bomb) bomb.destroy();
				},
				cursor: {
					set color(param: Color) {
						cursor.color = param;
					},
				},
				difficulty: wareCtx.difficulty,
				lives: wareCtx.lives,
				speed: wareCtx.speed,
			};

			wareCtx.time = g.duration / wareCtx.speed;
			const minigameScene = gameBox.add(g.start({
				...gameCtx,
				...gameAPI,
			} as unknown as MinigameCtx));

			gameBox.onUpdate(() => {
				if (clockRunning) {
					if (!canPlaySounds) {
						canPlaySounds = true;
						queuedSounds.forEach((sound) => sound.paused = false);
					}

					wareCtx.time -= k.dt();
					if (wareCtx.time <= 0 && clockRunning) {
						clockRunning = false;
						onTimeoutEvent.trigger();
						wareCtx.inputEnabled = false;
					}

					if (wareCtx.time <= g.duration / 2 && !addedBomb) {
						addedBomb = true;
						bomb = addBomb(k, wareCtx);
					}
				}
			});

			return minigameScene;
		},
		curGame() {
			return games[wareCtx.gameIdx];
		},
		nextGame() {
			wareCtx.gamesPlayed++;
			if (wareCtx.gamesPlayed < 10) wareCtx.difficulty = 1;
			else if (wareCtx.gamesPlayed >= 10) wareCtx.difficulty = 2;
			else if (wareCtx.gamesPlayed >= 20) wareCtx.difficulty = 3;
			wareCtx.gameRunning = false;

			function prep() {
				if (opts.onlyMouse) games = games.filter((game) => game.mouse);
				const nextGame = k.choose(games.filter((game) => {
					if (games.length == 1) return game;
					else {
						return game != wareCtx.curGame();
						// const previousMinigame = getByID(minigameHistory[wareCtx.gamesPlayed - 1]);
						// if (previousMinigame) return game != wareCtx.curGame() && game != previousMinigame;
						// else return game != wareCtx.curGame();
					}
				}));
				wareCtx.gameIdx = games.indexOf(nextGame);
				wareCtx.runGame(nextGame);
				minigameHistory[wareCtx.gamesPlayed - 1] = getGameID(nextGame);

				if (nextGame.mouse) cursor.visible = true;
				else cursor.visible = false;

				let prompt: ReturnType<typeof addPrompt> = null;

				const prepTrans = prepTransition(k, wareCtx);
				prepTrans.onHalf(() => {
					prompt = addPrompt(k, coolPrompt(nextGame.prompt));

					if (nextGame.mouse && nextGame.mouse.hidden) cursor.visible = false;
					else if (nextGame.mouse && !nextGame.mouse.hidden) cursor.visible = true;
				});

				prepTrans.onEnd(() => {
					k.wait(0.15 / wareCtx.speed, () => {
						prompt.fadeOut(0.15 / wareCtx.speed).onEnd(() => prompt.destroy());
					});
					wareCtx.inputEnabled = true;
					wareCtx.gameRunning = true;
				});
			}

			if (wonLastGame != null) {
				let transition: ReturnType<typeof prepTransition> = null;
				if (wonLastGame) transition = winTransition(k, wareCtx);
				else transition = loseTransition(k, wareCtx);
				wonLastGame = null;

				if (wareCtx.curGame().mouse) cursor.visible = true;

				transition.onEnd(() => {
					if (!wonLastGame && wareCtx.lives == 0) {
						k.go("gameover");
						return;
					}

					const timeToSpeedUP = FORCE_SPEED_ON_GAME || wareCtx.gamesPlayed % 5 == 0;
					if (timeToSpeedUP) {
						wareCtx.timesSpeed++;
						speedupTransition(k, wareCtx).onEnd(() => {
							k.tween(k.getCamPos(), k.center(), 0.5 / wareCtx.speed, (p) => k.setCamPos(p), k.easings.easeOutQuint);
							prep();
						});
						wareCtx.speedUp();
					}
					else prep();
				});
			}
			else prep();
		},
		speedUp() {
			this.speed += this.speed * 0.07;
		},
	};

	// # LOADING
	const loadCtx = {};
	// TODO: report error msg when calling forbidden functions
	for (const api of loadAPIs) {
		loadCtx[api] = k[api];
	}

	for (const game of games) {
		game.urlPrefix = game.urlPrefix ?? "";
		game.duration = game.duration ?? DEFAULT_DURATION;
		game.rgb = game.rgb ?? [0, 0, 0];
		if ("r" in game.rgb) game.rgb = [game.rgb.r, game.rgb.g, game.rgb.b];

		if (game.load) {
			// patch loadXXX() functions to scoped asset names
			const loaders = [
				"loadSprite",
				"loadSpriteAtlas",
				"loadAseprite",
				"loadPedit",
				"loadJSON",
				"loadSound",
				"loadFont",
				"loadBitmapFont",
				"loadShader",
				"loadShaderURL",
			];

			for (const loader of loaders) {
				loadCtx[loader] = (name: string, ...args: any) => {
					if (typeof name === "string") {
						name = `${getGameID(game)}-${name}`;
					}
					return k[loader](name, ...args);
				};
			}

			// patch loadRoot() to consider g.urlPrefix
			if (game.urlPrefix != undefined) {
				loadCtx["loadRoot"] = (p: string) => {
					if (p) k.loadRoot(game.urlPrefix + p);
					return k.loadRoot().slice(game.urlPrefix.length);
				};
				k.loadRoot(game.urlPrefix);
			}
			else {
				k.loadRoot("");
			}

			game.load(loadCtx as LoadCtx);
			loadCtx["loadRoot"] = k.loadRoot;
		}
	}

	gameBox.onDraw(() => {
		const BG_S = 0.27;
		const BG_L = 0.52;

		const bgColor = k.rgb(wareCtx.curGame().rgb[0], wareCtx.curGame().rgb[1], wareCtx.curGame().rgb[2]);
		k.drawRect({
			width: k.width(),
			height: k.height(),
			color: bgColor,
		});
	});

	return wareCtx;
}
