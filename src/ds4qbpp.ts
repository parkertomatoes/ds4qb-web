import { Howl, Howler } from 'howler';
import { ChiptuneJsPlayer } from 'chiptune3';
import type { DS4QBDriver, DS4QBProtocol } from './ds4qb';

const CURRENT = 0xFFFF;
const CURRENT_FREQ = 0xFFFFFF;
const CURRENT_PAN = -1;
const DEFAULT = 0xFFFE;
const DEFAULT_FREQ = 0xFFFFFE;
const DEFAULT_PAN = -2;
const MUS_LOOPING = 4;

enum Command {
    Initialize = 0,
    Close = 1,
    Reset = 2,
    LoadSnd = 3,
    PlaySnd = 4,
    SetSndAttr = 5,
    GetSndAttr = 6,
    LoadMusic = 7,
    PlayMusic = 8,
    SetMusicAttr = 9,
    GetMusicAttr = 10,
    StopSnd = 11,
    PauseMusic = 12,
    ResumeMusic = 13,
    StopMusic = 14,
    DeleteSnd = 15,
    DeleteMusic = 16,
    SetVolume = 17,
    SetGlobalVols = 18,
    Play2DSounds = 19,
    Play3DSounds = 20,
    GetMusicLength = 21,
    SetMusicPos = 22,
    GetMusicPos = 23,
    Set3DPos = 24,
    PlaySnd3D = 25,
    Set3DFacts = 26,
    SetEAX = 27,
    PlaySounds = 28,
    PlaySnd2D = 29,
    Set2DPos = 30,
    Set2DDistFactor = 31,
    CDInit = 32,
    CDFree = 33,
    GetTracks = 34,
    GetTrackLength = 35,
    CDPlay = 36,
}

type MusicChannel = {
    type: 'mp3',
    handle: Howl,
    volume: number,
    byteLength: number
} | {
    type: 'mod',
    content: Uint8Array,
    handle: Promise<typeof ChiptuneJsPlayer>,
    volume: number
};

type SoundHandle = {
    handle: Howl,
    frequency: number,
    volume: number,
    pan: number,
    looping: number 
};

export class DS4QBPP implements DS4QBProtocol {
    #driver: DS4QBDriver;
    #interval: any;
    #workingDir: string;
    #soundHandles: Record<string, SoundHandle>;
    #musicChannels: Record<string, MusicChannel>;
    #masterVolume: number;
    #globalVolumes: { sound: number, music: number };
    #earPos: { x: number, y: number, angle: number };
    #distFactor2d: number;

    constructor(driver: DS4QBDriver, workingDir?: string) {
        this.#driver = driver;
        this.#interval = undefined;
        this.#workingDir = workingDir ?? '';
        this.#soundHandles = {};
        this.#musicChannels = {};
        this.#masterVolume = 100;
        this.#globalVolumes = { sound: 100, music: 100 };
        this.#earPos = { x: 0, y: 0, angle: 0 };
        this.#distFactor2d = 1.0;
    }

