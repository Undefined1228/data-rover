import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode', 'pg', 'mysql2', 'ssh2'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: false,
})

if (watch) {
  await ctx.watch()
  console.log('[esbuild] watching...')
} else {
  await ctx.rebuild()
  await ctx.dispose()
  console.log('[esbuild] build complete')
}
