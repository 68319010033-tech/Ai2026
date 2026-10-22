import { createApp } from './app.js';
import { CONFIG } from './config.js';

createApp().listen(CONFIG.port, '0.0.0.0', () => console.log(`Smart Campus API listening on :${CONFIG.port}`));
