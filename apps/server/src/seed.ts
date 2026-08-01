import { config } from "./config.js";
import { GameDatabase } from "./db.js";

const db = new GameDatabase(config.sqlitePath);
db.seedDemoHistory();
db.close();

console.log(`Seeded demo history at ${config.sqlitePath}`);
