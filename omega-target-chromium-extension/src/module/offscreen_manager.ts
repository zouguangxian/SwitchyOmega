/** @module omega-target-chromium-extension/offscreen_manager */

/**
 * Manages offscreen document for canvas operations
 * Required for MV3 since service workers don't have DOM access
 */
class OffscreenManager {
  private creating: Promise<void> | null = null;
  private ready: boolean = false;

  constructor() {
    // Listen for ready message from offscreen document
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'offscreenReady') {
        this.ready = true;
      }
    });
  }

  async ensureOffscreenDocument(): Promise<void> {
    if (this.ready) {
      return;
    }

    if (this.creating) {
      await this.creating;
      return;
    }

    this.creating = (async () => {
      try {
        // Check if offscreen document already exists
        const existingContexts = await chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
        });

        if (existingContexts.length > 0) {
          this.ready = true;
          return;
        }

        // Create offscreen document
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['DISPLAY_MEDIA' as chrome.offscreen.Reason],
          justification: 'Icon generation requires canvas rendering',
        });

        // Wait a bit for the document to be ready
        await new Promise((resolve) => setTimeout(resolve, 100));
        this.ready = true;
      } catch (error) {
        console.error('Failed to create offscreen document:', error);
        throw error;
      } finally {
        this.creating = null;
      }
    })();

    await this.creating;
  }

  async drawIcon(
    resultColor: string,
    profileColor: string | undefined,
    size: number,
  ): Promise<ImageData | null> {
    await this.ensureOffscreenDocument();

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'drawIcon',
          resultColor,
          profileColor,
          size,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error drawing icon:', chrome.runtime.lastError);
            resolve(null);
            return;
          }

          if (response.error) {
            console.error('Offscreen error:', response.error);
            resolve(null);
            return;
          }

          if (response.imageData) {
            // Reconstruct ImageData from transferred data
            const { data, width, height } = response.imageData;
            const uint8Array = new Uint8ClampedArray(data);
            resolve(new ImageData(uint8Array, width, height));
          } else {
            resolve(null);
          }
        },
      );
    });
  }

  async closeOffscreenDocument(): Promise<void> {
    try {
      await chrome.offscreen.closeDocument();
      this.ready = false;
    } catch (error) {
      console.error('Error closing offscreen document:', error);
    }
  }
}

export const offscreenManager = new OffscreenManager();
