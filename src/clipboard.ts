/** A clipboard service for V86 running a DOS guest */
export class ClipboardEmulator {
    #emulator: any;
    #logger: any;

    #clipparamSegment: number;
    #clipparamOffset: number;
    #open: boolean;
    #clipdataFormat: number;
    #clipdata: Uint8Array | null;

    constructor (emulator: any, logger: any) {
        this.#emulator = emulator;
        this.#logger = logger;
        this.#clipparamSegment = 0;
        this.#clipparamOffset = 0;
        this.#open = false;
        this.#clipdataFormat = 0;
        this.#clipdata = null;

        emulator.bus.register('emulator-started', () => {
            // 16-bit write: guest is sending parameter buffer address
            emulator.v86.cpu.io.register_write(
                0x4a53, 
                this, 
                () => {},             // 8-bit write handler
                (value: number) => {  // 16-bit write handler
                    this.#clipparamSegment = value;
                },
                () => {}              // 32-bit write handler
            )
            emulator.v86.cpu.io.register_write(
                0x4a54, 
                this, 
                () => {},             // 8-bit write handler
                (value: number) => {  // 16-bit write handler
                    this.#clipparamOffset = value;
                },
                () => {}              // 32-bit write handler
            )

            // 16-bit read: guest is invoking a clipboard interrupt
            emulator.v86.cpu.io.register_read(
                0x4a53, 
                this, 
                () => {},             // 8-bit read handler
                () => {               // 16-bit read handler
                    const result = this.#invoke();
                    return result;
                },
                () => {}              // 32-bit read handler
            )
        });
    }

    read(): { format: number, bytes: Uint8Array } | null {
        return this.#clipdata === null
            ? null
            : { format: this.#clipdataFormat, bytes: this.#clipdata };
    }

    empty(): void {
        this.#clipdata = null;
        this.#clipdataFormat = 0;
    }

    #invoke() {
        // Get register values, which have been packed into the parameter buffer
        const physicalAddress = this.#clipparamSegment * 16 + this.#clipparamOffset;
        const paramBytes: Uint8Array = this.#emulator.read_memory(physicalAddress, 12);
        const paramView = new DataView(paramBytes.buffer, paramBytes.byteOffset, paramBytes.byteLength);
        const ax = paramView.getUint16(0, true);
        const bx = paramView.getUint16(2, true);
        const cx = paramView.getUint16(4, true);
        const dx = paramView.getUint16(6, true);
        const es = paramView.getUint16(8, true);
        const si = paramView.getUint16(10, true);

        switch (ax) {
            case 0x1700:   // Is clipboard available?
                // Major version, minor version
                this.#logger.debug('Clipboard: Is Clipboard Available?');
                return 0x4a53; 
            
            case 0x1701:   // Open clipboard
                // 0 = already open, >0 = success
                this.#logger.debug('Clipboard: Open Clipboard'); 
                if (this.#open)
                    return 0;

                this.#open = true;
                return 1;
            
            case 0x1702:   // Empty clipboard
                // 0 = failure, >0 = success 
                this.#logger.debug('Clipboard: Empty Clipboard'); 
                if (!this.#open)
                    return 0;

                this.#clipdata = null;
                this.#clipdataFormat = 0;
                return 1;

            case 0x1703: { // Set clipboard data
                this.#logger.debug('Clipboard: Set Clipboard Data', { ax, bx, cx, dx, es, si }); 
                if (!this.#open)
                    return 0;

                const address = es * 16 + bx;
                const length = si * 0x10000 + cx + 1; // Include null terminator
                this.#clipdataFormat = dx;
                this.#clipdata = this.#emulator.read_memory(address, length).slice();
                console.debug('Data:', this.#clipdata)
                return 1;
            }

            case 0x1704: { // Get clipboard data size
                this.#logger.debug('Clipboard: Get Clipboard Data Size'); 

                if (!this.#open || !this.#clipdata) {
                    paramView.setUint16(0, 0, true);
                    return 0;
                }

                // dx = high word, pass by writing to param memory
                paramView.setUint16(0, this.#clipdata.byteLength >> 16, true);
                this.#emulator.write_memory(paramBytes, physicalAddress);
                return this.#clipdata.byteLength & 0xffff;
            }

            case 0x1705: { // Get clipboard data
                this.#logger.debug('Clipboard: Get Clipboard Data', { bx, es }); 

                if (!this.#open || !this.#clipdata)
                    return 0;

                const address = es * 16 + bx;
                this.#emulator.write_memory(this.#clipdata, address)
                return 1;
            }

            case 0x1708:   // Close clipboard
                this.#logger.debug('Clipboard: Close Clipboard'); 
                if (!this.#open)
                    return 0;
                this.#open = false;
                return 1;

            case 0x1709: { // Will my data fit?
                this.#logger.debug('Clipboard: Will My Data Fit?', { cx, si }); 

                const length = si * 0x10000 + cx + 1; // Include null terminator

                // dx = high word of largest block, ax = low word
                paramView.setUint16(0, length >> 16, true);
                this.#emulator.write_memory(paramBytes, physicalAddress);
                return length & 0xffff;
            }

            default:
                this.#logger.error(`Clipboard: Error: unrecognized function`, { ax, bx, cx, dx, es, si })
        }

    }
}