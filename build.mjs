// Bundles src/ into ONE file: dist/pet-park.html. It runs from a double-click (no server).
//   node build.mjs          build once
//   node build.mjs --watch  rebuild on every save
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const write = (js) => {
  const html = fs.readFileSync('src/index.html', 'utf8');
  const safe = js.replace(/<\/script/gi, '<\\/script');
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/pet-park.html', html.replace('<!--APP-->', () => `<script>${safe}</script>`));
  console.log(`built dist/pet-park.html (${(fs.statSync('dist/pet-park.html').size / 1024).toFixed(0)} KB)`);
};

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  plugins: [{
    name: 'single-html',
    setup(b) {
      b.onEnd((r) => {
        if (r.errors.length) return;
        write(r.outputFiles[0].text);
      });
    },
  }],
};

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching src/ ...');
} else {
  await esbuild.build(options);
}
