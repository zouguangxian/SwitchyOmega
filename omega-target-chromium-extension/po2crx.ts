import { writeFile, mkdir } from 'fs/promises';
import * as path from 'path';

interface PoMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

type MessagesJson = Record<string, PoMessage>;

/**
 * Convert a PO (gettext) file to Chrome extension messages.json format
 */
export async function convertPo2Crx(poFile: string, outputFile: string): Promise<void> {
  const po2json = (await import('po2json')).default;
  const json = po2json.parseFileSync(poFile);
  const result: MessagesJson = {};
  
  for (const key in json) {
    if (!json.hasOwnProperty(key) || !key) continue;
    
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
      message: message,
      placeholders: placeholders
    };
  }
  
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, JSON.stringify(result, null, 2));
}

/**
 * Convert multiple PO files to Chrome extension messages.json format
 */
export async function convertMultiplePo2Crx(
  locales: Array<{ po: string; messages: string }>
): Promise<void> {
  await Promise.all(
    locales.map(({ po, messages }) => convertPo2Crx(po, messages))
  );
}