    start() {
        this.#interval = setInterval(() => {
            const signal = this.#driver.poll();
            if (signal !== 0) {
                try {
                    const command = this.#driver.read(`${this.#workingDir}\\DS4QB.QBW`);
                    this.#invoke(command).then(output => {
                        if (output)
                            this.#driver.write(`${this.#workingDir}\\DS4QB.VCW`, output);
                        this.#driver.clear();
                    });
                } catch {
                    console.error(`DS4QB++: Unable to read '${this.#workingDir}\\DS4QB.QBW'`);
                    this.#driver.clear();
                }
            }
        }, 2);
    }

    stop() {
        clearInterval(this.#interval);
    }

    #decodeFileName(bytes: Uint8Array) {
        // Remove fixed-length string array after null terminator
        const nullPos = bytes.indexOf(0);
        const fileNameAbriged = nullPos === -1
            ? bytes
            : bytes.subarray(0, nullPos);
        const fileName = new TextDecoder().decode(fileNameAbriged).trim();
        if (fileName.startsWith('"'))
            return fileName.substring(1, fileName.length - 1);
        else if (fileName.startsWith('C:\\'))
            return fileName.substring(3)
        else
            return `${this.#workingDir}/${fileName}`;
    }

    #playSound(handle: SoundHandle, freq: number, volume: number, pan: number, looping: number) {
        if (freq === DEFAULT_FREQ)
            handle.frequency = 44050
        else if (freq !== CURRENT_FREQ)
            handle.frequency = freq;
        handle.handle.rate(handle.frequency / 44050);
        
        if (volume === DEFAULT)
            handle.volume = 50;
        else if (volume !== CURRENT)
            handle.volume = volume;
        this.#updateSoundVolume(handle);

        if (handle.pan === DEFAULT_PAN) 
            handle.pan = 0;
        else if (pan !== CURRENT_PAN)
            handle.pan = pan;
        handle.handle.stereo(handle.pan / 100.0);

        if (looping === DEFAULT)
            handle.looping = 0;
        else if (looping !== CURRENT)
            handle.looping = looping;
        handle.handle.loop(handle.looping !== 0);

        handle.handle.play();
    }

    #playSound2D(handle: SoundHandle, freq: number, volume: number, posX: number, posY: number) {
        if (freq === DEFAULT_FREQ)
            handle.frequency = 44050
        else if (freq !== CURRENT_FREQ)
            handle.frequency = freq;
        handle.handle.rate(handle.frequency / 44050);

        if (volume === DEFAULT) 
            handle.volume = 50;
        else if (volume !== CURRENT)
            handle.volume = volume;

        const nearAng = 270 - this.#earPos.angle + 360 * (this.#earPos.angle > 270 ? 1 : 0);
        const nearAngRad = nearAng * Math.PI / 180;
        const _xv = posX - this.#earPos.x;
        const _yv = posY - this.#earPos.y;
        const xv = (_xv * Math.cos(nearAngRad) - _yv * Math.sin(nearAngRad)) / this.#distFactor2d;
        const yv = (_xv * Math.sin(nearAngRad) - _yv * Math.cos(nearAngRad)) / this.#distFactor2d;
        const xs = xv * xv;
        let dist = xs + yv * yv;
        if (dist < 1) dist = 1;
        
        const volume2D = handle.volume / dist;
        this.#updateSoundVolume(handle, volume2D);

        const pan2D = Math.abs(xs) < 1
            ? 0
            : 100 * Math.sign(xv) - (100 / (xs * Math.sign(xv)));
        handle.handle.stereo(pan2D / 100.0);
        
        handle.handle.play();
    }

    #updateSoundVolume(soundHandle: SoundHandle, overrideVolume?: number) {
        const volume = (typeof overrideVolume === 'undefined') 
            ? soundHandle.volume 
            : overrideVolume;
        soundHandle.handle.volume(
            (volume / 100.0)
                * (this.#masterVolume / 100.0) 
                * (this.#globalVolumes.sound / 100.0));
    }

    #updateMusicVolume(musicChannel: MusicChannel) {
        if (musicChannel.type === 'mp3') {
            musicChannel.handle.volume(
                (musicChannel.volume / 100.0)
                    * (this.#masterVolume / 100.0) 
                    * (this.#globalVolumes.sound / 100.0));
        } else {
            musicChannel.handle.then(
                h => h.setVol(
                    (musicChannel.volume / 100) 
                        * (this.#masterVolume / 100.0) 
                        * (this.#globalVolumes.music / 100.0)));
        }
    }

    #invoke(commandBytes: Uint8Array): Promise<Uint8Array | null> {
        const view = new DataView(commandBytes.buffer);
        const command = view.getUint16(0, true);
        switch(command) {
            case Command.Initialize: {
                const quality = view.getUint32(2, true);
                const flags = view.getUint32(6, true);
                console.log('Initialize', { quality, flags });
                break;
            }

            case Command.Close:
                console.log('Close');
                break;

            case Command.Reset:
                console.log('Reset');
                break;

            case Command.LoadSnd: {
                const slot = view.getUint16(2, true);
                const fileName = this.#decodeFileName(commandBytes.subarray(4, 68));
                const flags = view.getUint32(68, true);

                if (slot in this.#soundHandles) {
                    this.#soundHandles[slot].handle.stop();
                    this.#soundHandles[slot].handle.unload();
                }
                
                // Load file into data URL
                try {
                    const contents = this.#driver.read(fileName);
                    const blob = new Blob([contents], { type: 'audio/wav' });
                    URL.createObjectURL(blob);

                    // Create sound handle
                    this.#soundHandles[slot] = {
                        handle: new Howl({
                            src: [URL.createObjectURL(blob)],
                            format: ['wav']
                        }),
                        frequency: 44050,
                        volume: 100,
                        pan: 0,
                        looping: 0
                    };
                } catch {
                    console.error(`LoadSnd: Unable to read file '${fileName}'`)
                }

                console.log('LoadSnd', { slot, fileName, flags });
                break;
            }

            case Command.PlaySnd: {
                const slot = view.getUint16(2, true);
                const freq = view.getUint32(4, true);
                const volume = view.getUint16(8, true);
                const pan = view.getInt16(10, true);
                const looping = view.getUint16(12, true);

                let handle = this.#soundHandles[slot];
                if (!handle) {
                    console.error('PlaySnd: soundHandle not found', { slot, freq, volume, pan, looping });
                    break;
                }
                this.#playSound(handle, freq, volume, pan, looping);
                console.log('PlaySnd', { slot, freq: handle.frequency, volume: handle.volume, pan: handle.pan, looping: handle.looping });
                break;
            }

            case Command.SetSndAttr: {
                const slot = view.getUint16(2, true);
                const freq = view.getUint32(4, true);
                const volume = view.getUint16(8, true);
                const pan = view.getInt16(10, true);
                const looping = view.getUint16(12, true);
                const flags = view.getUint32(14, true);

                let handle = this.#soundHandles[slot];
                if (!handle) {
                    console.error('PlaySnd: soundHandle not found', { slot, freq, volume, pan, looping });
                    break;
                }

                if (freq != CURRENT) {
                    const newFreq = freq === DEFAULT ? 44050 : freq;
                    if (newFreq !== handle.frequency) {
                        handle.frequency = newFreq;
                        handle.handle.rate(newFreq / 44050);
                    }
                }
                
                if (volume != CURRENT) {
                    const newVolume = volume === DEFAULT ? 50 : volume;
                    if (newVolume !== handle.volume) {
                        handle.volume = newVolume;
                        this.#updateSoundVolume(handle);
                    }
                }

                if (pan != CURRENT) {
                    const newPan = pan === -2 ? 0 : pan;
                    if (newPan !== handle.pan) {
                        handle.pan = newPan;
                        handle.handle.stereo(handle.pan / 100.0)
                    }
                }

                if (looping != CURRENT) {
                    const newLooping = looping === DEFAULT ? 0 : looping;
                    if (newLooping !== handle.looping) {
                        handle.looping = newLooping;
                        handle.handle.loop(looping !== 0);
                    }
                }

                console.log('SetSndAttr', { slot, freq, volume, pan, looping, flags });
                break;
            }

            case Command.GetSndAttr: {
                // Not implemented in server?
                console.log('GetSndAttr');
                break;
            }

            case Command.LoadMusic: {
                const slot = view.getUint16(2, true);
                const fileName = this.#decodeFileName(commandBytes.subarray(4, 68));
                const flags = view.getUint32(68, true);
                const musicType = view.getUint16(72, true);

                if (slot in this.#musicChannels) {
                    const handle = this.#musicChannels[slot];
                    if (handle.type === 'mp3')
                        handle.handle.stop();
                    else
                        handle.handle.then(h => h.stop());
                }
                
                const loop = flags === DEFAULT || !!(flags & MUS_LOOPING);
                try {
                    const musicContent = this.#driver.read(fileName);
                    if (musicType === 1) {
                        // MP3 or OGG - use howler.js to play
                        const musicBlob = new Blob([musicContent], { type: 'audio/mp3' });
                        const musicUrl = URL.createObjectURL(musicBlob);
                        this.#musicChannels[slot] = {
                            type: 'mp3',
                            handle: new Howl({
                                src: musicUrl,
                                format: ['mp3'],
                                loop
                            }),
                            volume: 50,
                            byteLength: musicContent.byteLength
                        };
                    } else {
                        // MOD/IT/S3M/XM - use chiptune3.js to play
                        const handle = new ChiptuneJsPlayer({ repeatCount: loop ? -1 : 0 });
                        const handlePromise = new Promise((resolve) => { handle.onInitialized(() => { resolve(handle); }) });
                        this.#musicChannels[slot] = {
                            type: 'mod',
                            content: musicContent,
                            handle: handlePromise,
                            volume: 50
                        }
                    }
                } catch {
                    console.error(`LoadMusic: Unable to read file '${fileName}'`)
                }

                console.log('LoadMusic', { slot, fileName, flags, musicType });
                break;
            }

            case Command.PlayMusic: {
                const slot = view.getUint16(2, true);
                const handle = this.#musicChannels[slot];
                if (!handle) {
                    console.error('PlayMusic: Music slot not found', { slot });
                    break;
                }

                if (handle.type === 'mp3') {
                    handle.handle.play();
                } else {
                    handle.handle.then(h => h.play(handle.content.buffer));
                }
                console.log('PlayMusic', { slot });
                break;
            }

            case Command.SetMusicAttr: {
                const slot = view.getUint16(2, true);
                const pan = view.getInt16(4, true);
                const volume = view.getUint16(6, true);
                const handle = this.#musicChannels[slot];
                if (!handle) {
                    console.error('SetMusicAttr: Music slot not found', { slot });
                    break;
                }
                if (pan !== CURRENT_PAN) {
                    const newPan = pan === DEFAULT_PAN ? 0 : pan;
                    if (handle.type === 'mp3')
                        handle.handle.stereo(newPan / 100.0);
                    // not supported in chiptune3
                }
                if (volume !== CURRENT) {
                    const newVolume = volume === DEFAULT ? 50 : volume;
                    handle.volume = newVolume;
                    this.#updateMusicVolume(handle);
                }
                console.log('SetMusicAttr', { slot, pan, volume });
                break;
            }

            case Command.GetMusicAttr: {
                // Not implemented?
                console.log('GetMusicAttr');
                break;
            }

            case Command.StopSnd: {
                const slot = view.getUint16(2, true);
                const handle = this.#soundHandles[slot];
                if (!handle) {
                    console.error('StopSnd: Music slot not found', { slot });
                    break;
                }
                handle.handle.stop();
                console.log('StopSnd', { slot });
                break;
            }

            case Command.PauseMusic: {
                const slot = view.getUint16(2, true);
                const handle = this.#musicChannels[slot];
                if (!handle) {
                    console.error('SetMusicAttr: Music slot not found', { slot });
                    break;
                }
                if (handle.type === 'mp3') {
                    handle.handle.pause();
                } else {
                    handle.handle.then(h => h.pause());
                }
                console.log('PauseMusic', { slot });
                break;
            }

            case Command.ResumeMusic: {
                const slot = view.getUint16(2, true);
                const handle = this.#musicChannels[slot];
                if (!handle) {
                    console.error('ResumeMusic: Music slot not found', { slot });
                    break;
                }
                if (handle.type === 'mp3') {
                    handle.handle.play();
                } else {
                    handle.handle.then(h => h.unpause());
                }
                console.log('ResumeMusic', { slot });
                break;
            }

            case Command.StopMusic: {
                const slot = view.getUint16(2, true);
                const handle = this.#musicChannels[slot];
                if (!handle) {
                    console.error('ResumeMusic: Music slot not found', { slot });
                    break;
                }
                if (handle.type === 'mp3') 
                    handle.handle.stop();
                else
                    handle.handle.then(h => h.stop());
                console.log('StopMusic', { slot });
                break;
            }

            case Command.DeleteSnd: {
                const slot = view.getUint16(2, true);
                console.log('DeleteSnd', { slot });
                break;
            }

            case Command.DeleteMusic: {
                const slot = view.getUint16(2, true);
                const handle = this.#musicChannels[slot];
                if (!handle) {
                    console.error('ResumeMusic: Music slot not found', { slot });
                    break;
                }
                if (handle.type === 'mp3') 
                    handle.handle.unload();
                else
                    // best we can do, library has no 'unload' function
                    handle.handle.then(h => h.stop());

                delete this.#musicChannels[slot];
                console.log('DeleteMusic', { slot });
                break;
            }

            case Command.SetVolume: {
                const volume = view.getUint16(2, true);

                if (volume !== CURRENT) {
                    const newVolume = volume === DEFAULT ? 50 : volume;
                    this.#masterVolume = newVolume;
                    for (const soundHandle of Object.values(this.#soundHandles))
                        this.#updateSoundVolume(soundHandle);
                    for (const musicChannel of Object.values(this.#musicChannels))
                        this.#updateMusicVolume(musicChannel);
                }

                console.log('SetVolume', { volume });
                break;
            }

            case Command.SetGlobalVols: {
                const soundVolume = view.getUint16(2, true);
                const musicVolume = view.getUint16(4, true);

                if (soundVolume !== CURRENT) {
                    const newSoundVolume = soundVolume === DEFAULT ? 50 : soundVolume;
                    this.#globalVolumes.sound = newSoundVolume;
                    for (const soundHandle of Object.values(this.#soundHandles))
                        this.#updateSoundVolume(soundHandle);
                }
                if (musicVolume !== CURRENT) {
                    const newMusicVolume = musicVolume === DEFAULT ? 50 : musicVolume;
                    this.#globalVolumes.music = newMusicVolume;
                    for (const musicChannel of Object.values(this.#musicChannels))
                        this.#updateMusicVolume(musicChannel);
                }
                console.log('SetGlobalVolumes', { soundVolume, musicVolume });
                break;
            }

            case Command.Play2DSounds: {
                const posX = view.getUint16(2, true);
                const posY = view.getUint16(4, true);
                const angle = view.getUint16(6, true);
                const sndCount = view.getUint16(8, true);
                const soundQueue = [];
                for (let i = 0; i < sndCount; ++i) {
                    const id = view.getUint16(10 + i * 16, true);
                    const slot = view.getUint16(2, true);
                    const freq = view.getUint32(4, true);
                    const volume = view.getUint16(8, true);
                    const x = view.getInt16(10, true);
                    const y = view.getInt16(12, true);
                    const angle = view.getInt16(14, true);    
                    soundQueue.push({ id, slot, freq, volume, x, y, angle });

                    const handle = this.#soundHandles[slot];
                    if (!handle) {
                        console.error('Play2DSounds: Music slot not found', { slot });
                        continue;    
                    }
                    this.#playSound2D(handle, freq, volume, x, y);
                }
                console.log('Play2DSounds', { posX, posY, angle, sndCount, soundQueue });
                break;
            }

            case Command.Play3DSounds: {
                // Server code with a buffer overflow bug, no QB implmentation?
                console.error('Play3DSounds: Not implemented');
                break;
            }

            case Command.GetMusicLength: {
                const slot = view.getUint16(2, true);

                const musicChannel = this.#musicChannels[slot]
                if (!musicChannel) {
                    console.error('GetMusicLength: Music slot not found', { slot });
                    break;
                }
                
                const musicLength = new Uint8Array(4);
                const musicLengthView = new DataView(musicLength.buffer);
                if (musicChannel.type === 'mp3') {
                    // Music length is measured in bytes
                    musicLengthView.setUint32(0, musicChannel.byteLength, true);
                    console.log('GetMusicLength', { slot }, musicLength);
                    return Promise.resolve(musicLength);
                } else {
                    // Music length is measured in tracker order/row
                    return musicChannel.handle.then(h => {
                        musicLengthView.setUint16(0, h.meta.totalOrders, true);
                        musicLengthView.setUint16(2, 0, true); // Music length in rows doesn't seem to be a thing in BASS or chiptune3
                        console.log('GetMusicLength', { slot }, musicLength);    
                        return musicLength;
                    });
                }
            }

            case Command.SetMusicPos: {
                const slot = view.getUint16(2, true);

                const musicChannel = this.#musicChannels[slot]
                if (!musicChannel) {
                    console.error('SetMusicPos: Music slot not found', { slot });
                    break;
                }

                if (musicChannel.type === 'mp3') {
                    // Position is in how many bytes have been played.
                    // Howler only uses seconds, so fudge it with percentages
                    if (musicChannel.byteLength === 0) {
                        console.error('SetMusicPos: Sample byte length is zero');
                        break;
                    }
                    const position = view.getUint32(4, true);
                    if (position > musicChannel.byteLength) {
                        console.error('SetMusicPos: Position is after end');
                        break;
                    }
                    const percentage = position * 1.0 / musicChannel.byteLength;
                    const seconds = percentage * musicChannel.handle.duration();
                    musicChannel.handle.seek(seconds);
                    console.log('SetMusicPos', { slot, position });
                } else {
                    // Position is MOD order and row packed together
                    const order = view.getUint16(4, true);
                    const row = view.getUint16(6, true);
                    musicChannel.handle.then(h => h.setOrderRow(order, row));
                    console.log('SetMusicPos', { slot, order, row });
                }
                break;
            }

            case Command.GetMusicPos: {
                const slot = view.getUint16(2, true);
                const musicPosition = new Uint8Array(4);
                const musicPositionView = new DataView(musicPosition.buffer);

                const musicChannel = this.#musicChannels[slot]
                if (!musicChannel) {
                    console.error('GetMusicPos: Music slot not found', { slot });
                    break;
                }

                if (musicChannel.type === 'mp3') {
                    // Position is in how many bytes have been played.
                    // Howler only uses seconds, so fudge it with percentages
                    if (musicChannel.byteLength === 0 || musicChannel.handle.duration() === 0) {
                        console.error('SetMusicPos: Sample byte length is zero');
                        break;
                    }
                    const seconds = musicChannel.handle.seek();
                    const total = musicChannel.handle.duration();
                    const percentage = seconds * 1.0 / total;
                    const position = (percentage * musicChannel.byteLength) | 0;
                    musicPositionView.setUint32(0, position);
                    console.log('GetMusicPos', { slot }, musicPosition);
                    return Promise.resolve(musicPosition);
                } else {
                    // Position is MOD order and row packed together
                    return musicChannel.handle.then(h => {
                        musicPositionView.setUint16(0, h.order, true);
                        musicPositionView.setUint16(1, h.row, true);
                        console.log('GetMusicPos', { slot }, musicPosition);
                        return musicPosition;
                    });
                }
            }

            case Command.Set3DPos: {
                // Server code with a buffer overflow bug, no QB implmentation?
                console.log('Set3DPos');
                break;
            }

            case Command.PlaySnd3D: {
                // Server code with a buffer overflow bug, no QB implmentation?
                console.log('PlaySnd3D');
                break;
            }

            case Command.Set3DFacts: {
                // Server code with a buffer overflow bug, no QB implmentation?
                console.log('Set3DFacts');
                break;
            }

            case Command.SetEAX: {
                // Server code, no QB implementation
                console.log('SetEAX');
                break;
            }

            case Command.PlaySounds: {
                const sndCount = view.getUint16(2, true);                
                const soundQueue = [];
                for (let i = 0; i < sndCount; ++i) {
                    const offset = 4 + i * 16;
                    const id = view.getUint16(offset, true);
                    const slot = view.getUint16(offset + 2, true);
                    const freq = view.getUint32(offset + 4, true);
                    const volume = view.getUint16(offset + 8, true);
                    const pan = view.getInt16(offset + 10, true);
                    const looping = view.getUint16(offset + 12, true);
                    const handle = this.#soundHandles[slot];
                    if (!handle) {
                        console.error('PlaySounds: Music slot not found', { slot });
                        continue;    
                    }
                    this.#playSound(handle, freq, volume, pan, looping);
                    soundQueue.push({ id, slot, freq, volume, pan, looping })
                }
                console.log('PlaySounds', { sndCount, soundQueue });
                break;
            }

            case Command.PlaySnd2D: {
                const slot = view.getUint16(2, true);
                const freq = view.getUint32(4, true);
                const volume = view.getUint16(8, true);
                const x = view.getInt16(10, true);
                const y = view.getInt16(12, true);
                const angle = view.getInt16(14, true);

                let handle = this.#soundHandles[slot];
                if (!handle) {
                    console.error('PlaySnd: soundHandle not found', { slot, freq, volume, x, y, angle });
                    break;
                }
                this.#playSound2D(handle, freq, volume, x, y);

                console.log('PlaySnd2D', { slot, freq, volume, x, y, angle });
                break;
            }

            case Command.Set2DPos: {
                const posX = view.getInt16(2, true);
                const posY = view.getInt16(4, true);
                const angle = view.getInt16(6, true);
                this.#earPos = { x: posX, y: posY, angle };
                console.log('Set2DPos', { posX, posY, angle });
                break;
            }

            case Command.Set2DDistFactor: {
                const distF = view.getFloat32(2, true);
                this.#distFactor2d = distF;
                console.log('Set2DDistFactor', { distF });
                break;
            }
            
            case Command.CDInit: {
                console.error('CDInit: Not implemented');
                break;
            }

            case Command.CDFree: {
                console.error('CDFree: Not implemented');
                break;
            }

            case Command.GetTracks: {
                console.error('GetTracks: Not implemented');
                const trackCount = new Uint8Array(2);
                return Promise.resolve(trackCount);
            }

            case Command.GetTrackLength: {
                console.error('GetTrackLength: Not implemented');
                const trackLength = new Uint8Array(4);
                return Promise.resolve(trackLength);
            }

            case Command.CDPlay: {
                const track = view.getUint16(2, true);
                const looping = view.getUint16(2, true);
                console.error('CDPlay: Not implemented', { track, looping });
                break;
            }

            default: 
                console.error('Unrecognized command', { commandBytes });
                break;
        }
        
        return Promise.resolve(null);
    }
}

