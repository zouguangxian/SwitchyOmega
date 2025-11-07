#!/usr/bin/env tsx
import { convertMultiplePo2Crx } from '../po2crx';

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

