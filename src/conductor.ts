import { AudioPlay, GameObj, KAPLAYCtx, KEvent } from "kaplay";

/** Small conductor class for managing beat hit behaviour
 * @param k The kaplay context OR game object
 * @param sound The sound to use
 * @param bpm The bpm to use
 *
 * @example
 * ```ts
 * const conductor = new Conductor(game, k.play("music"), 140)
 * conductor.onBeat(() => {
 * 	// bops the bean
 * 	k.tween(k.vec2(1.25), k.vec2(1), 0.15, (p) => bean.scale = p)
 * })
 * ```
 */
export class Conductor {
	private obj: GameObj;
	private beatHitEv: KEvent;
	onBeat(action: (beat: number) => void) {
		return this.beatHitEv.add(action);
	}

	destroy() {
		if (!this.obj.exists()) return;
		this.obj.destroy();
		this.beatHitEv.clear();
	}

	constructor(k: KAPLAYCtx | GameObj, sound: AudioPlay, bpm: number) {
		this.beatHitEv = new k.KEvent();
		this.obj = k.add([]);
		let currentBeat = 0;
		this.obj.onUpdate(() => {
			const beatTime = sound.time() / (60 / bpm);
			const oldBeat = Math.floor(currentBeat);
			currentBeat = Math.floor(beatTime);
			if (currentBeat != oldBeat) {
				this.beatHitEv.trigger();
			}
		});

		sound.onEnd(() => this.destroy());
	}
}
