// Gera dist/index.html (arquivo único, funciona offline) a partir de src/.
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let html = src('index.template.html');
const put = (mark, code) => { html = html.split(mark).join(code.replace(/<\/script>/g, '<\\/script>')); };
put('/*__LOGO__*/', src('logo.b64').trim());
put('/*__LOGOJPG__*/', src('logo_jpg.b64').trim());
put('/*__DATA__*/', src('data.js')); put('/*__ENGINE__*/', src('engine.js'));
put('/*__PDF__*/', src('pdf.js')); put('/*__FLOW__*/', src('flow.js')); put('/*__UI__*/', src('ui.js'));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
