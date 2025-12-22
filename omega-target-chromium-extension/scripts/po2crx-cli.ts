#!/usr/bin/env tsx
import { writeFile, mkdir } from 'fs/promises';
import * as path from 'path';

interface PoMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

type MessagesJson = Record<string, PoMessage>;

async function convertPo2Crx(poFile: string, outputFile: string): Promise<void> {
  const po2json = (await import('po2json')).default;
  const json = po2json.parseFileSync(poFile);
  const result: MessagesJson = {};

  for (const key in json) {
    if (!Object.prototype.hasOwnProperty.call(json, key) || !key) continue;

    const value = json[key];
    let message = value[1];
    const refs: string[] = [];
    let matchCount = 0;

    // Replace $1:ref$ or $ref$ with Chrome extension placeholder format
    message = message.replace(/\$(\d+:)?(\w+)\$/g, (_: string, order: string, ref: string) => {
      matchCount++;
      const orderNum = order ? parseInt(order) : matchCount;
      refs[orderNum] = ref;
      return '$' + ref + '$';
    });

    let placeholders: Record<string, { content: string }> | undefined;
    if (matchCount > 0) {
      placeholders = {};
      for (let i = 0; i < refs.length; i++) {
        const placeholder = refs[i] || ('_unused_' + i);
        placeholders[placeholder] = { content: '$' + i };
      }
    }

    // Handle empty messages
    if (message === ' ') {
      message = '';
    }

    result[key] = {
      message,
      placeholders,
    };
  }

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, JSON.stringify(result, null, 2));
}

async function convertMultiplePo2Crx(
  locales: Array<{ po: string; messages: string }>
): Promise<void> {
  await Promise.all(locales.map(({ po, messages }) => convertPo2Crx(po, messages)));
}

const locales = [
  { po: '../omega-locales/en_US/LC_MESSAGES/omega-web.po', messages: 'build/_locales/en/messages.json' },
  { po: '../omega-locales/zh_CN/LC_MESSAGES/omega-web.po', messages: 'build/_locales/zh/messages.json' },
  { po: '../omega-locales/cs/LC_MESSAGES/omega-web.po', messages: 'build/_locales/cs/messages.json' },
  { po: '../omega-locales/fa/LC_MESSAGES/omega-web.po', messages: 'build/_locales/fa/messages.json' },
  { po: '../omega-locales/zh_CN/LC_MESSAGES/omega-web.po', messages: 'build/_locales/zh_CN/messages.json' },
  { po: '../omega-locales/zh_TW/LC_MESSAGES/omega-web.po', messages: 'build/_locales/zh_TW/messages.json' },
];

console.log('🌐 Converting locale files...');
convertMultiplePo2Crx(locales)
  .then(() => {
    console.log('✅ Locale files ready');
  })
  .catch((err) => {
    console.error('❌ Locale conversion failed:', err);
    process.exit(1);
  });

