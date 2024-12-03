import { Howl } from 'howler';
import { ChiptuneJsPlayer } from 'chiptune3';

enum Command {
    PlayMusic = 1,
    ClearMusic = 2,
    LoadSFX = 3,
    SetVolume = 4,
    SetEAX = 5,
    StopSFX = 6,
    Set3D = 7,
    SetChannel = 8,
    Pan = 9,
    Fade = 10,
    FeedBackMOD = 11,
    FeedBackMP3 = 12,
    SetPosition = 13,
    Pause = 14,
    Resume = 15,
    Exit = 55,
    PlaySFX = 56
}

export type DS4QBDriver = {
    read: (path: string) => Uint8Array,
    write: (path: string, content: Uint8Array) => void,
    poll: () => number,
    clear: () => void
}

type MusicChannel = {
    type: 'mp3',
    handle: Howl
} | {
    type: 'mod',
    handle: typeof ChiptuneJsPlayer
};

export class DS4QB {
    #driver: DS4QBDriver;
    #ds4qbDatPath: string;
    #workingDir: string;
    #interval: any;
    #soundHandles: Howl[];
    #musicChannels: Record<string, MusicChannel>;

    constructor(driver: DS4QBDriver, ds4qbDatPath: string = '', workingDir: string = '') {
        this.#driver = driver;
        this.#ds4qbDatPath = ds4qbDatPath;
        this.#workingDir = workingDir;
        this.#interval = undefined;
        this.#soundHandles = [];
        this.#musicChannels = {};
    }

