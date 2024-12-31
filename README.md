# ds4qb-web
[![Release](https://badgen.net/github/release/parkertomatoes/ds4qb-web)](https://github.com/parkertomatoes/ds4qb-web/releases) [![NPM Version](https://badgen.net/npm/v/ds4qb-web)](https://www.npmjs.com/package/ds4qb-web) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Implementation of the DS4QB, DS4QB2, and DS4QB++ audio protocol for DOS games running in the V86 in-browser PC emulator.

## What is it?

[DS4QB](https://web.archive.org/web/20010723163158/http://www.aethersoft.com:80/) ("DirectSound for QB") and its family ([DS4QB2](https://web.archive.org/web/20010612125157fw_/http://www.aethersoft.com/html/products.htm) and [DS4QB++](https://web.archive.org/web/20031005115658/http://lithium.zext.net/mf.html)) were sound libraries for DOS games which used unusual methods (the DOS clipboard API and the legacy DMA controller) to communicate with a Win9X audio server.

ds4qb-web is a browser-based server for the DS4QB protocols, allowing these games to be easily played in a browser with a DOS guest OS. It leverages [v86](https://copy.sh/v86/), [Howler.js](https://howlerjs.com/), and [chiptune3.js](https://github.com/DrSnuggles/chiptune).

## Try it out

A gallery of nearly 30 DS4QB games and apps: 

[Link](https://parkertomatoes.github.io/ds4qb-web-demo)

A sample project using Vite and TypeScript:

[<img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub link" width="30"/>](https://github.com/parkertomatoes/ds4qb-web-example-vite) [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/parkertomatoes/ds4qb-web-example-vite)

## Features

 * Enables audio for DS4QB, DS4QB2, and DS4QB++ games in the browser
 * .MOD, .WAV, .MP3 support with volume, fading and panning
 * Bundler-friendly distribution with TypeScript and ESM support
 * Automatically installs and runs .zip packed games
 * Options to configure mouse, EMS

## Getting Started

ds4qb-web needs a few files for the emulator to use
 * An X86 BIOS image - [seabios]() is a free open source one
 * An X86 VGA BIOS image - I recommend [Bochs](https://www.nongnu.org/vgabios/) since seabios has some bugs that affect QBasic
 * A floppy disk image containing a DOS BOOT disk. You can find FreeDOS boot disks [here](https://github.com/codercowboy/freedosbootdisks).
    * For DS4QB1 support, needs to contian [CLIPEMU.COM](https://github.com/parkertomatoes/ds4qb-web/blob/main/src/clipemu.asm).
    * For mouse support, needs to contain MOUSE\.COM. 
    * For EMS support, needs to contain [EMSMAGIC.EXE](https://www.emsmagic.com/).

Since V86 isn't distributed via npm, it must be available in the global object:
```html
<!-- put this before your own code -->
<script src="libv86.js"></script>
```

After that, add an HTML element to use as the screen:
```html
<div id="screen_container">
    <div style="white-space: pre; font: 14px monospace; line-height: 14px"></div>
    <canvas style="display: none"></canvas>
</div>
```

And start the emulator with the `attachDs4qb` function:
```js
import { attachDs4qb } from 'ds4qb-web';

attachDs4qb(V86, {
    // ds4qb-web options:
    content: { url: "url_to_game.zip" },
    autoExe: "MYGAME.EXE",

    // v86 options
    screenContainer: document.getElementById('screen_container'),
    bios: { url: "url_to_bios.img" },
    vgaBios: { url: "url_to_vgabios.img" },
    fdaImageFile: { url: "url_to_dos_disk.img" }
    v86WasmUrl: { url: "url_to_v86.wasm" }
})
```


## API Documentation

### attachDs4qb Function
ds4qb-web is a single function to initialize and start an emulator

```ts
attachDs4qb(V86: function, options: DS4QBOptions): Promise<UInt8Array>
```

| Parameter | Type         | Description                                     |
| --------- | ------------ | ----------------------------------------------- |
| V86       | function     | The constructor for V86 (it is not distributed via npm, so it must be imported by user and passed manually) |
| options   | DS4QBOptions | Configuration options. See below for details    |  

The function returns the generated FAT disk image containing the .zip contents, as a byte array.

### DS4QBOptions Type:
The `attachDs4qb` options parameter is an object with a mix of V86 options and ds4qb-web options

ds4qb-web options:

| Property Name   | Type          | Description                                |
| --------------- | ------------- | ------------------------------------------ |
| content         | FileReference | .zip file containing the DOS app to run    |
| protocol        | string        | Library: 'ds4qb', 'ds4qb2', or 'ds4qb++'   |
| autoExe?        | string        | Shell command to start the app (optional)  |
| ds4qbDatPath?   | string        | Path to DS4QB2.dat (optional)              |
| configPath?     | string        | Path to SOUNDSYS.CFG (optional)            |
| workingDir?     | string        | "Root" path to use for audio file paths    |
| addMouse?       | boolean       | Runs MOUSE.COM at start if true (optional) |
| addEms?         | boolean       | Runs EMSMAGIC at start if true (optional)  |

v86 options:
| Property Name   | Type          | Description                                |
| --------------- | ------------- | ------------------------------------------ |
| screenContainer | HTMLElement   | HTML container with a canvas for screen    |
| biosFile        | V86FileSource | x86 BIOS image                             |
| vgaBiosFile     | V86FileSource | x86 VGA BIOS image                         |
| fdaImageFile    | V86FileSource | DOS boot disk image                        |
| v86WasmUrl      | string        | URL to V86 WASM file                       |

### FileReference Type
Refers to a file by URL, an ArrayBuffer with the file, or a UInt8Array to the file.
```js
{ url: string } // Pass a URL to the file
```
```js
{ array: Uint8Array } // Pass a typed array to the file
```
```js
{ array: ArrayBuffer } // Pass an array buffer to the file
```

### V86FileSource Type
V86 accepts files as either a URL or an ArrayBuffer with the file
```js
{ url: string } // Pass a URL to the file
```
```js
{ array: ArrayBuffer } // Pass an array buffer to the file
```

## Contributing

If you want to contribute, please contact me because that means you're one of the dozen people who remember this library and we probably knew each other.
