import { FatFsDisk, FatFsFormat, FatFsMode } from 'fatfs-wasm';
import { unzipRaw } from 'unzipit';
import { FatPathMapper } from './lfnSupport';

export type FileUrl = { url: string };
export type FileArray = { array: Uint8Array };
export type FileBuffer = { buffer: ArrayBuffer };
export type FileReference = FileUrl | FileArray | FileBuffer;

async function fetchUrl(url: string) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
}

async function createEmptyImage(size: number): Promise<{ image: Uint8Array, disk: FatFsDisk }> {
    const image = new Uint8Array(size);
    const disk = await FatFsDisk.create(image);
    disk.mkfs({ 
        fmt: FatFsFormat.FAT,
        nFat: 2, // DOS 6.22 fails to read without a backup copy
        auSize: 2048
    });
    return { image, disk };
}

async function resolveReference(file: FileReference): Promise<Uint8Array> {
    if ('url' in file) {
        return await fetchUrl(file.url);
    } else if ('array' in file) {
        return file.array;
    } else if ('buffer' in file) {
        return new Uint8Array(file.buffer);
    } else {
        throw new Error('Unrecognized contents');
    }
}

export async function appendAutoexec(image: FileReference, commands: string[]): Promise<Uint8Array> {
    const imageContent = await resolveReference(image);
    const disk = await FatFsDisk.create(imageContent);
    disk.session(() => {
        if (commands && commands.length > 0) {
            const autoexecBytes = disk.readFile('AUTOEXEC.BAT');
            const autoexec = new TextDecoder().decode(autoexecBytes);
            const updatedAutoexec = [autoexec, 'C:', ...commands].join('\r\n');
            const updatedAutoexecBytes = new TextEncoder().encode(updatedAutoexec);
            disk.writeFile('AUTOEXEC.BAT', updatedAutoexecBytes);
        }
    });
    return imageContent;
}

function getRootPaths(filePath: string): string[] {
    const parts = filePath.split('/'); // Split the path into parts
    const result: string[] = [];
    let currentPath = '';

    // Build each level of the path
    for (let i = 0; i < parts.length - 1; i++) { // Exclude the last part (file name)
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        result.push(currentPath);
    }

    return result;
}

export async function createImage(zipFile: FileReference): Promise<{ image: Uint8Array, disk: FatFsDisk, pathMap: FatPathMapper }> {
    // Unzip content
    const zipContents = await resolveReference(zipFile);
    const zipInfo = await unzipRaw(zipContents);
    const unzippedEntries = await Promise.all(zipInfo.entries.map(async entry => ({ 
        name: entry.name, 
        contents: entry.name.endsWith('/') 
            ? null 
            : new Uint8Array(await entry.arrayBuffer())
    })));

    const diskSize = 1 << 25;
    const { image, disk } = await createEmptyImage(diskSize);
    disk.mount();

    const pathMap = new FatPathMapper();
    const visited = new Set<string>();
    for (const { name, contents } of unzippedEntries) {
        try {
            if (contents === null) {
                const dirName = name.endsWith('/') ? name.substring(0, name.length - 1) : name;
                if (!visited.has(dirName)) {
                    disk.mkdir(pathMap.toFatPath(dirName));
                    visited.add(dirName);
                }
            } else {
                for (const parentDir of getRootPaths(name)) {
                    const dirName = parentDir.endsWith('/') ? parentDir.substring(0, parentDir.length - 1) : parentDir;
                    if (!visited.has(dirName)) {
                        disk.mkdir(pathMap.toFatPath(dirName));
                        visited.add(dirName);
                    }
                }
                if (!visited.has(name)) {
                    visited.add(name);
                    const file = disk.open(pathMap.toFatPath(name), FatFsMode.WRITE | FatFsMode.CREATE_NEW);
                    file.write(contents);
                    file.close();    
                }
            }
        } catch(e) {
            console.log(`Failed to create '${name}':`, e);
        }
    }
    disk.unmount();
    return { image, disk, pathMap };
}