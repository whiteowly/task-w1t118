import path from 'node:path';
import fs from 'node:fs';
import { createApp } from './app.js';
import { getDb } from './db/connection.js';
import { initializeSchema } from './db/schema.js';

const DATA_DIR = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = getDb();
initializeSchema(db);

const app = createApp();
const port = parseInt(process.env.PORT ?? '3001', 10);

app.listen(port, () => {
  console.log(`LocalOps API server listening on http://127.0.0.1:${port}`);
});
