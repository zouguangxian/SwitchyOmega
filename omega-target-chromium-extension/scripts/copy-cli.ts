#!/usr/bin/env tsx
import { copyAllFiles } from '../copy';

copyAllFiles().catch((err) => {
  console.error('❌ Copy failed:', err);
  process.exit(1);
});

