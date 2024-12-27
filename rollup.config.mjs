import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';
import dts from 'rollup-plugin-dts';
import del from 'rollup-plugin-delete';

const rebaseDist = relPath => relPath.startsWith('../')
    ? relPath.substring(1)
    : relPath;

export default [{
    /* Library */
    input: './src/ds4qb-web.ts',
    output: [{
        file: './dist/ds4qb-web.min.js',
        format: 'umd',
        name: 'ds4qb-web',
        sourcemap: true,
        sourcemapPathTransform: rebaseDist,
        globals: {
            'fatfs-wasm': 'fatfs-wasm',
            'unzipit': 'unzipit',
            'howler': 'howler',
            'chiptune3': 'chiptune3'
        }
    }, {
        file: './dist/ds4qb-web.min.mjs',
        format: 'es',
        name: 'ds4qb-web',
        sourcemap: true,
        sourcemapPathTransform: rebaseDist,
        globals: {
            'fatfs-wasm': 'fatfs-wasm',
            'unzipit': 'unzipit',
            'howler': 'howler',
            'chiptune3': 'chiptune3'
        }
    }],
    external: [
        'fatfs-wasm', 
        'unzipit', 
        'howler',
        'chiptune3'
    ],
    plugins: [
        typescript({
            rootDir: './src'
        }),
        terser({
            sourceMap: true
        }),
        copy({
            targets: [
                { src: './README.md', dest: 'dist' },
                { src: './package.dist.json', dest: 'dist', rename: 'package.json' },
                { src: './src', dest: 'dist' }
            ]
        })

    ]
}, {
    input: './dist/ds4qb-web.d.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [dts(), del({
        targets: ['./dist/*.d.ts', './dist/*.d.ts.map'],
        hook: 'buildEnd'
    })],
},
]
