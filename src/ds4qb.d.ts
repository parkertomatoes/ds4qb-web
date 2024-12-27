export type DS4QBDriver = {
    read: (path: string) => Uint8Array,
    write: (path: string, content: Uint8Array) => void,
    poll: () => number,
    clear: () => void
}

export interface DS4QBProtocol {
    start(): void;
    stop(): void;
}