import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { LEVEL_FILE_NAME, SAVE_ENDPOINT } from '../src/levels/serialize';

// Dev-only: lets the level editor save a level straight into
// src/levels/definitions/. In a static build the editor downloads the file
// instead, so nothing here ships to production.

interface SaveRequest {
  fileName: string;
  source: string;
  overwrite?: boolean;
}

export function levelWriterPlugin(): Plugin {
  return {
    name: 'one-word:level-writer',
    apply: 'serve',
    configureServer(server) {
      const dir = path.resolve(server.config.root, 'src/levels/definitions');

      server.middlewares.use(SAVE_ENDPOINT, (req, res) => {
        const send = (status: number, body: Record<string, unknown>) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: 'POST only' });

        let raw = '';
        req.on('data', (chunk: Buffer) => { raw += chunk; });
        req.on('end', () => {
          let body: SaveRequest;
          try {
            body = JSON.parse(raw) as SaveRequest;
          } catch {
            return send(400, { error: 'invalid JSON' });
          }
          if (!LEVEL_FILE_NAME.test(body.fileName)) {
            return send(400, { error: `file name must look like 06-my-level.ts (got "${body.fileName}")` });
          }
          const file = path.join(dir, body.fileName);
          if (existsSync(file) && !body.overwrite) {
            return send(409, { error: `${body.fileName} already exists` });
          }
          mkdirSync(dir, { recursive: true });
          writeFileSync(file, body.source, 'utf8');
          send(200, { path: `src/levels/definitions/${body.fileName}` });
        });
      });
    },
  };
}
