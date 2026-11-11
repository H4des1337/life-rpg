import type { Db } from './db.js';
import type { AppPaths, ServerConfig } from './config.js';

export interface AppContext {
  db: Db;
  paths: AppPaths;
  config: ServerConfig;
  reopen: () => Db;
  close: () => void;
}
