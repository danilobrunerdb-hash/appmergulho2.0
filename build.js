// Gera dist/ a partir de src/: index.html (arquivo único, funciona offline) + arquivos do app instalável (PWA).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let html = src('index.template.html');
const put = (mark, code) => { html = html.split(mark).join(code.replace(/<\/script>/g, '<\\/script>')); };
put('/*__LOGO__*/', src('logo.b64').trim());
put('/*__LOGOJPG__*/', src('logo_jpg.b64').trim());
put('/*__DATA__*/', src('data.js')); put('/*__ENGINE__*/', src('engine.js'));
put('/*__PDF__*/', src('pdf.js')); put('/*__FLOW__*/', src('flow.js')); put('/*__UI__*/', src('ui.js'));
const out = path.join(__dirname, 'dist');
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
// PWA: manifesto, ícones e service worker (versão = hash do conteúdo, para atualizar a cópia offline a cada mudança)
const version = src('engine.js').match(/APP_VERSION = '([^']+)'/)[1] + '-' + crypto.createHash('sha1').update(html).digest('hex').slice(0, 8);
fs.copyFileSync(path.join(__dirname, 'src/pwa/manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
fs.writeFileSync(path.join(out, 'sw.js'), src('pwa/sw.js').replace('__VERSION__', version));
for (const f of fs.readdirSync(path.join(__dirname, 'src/pwa/icons'))) fs.copyFileSync(path.join(__dirname, 'src/pwa/icons', f), path.join(out, 'icons', f));
// APK (Android): o PWABuilder gera um assetlinks.json; colocado em src/pwa/assetlinks.json, ele é publicado em /.well-known/
// e o APK abre em tela cheia, sem a barra de endereço do navegador.
const al = path.join(__dirname, 'src/pwa/assetlinks.json');
if (fs.existsSync(al)) { fs.mkdirSync(path.join(out, '.well-known'), { recursive: true }); fs.copyFileSync(al, path.join(out, '.well-known', 'assetlinks.json')); console.log('assetlinks.json publicado em /.well-known/'); }
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB · PWA ' + version);
