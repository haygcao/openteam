import { defineConfig } from 'vite'
import { build as buildWithEsbuild } from 'esbuild'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, readFileSync } from 'fs'

export function hasTopLevelStaticImport(source: string): boolean {
  return /^\s*import(?:[\s{*"']|\w)/m.test(source)
}

export default defineConfig(({ mode }) => ({
  define: {
    __OPENTEAM_DEV__: JSON.stringify(mode === 'development'),
  },
  plugins: [
    {
      name: 'extension-files',
      apply: 'build',
      async closeBundle() {
        mkdirSync('dist', { recursive: true })
        copyFileSync('public/manifest.json', 'dist/manifest.json')

        await buildWithEsbuild({
          entryPoints: [resolve(__dirname, 'src/content/index.ts')],
          outfile: resolve(__dirname, 'dist/content.js'),
          bundle: true,
          format: 'iife',
          platform: 'browser',
          target: 'chrome114',
          define: {
            __OPENTEAM_DEV__: JSON.stringify(mode === 'development'),
          },
          legalComments: 'none',
        })

        await buildWithEsbuild({
          entryPoints: [resolve(__dirname, 'src/content/kimiPageWorldBridge.ts')],
          outfile: resolve(__dirname, 'dist/kimiPageWorldBridge.js'),
          bundle: true,
          format: 'iife',
          platform: 'browser',
          target: 'chrome114',
          define: {
            __OPENTEAM_DEV__: JSON.stringify(mode === 'development'),
          },
          legalComments: 'none',
        })

        const contentScript = readFileSync('dist/content.js', 'utf8')
        if (hasTopLevelStaticImport(contentScript)) {
          throw new Error('dist/content.js must be self-contained because Chrome content_scripts are not ES modules')
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        team: resolve(__dirname, 'src/teamPage/index.ts')
      },
      output: {
        entryFileNames: '[name].js'
      }
    }
  }
}))
