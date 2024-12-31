export type DS4QBDriver = {
    read: (path: string) => Uint8Array,
    write: (path: string, content: Uint8Array) => void,
    poll: () => number,
    clear: () => void
}

export type DS4QB1Driver = {
    read: (path: string) => Uint8Array | null,
    poll: () => Uint8Array | null,
    clear: () => void
}

export interface DS4QBProtocol {
    start(): void;
    stop(): void;
}