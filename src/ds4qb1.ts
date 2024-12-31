import { Howl } from 'howler';
import { ChiptuneJsPlayer } from 'chiptune3';
import type { DS4QB1Driver, DS4QBProtocol } from './ds4qb';

export type ReadClipboard = () => { bytes: Uint8Array, format: number } | null;
export type EmptyClipboard = () => void;

export class DS4QB implements DS4QBProtocol {
    #driver: DS4QB1Driver;
    #logger: any;
    #interval: any;
    #music: typeof ChiptuneJsPlayer;
    #samples: (Howl | null)[];
    #stream: Howl | null;

    constructor(driver: DS4QB1Driver, logger: any) {
        this.#driver = driver;
        this.#logger = logger;
        this.#interval = null;
        this.#music = null;
        this.#samples = [];
        this.#stream = null;
    }

    start() {
        this.#interval = setInterval(() => {
            const clipData = this.#driver.poll();
            if (!clipData)
                return;

            const rawText = new TextDecoder().decode(clipData);
            const nullIndex = rawText.indexOf('\0');
            const text = nullIndex !== -1 
                ? rawText.substring(0, nullIndex) 
                : rawText;

            if (text.startsWith('DS4QB')) {
                this.#invoke(text.substring(5));
                this.#driver.clear();
            }
        }, 50);
    }

    stop() {
        clearInterval(this.#interval);
    }

    #invoke(command: string): void {
        if (command.startsWith('LOADMOD')) {
            // Load a module and start playing
            const [path, repeat] = command.substring(7).split('|');
            const musicData = this.#driver.read(path);
            if (musicData) {
                this.#music = new ChiptuneJsPlayer({ repeatCount: repeat === '1' ? -1 : 0 });
                this.#music.onInitialized(() => this.#music.play(musicData.buffer));
                this.#logger.log('LoadMod', { path, repeat });
            } else {
                this.#logger.error('LoadMod: unable to load file', { path, repeat });
            }
        } else if (command.startsWith('LOADSAMPLES')) {
            // Load a set of sound files into an array
            const path = command.substring(11).split('|')[0];
            const list = this.#driver.read(path);
            if (!list) {
                this.#logger.error('LoadSamples: unable to load sample list', { path });
                return;
            }

            const sampleFiles = new TextDecoder()
                .decode(list)
                .split('\r\n')
                .filter(i => i.length > 0);

            for (const path of sampleFiles) {
                const content = this.#driver.read(path); 
                if (content === null) {
                    this.#logger.error('LoadSamples: file not found', { path })
                    this.#samples.push(null);
                } else {
                    const blob = new Blob([content], { type: 'audio/wav' });
                    this.#samples.push(new Howl({
                        src: [URL.createObjectURL(blob)],
                        format: ['wav']
                    }));
                }
            }
            this.#logger.log('LoadSamples', { path, sampleFiles });
        } else if (command.startsWith('LOADSTREAM')) {
            // Load a stream (e.g. mp3) and start playing
            const [path, repeat] = command.substring(10).split('|');
            const content = this.#driver.read(path);
            if (content === null) {
                this.#logger.error('LoadStream: Error loading file', { path, repeat });
            } else {
                const blob = new Blob([content], { type: 'audio/mp3' })
                this.#stream = new Howl({
                    src: [URL.createObjectURL(blob)],
                    format: ['mp3']
                });
                this.#stream.loop(repeat === '1');
                this.#stream.on('load', () => this.#stream?.play());
            }
            this.#logger.log('LoadStream', { path, repeat });
        } else if (command.startsWith('PLAYCD')) {
            // Play a CD track
            const track = Number(command.substring(6).split('|')[0]);
            console.error('PlayCD: Not implemented', { track });
        } else if (command.startsWith('PLAYSAMPLE')) {
            // Play an audio sample
            const sampleId = Number(command.substring(10).split('|')[0]);
            try {
                (this.#samples[sampleId - 1] as Howl).play();
                this.#logger.log('PlaySample', { sampleId })
            } catch(e) {
                this.#logger.error('PlaySample: unable to play', { sampleId });
            }
        } else if (command.startsWith('REMOVEMODULE|')) {
            // Unload the current module
            if (this.#music === null)
                return;
            this.#music.stop();
            this.#logger.log('RemoveModule');
        } else if (command.startsWith('REMOVESAMPLES|')) {
            // Unload all samples
            for (const sample of this.#samples) {
                sample?.stop();
                sample?.unload();
            }
            this.#samples = [];
            this.#logger.log('RemoveSamples');
        } else if (command.startsWith('REMOVESTREAM|')) {
            // Unload the current stream
            if (this.#stream) {
                this.#stream.stop();
                this.#stream.unload();
                this.#stream = null;
                this.#logger.log('RemoveStream');
            } else {
                this.#logger.error('RemoveStream: no active stream');
            }
        }
    }
}
