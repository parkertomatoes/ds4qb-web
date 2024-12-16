# ds4qb-web

Audio driver for DOS programs using DS4QB2 under the V86 emulator. 

## What is it?

[DS4QB2](https://web.archive.org/web/20010723163158/http://www.aethersoft.com:80/) and its family (DS4QB and DS4QB++) were sound libraries for QBASIC games, that used IPC to play audio from a Win9x server application. Unable to run in NTVDM or DosBox, the only way to make audio work is to emulate an entire Windows 95 or 98 computer.

ds4qb-web is a browser-based server for the DS4QB2 protocol, allowing these games to be easily played in a browser with a DOS guest OS. It leverages [v86](https://copy.sh/v86/), [Howler.js](https://howlerjs.com/), and [chiptune3.js](https://github.com/DrSnuggles/chiptune).

## Try it out

A live demo playing [Squealer TNT](http://piptol.qbasicnews.com/) with sound:

[Link](https://parkertomatoes.github.io/ds4qb-web-demo/?game=squealer)

A sample project using Vite and TypeScript:

[<img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub link" width="30"/>](https://github.com/parkertomatoes/ds4qb-web-example-vite) [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/parkertomatoes/ds4qb-web-example-vite)





## Features

 * Enables audio for DS4QB2 games in the browser
 * .MOD, .WAV, .MP3 support with volume, fading and panning
 * Bundler-friendly distribution with TypeScript and ESM support
 * Automatically installs and runs .zip packed games
 * Options to configure mouse, EMS

## Getting Started

ds4qb-web needs a few files for the emulator to use
 * An X86 BIOS image - [seabios]() is a free open source one
 * An X86 VGA BIOS image - I recommend [Bochs](https://www.nongnu.org/vgabios/) since seabios has some bugs that affect QBasic
 * A floppy disk image containing a DOS BOOT disk. You can find FreeDOS boot disks [here](https://github.com/codercowboy/freedosbootdisks).
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
| autoExe?        | string        | Shell command to start the app (optional)  |
| ds4qbDatPath?   | string        | Path to DS4QB2.dat (optional)              |
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