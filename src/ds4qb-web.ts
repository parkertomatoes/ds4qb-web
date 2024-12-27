import { FileReference, createImage, appendAutoexec } from './image';
import { FatFsDisk } from 'fatfs-wasm';
import { DS4QBPP } from './ds4qbpp';
import { DS4QB2 } from './ds4qb2';
import type { DS4QBDriver, DS4QBProtocol } from './ds4qb';
import { FatPathMapper } from './lfnSupport';

type V86FileSource = { url: string } | { buffer: ArrayBuffer }

export type DS4QBOptions = {
    screenContainer: HTMLElement,
    content: FileReference,
    biosFile: V86FileSource,
    vgaBiosFile: V86FileSource,
    fdaImageFile: V86FileSource,
    v86WasmUrl: string,
    addMouse?: boolean,
    addEms?: boolean,
    autoExe?: string
    workingDir?: string
} & ({
    protocol: 'ds4qb2',
    ds4qbDatPath?: string,
} | {
    protocol: 'ds4qb++'
});

function createDriver(emulator: any, disk: FatFsDisk, pathMap: FatPathMapper): DS4QBDriver {
    return {
        read: (path: string) => disk.session(() => disk.readFile(pathMap.toFatPath(path))),
        write: (path: string, contents: Uint8Array) => disk.session(() => disk.writeFile(pathMap.toFatPath(path), contents)),
        poll: () => emulator.v86.cpu.io.port_read8(0),
        clear: () => {
            emulator.v86.cpu.io.port_write8(0, 0);
            emulator.v86.cpu.io.port_write8(0, 0);
        }
    };
}

export async function attachDS4QB(V86: any, options: DS4QBOptions): Promise<Uint8Array> {
    const commands = [];
    if (options.addMouse)
        commands.push('A:\\MOUSE');
    if (options.addEms)
        commands.push('A:\\EMSMAGIC')
    if (options.autoExe)
        commands.push(options.autoExe);
    const fdaImage = await appendAutoexec(options.fdaImageFile, commands)
    const { image, disk, pathMap } = await createImage(options.content);
    if (options.protocol === 'ds4qb++') {
        disk.session(() => {
            // auto-write SOUNDSYS.CFG to set OS to Win9X
            const cfgData = new Uint8Array(10);
            const cfgView = new DataView(cfgData.buffer);
            cfgView.setUint16(0, 1, true); // OS = Win9X
            cfgView.setUint16(2, 1, true); // Sound = ACTIVE
            cfgView.setUint16(4, 1, true); // Music = ACTIVE
            cfgView.setUint32(6, 44050, true); // Quality = 44050 Hz
            disk.writeFile('SOUNDSYS.CFG', cfgData);
        });
    }

    var emulator = new V86({
        screen_container: options.screenContainer,
        bios: options.biosFile,
        vga_bios: options.vgaBiosFile,
        fda: { buffer: fdaImage.buffer },
        hda: { buffer: image.buffer },
        boot_order: 0x321,
        autostart: true,
        wasm_path: options.v86WasmUrl
    });
    emulator.add_listener("emulator-ready", async function()
    {
        const driver = createDriver(emulator, disk, pathMap);
        let ds4qb: DS4QBProtocol;
        switch(options.protocol) {
            case 'ds4qb2':
                ds4qb = new DS4QB2(driver, options?.ds4qbDatPath ?? '', options?.workingDir ?? '');
                break;
            case 'ds4qb++':
                ds4qb = new DS4QBPP(driver, options?.workingDir);
                break;
            default:
                throw new Error('unrecognized protocol');
        }
        setTimeout(() => ds4qb.start(), 250);
    });
    return image;
}