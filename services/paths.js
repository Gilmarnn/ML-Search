const path = require('path');

// Em desenvolvimento: raiz do projeto.
// Empacotado em dist/Meli Auto.exe: usa a pasta do projeto (pai de dist),
// preservando .env, data, custos, tokens e histórico já configurados.
// Se o .exe estiver fora de uma pasta "dist", usa a própria pasta do executável.
let APP_DIR;
if (process.pkg) {
  const exeDir = path.dirname(process.execPath);
  APP_DIR = path.basename(exeDir).toLowerCase() === 'dist'
    ? path.dirname(exeDir)
    : exeDir;
} else {
  APP_DIR = path.join(__dirname, '..');
}

const DATA_DIR = path.join(APP_DIR, 'data');
const ENV_PATH = path.join(APP_DIR, '.env');

module.exports = { APP_DIR, DATA_DIR, ENV_PATH };
