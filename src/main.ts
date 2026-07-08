const { readConfig, configureLogging } = require('./config/config.ts');
const { DataAnnotationApp } = require('./app/dataannotation_app.ts');

const { version } = require('../package.json');

let currentApp = null;

process.on('SIGINT', () => {
  if (currentApp) {
    currentApp.stop().catch(() => {});
  }
});

process.on('SIGTERM', () => {
  if (currentApp) {
    currentApp.stop().catch(() => {});
  }
});

async function main() {
  const config = await readConfig();
  configureLogging(config.log_level);
  currentApp = new DataAnnotationApp({ config, version });
  await currentApp.start();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
