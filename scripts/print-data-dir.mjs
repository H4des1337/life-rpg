import { join } from 'node:path';
import os from 'node:os';

const base = process.env.LIFERPG_DATA_DIR
  ? process.env.LIFERPG_DATA_DIR
  : process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(os.homedir(), 'AppData', 'Local'), 'LIFE_RPG_WEB')
    : join(os.homedir(), '.local', 'share', 'LIFE_RPG_WEB');

console.log(base);
