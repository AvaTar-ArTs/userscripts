import { registerAdapter } from '../core/registry.js';
import chatgpt from './chatgpt.js';
import claude from './claude.js';
import gemini from './gemini.js';
import grok from './grok.js';
import deepseek from './deepseek.js';
import kimi from './kimi.js';
import qwen from './qwen.js';
import notebooklm from './notebooklm.js';
import suno from './suno.js';
import ideogram from './ideogram.js';

export const allAdapters = [chatgpt, claude, gemini, grok, deepseek, kimi, qwen, notebooklm, suno, ideogram];
allAdapters.forEach(registerAdapter);

export { chatgpt, claude, gemini, grok, deepseek, kimi, qwen, notebooklm, suno, ideogram };
