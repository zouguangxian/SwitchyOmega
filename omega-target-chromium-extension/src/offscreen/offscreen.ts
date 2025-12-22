/** @module omega-target-chromium-extension/offscreen */

declare const drawOmega: (
  context: CanvasRenderingContext2D,
  colorOrResult: string,
  profileColor?: string,
) => void;

interface DrawIconMessage {
  type: 'drawIcon';
  resultColor: string;
  profileColor?: string;
  size: number;
}

let canvas: HTMLCanvasElement | null = null;
let drawContext: CanvasRenderingContext2D | null = null;

// Initialize canvas
function initCanvas() {
  if (!canvas) {
    canvas = document.getElementById('canvas-icon') as HTMLCanvasElement;
    if (canvas) {
      drawContext = canvas.getContext('2d', { willReadFrequently: true });
    }
  }
}

// Handle messages from service worker
chrome.runtime.onMessage.addListener((message: DrawIconMessage, sender, sendResponse) => {
  if (message.type === 'drawIcon') {
    initCanvas();

    if (!drawContext || !canvas) {
      sendResponse({ error: 'Canvas not available' });
      return;
    }

    const { resultColor, profileColor, size } = message;

    // Set canvas size
    canvas.width = size;
    canvas.height = size;

    // Clear canvas
    drawContext.clearRect(0, 0, size, size);

    // Draw the icon
    try {
      drawOmega(drawContext, resultColor, profileColor);

      // Get image data
      const imageData = drawContext.getImageData(0, 0, size, size);

      // Convert to transferable format
      const data = Array.from(imageData.data);

      sendResponse({
        imageData: {
          data: data,
          width: imageData.width,
          height: imageData.height,
        },
      });
    } catch (error) {
      sendResponse({ error: String(error) });
    }

    return true; // Will respond asynchronously
  }
});

// Signal that offscreen document is ready
chrome.runtime.sendMessage({ type: 'offscreenReady' });
