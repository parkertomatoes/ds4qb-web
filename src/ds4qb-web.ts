import { FileReference, createImage, appendAutoexec } from './image';
import { FatFsDisk } from 'fatfs-wasm';
import { DS4QB, DS4QBDriver } from './ds4qb';
import { FatPathMapper } from './lfnSupport';

type V86FileSource = { url: string } | { buffer: ArrayBuffer }

export type DS4QBOptions = {
    screenContainer: HTMLElement,
    content: FileReference,
    biosFile: V86FileSource,
    vgaBiosFile: V86FileSource,
    fdaImageFile: V86FileSource,
    v86WasmUrl: string,
    ds4qbDatPath?: string,
    workingDir?: string,
    addMouse?: boolean,
    addEms?: boolean,
    autoExe?: string
}

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
        const ds4qb = new DS4QB(driver, options?.ds4qbDatPath ?? '', options?.workingDir ?? '');
        ds4qb.start();
    });
    return image;
}