    #readDatBinary(): Uint8Array {
        return this.#driver.read(`${this.#ds4qbDatPath}/DS4QB2.DAT`);
    }

    #readDat(): string[] {
        const bytes = this.#readDatBinary();
        return new TextDecoder().decode(bytes).trim().split(/\s+/);
    }

    #writeDatBinary(values: number[]) {
        const content = new Uint8Array(values.length * 4);
        const view = new DataView(content.buffer);
        for (let i = 0; i < values.length; ++i) {
            view.setUint32(i * 4, values[i])
        }
        this.#driver.write(`${this.#ds4qbDatPath}/DS4QB2.DAT`, content);
    }

    start() {
        this.#interval = setInterval(() => {
            const command = this.#driver.poll();
            if (command !== 0) {
                this.#invoke(command);
                this.#driver.clear();
            }
        }, 50);
    }

    stop() {
        clearInterval(this.#interval);
    }

    #invoke(command: number) {
        switch(command) {
            case Command.PlayMusic: {
                const [musicFile, musicType, musicChannel, mRepeat, m3d] = this.#readDat();
                console.log('PlayMusic', { musicFile, musicType, musicChannel, mRepeat, m3d });

                if (this.#musicChannels[musicChannel])
                    this.#musicChannels[musicChannel].handle.stop();
                
                const musicContent = this.#driver.read(`${this.#workingDir}/${musicFile}`);
                if (musicFile.toUpperCase().endsWith('MP3')) {
                    // MP3 - use howler.js to play
                    const musicBlob = new Blob([musicContent], { type: 'audio/mp3' });
                    const musicUrl = URL.createObjectURL(musicBlob);
                    this.#musicChannels[musicChannel] = {
                        type: 'mp3',
                        handle: new Howl({
                            src: musicUrl,
                            format: ['mp3'],
                            loop: !!Number(mRepeat)
                        })
                    };
                    this.#musicChannels[musicChannel].handle.play();
                } else {
                    // MOD/IT/S3M/XM - use chiptune2.js to play
                    this.#musicChannels[musicChannel] = {
                        type: 'mod',
                        handle: new ChiptuneJsPlayer({ repeatCount: !!mRepeat ? -1 : 0 })
                    }
                    this.#musicChannels[musicChannel].handle.onInitialized(() => {
                        this.#musicChannels[musicChannel].handle.play(musicContent.buffer);
                    });
                }
                
                break;
            }

            case Command.ClearMusic: {
                const [musicChannel] = this.#readDat();
                console.log('ClearMusic', { musicChannel });
                if (musicChannel in this.#musicChannels) {
                    const channel = this.#musicChannels[musicChannel];
                    channel.handle.stop(); // Same for both libraries
                }
                break;
            }

            case Command.LoadSFX: {
                const files = this.#readDat();
                console.log('LoadSFX', files);

                for (const file of files) {
                    let path;
                    if (file.startsWith('"'))
                        path = file.substring(1, file.length - 1);
                    else if (file.startsWith('C:\\'))
                        path = file.substring(3)
                    else
                        path = `${this.#workingDir}/${file}`;
                    const contents = this.#driver.read(path);
                    const blob = new Blob([contents], { type: 'audio/wav' });
                    URL.createObjectURL(blob);
                    this.#soundHandles.push(new Howl({
                        src: [URL.createObjectURL(blob)],
                        format: ['wav']
                    }));
                }

                break;
            }

            case Command.SetVolume: {
                const [musicVol, sampleVol, streamVol] = this.#readDat();
                console.log('SetVolume', { musicVol, sampleVol, streamVol });

                for (const handle of this.#soundHandles) {
                    handle.volume(Number(sampleVol) / 100);
                }
                for (const channel of Object.values(this.#musicChannels)) {
                    if (channel.type === 'mp3')
                        channel.handle.volume(Number(streamVol) / 100);
                    else if (channel.type === 'mod')
                        channel.handle.setVol(Number(musicVol) / 100);
                }
                break;
            }

            case Command.SetEAX: {
                const [eaxCode] = this.#readDat();
                console.log('SetEAX', { eaxCode });
                break;
            }

            case Command.StopSFX: {
                const [sfxChannel] = this.#readDat();
                console.log('StopSFX', { sfxChannel });
                this.#soundHandles[Number(sfxChannel)].stop();
                break;
            }

            case Command.Set3D: {
                const [musicChannel, posX, posY, posZ, velX, velY, velZ] = this.#readDat();
                console.log('Set3D', { musicChannel, posX, posY, posZ, velX, velY, velZ });
                break;
            }

            case Command.SetChannel: {
                const [musicChannel, freq, volume, pan] = this.#readDat();
                console.log('SetChannel', { musicChannel, freq, volume, pan });
                break;
            }

            case Command.Pan: {
                const [musicChannel, panPos, panEnd, panSpeed] = this.#readDat();
                console.log('Pan', { musicChannel, panPos, panEnd, panSpeed });
                break;
            }

            case Command.Fade: {
                const [musicChannel, fadePos, fadeEnd, fadeSpeed] = this.#readDat();
                console.log('Fade', { musicChannel, fadePos, fadeEnd, fadeSpeed });

                const channel = this.#musicChannels[musicChannel];
                if (channel.type === 'mp3') {
                    const fadeFrom = Number(fadePos);
                    const fadeTo = Number(fadeEnd);
                    const fadeDuration = Math.abs((fadeTo - fadeFrom) / Number(fadeSpeed));
                    channel.handle.fade(fadeFrom, fadeTo, fadeDuration);
                }
                break;
            }

            case Command.SetPosition: {
                const bytes = this.#readDatBinary()
                const view = new DataView(bytes.buffer);
                const musicChannel = view.getUint32(0, true);
                const cSetPos1 = view.getUint32(4, true);
                const cSetPos2 = view.getUint32(8, true);
                console.log('SetPosition', { musicChannel, cSetPos1, cSetPos2 });
                break;
            }

            case Command.FeedBackMOD: {
                const [musicChannel] = this.#readDat();
                console.log('FeedbackMOD', { musicChannel });
                this.#writeDatBinary([0, 0]);
                break;
            }

            case Command.FeedBackMP3: {
                const [musicChannel] = this.#readDat();
                console.log('FeedbackMP3', { musicChannel });
                this.#writeDatBinary([0, 0]);
                break;
            }

            case Command.Exit: {
                console.log('Exit', {});
                for (const effect of this.#soundHandles)
                    effect.stop();
                for (const music of Object.values(this.#musicChannels)) 
                    music.handle.stop();
                break;
            }

            default:
                if (command >= Command.PlaySFX) {
                    const sfxHandle = command - Command.PlaySFX;
                    console.log('PlaySFX', { sfxHandle });
                    this.#soundHandles?.[sfxHandle]?.play();
                }
        }
    }
}

