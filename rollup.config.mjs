import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';
export default [{
    /* Library */
    input: './src/ds4qb-web.ts',
    output: [{
        file: './dist/ds4qb-web.min.js',
        format: 'umd',
        name: 'ds4qb-web',
        sourcemap: true
    }, {
        file: './dist/ds4qb-web.min.mjs',
        format: 'es',
        name: 'ds4qb-web',
        sourcemap: true
    }],
    external: ['node:path', 'node:url', 'node:fs/promises'],
    plugins: [
        typescript({
            rootDir: './src'
        }),
        terser({
            sourceMap: {
                includeSources: true, 
                url: 'inline'
            }
        }),
        copy({
            targets: [
                { src: './README.md', dest: 'dist' },
                { src: './package.dist.json', dest: 'dist', rename: 'package.json' }
            ]
        })

    ]
}]
