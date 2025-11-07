/** @module omega-target-chromium-extension/chrome_port */

// A wrapper around type Port in Chromium Extension API.
// https://developer.chrome.com/extensions/runtime#type-Port
//
// Please wrap any Port object in this class BEFORE adding listeners. Adding
// listeners to events of raw Port objects should be avoided to minimize the risk
// of memory leaks. See the comments of the TrackedEvent class for more details.

class TrackedEvent {
  private callbacks: Function[] = [];
  private event: chrome.events.Event<any> | null;

  constructor(event: chrome.events.Event<any>) {
    this.event = event;
    const methods = ['hasListener', 'hasListeners', 'addRules', 'getRules', 'removeRules'];
    
    for (const methodName of methods) {
      const method = (event as any)[methodName];
      if (method) {
        (this as any)[methodName] = method.bind(event);
      }
    }
  }

  addListener(callback: Function): this {
    if (this.event) {
      (this.event as any).addListener(callback);
      this.callbacks.push(callback);
    }
    return this;
  }

  removeListener(callback: Function): this {
    if (this.event) {
      (this.event as any).removeListener(callback);
      const i = this.callbacks.indexOf(callback);
      if (i >= 0) {
        this.callbacks.splice(i, 1);
      }
    }
    return this;
  }

  /**
   * Removes all listeners added via this TrackedEvent instance.
   * Note: Won't remove listeners added via other TrackedEvent or raw Event.
   */
  removeAllListeners(): this {
    if (this.event) {
      for (const callback of this.callbacks) {
        (this.event as any).removeListener(callback);
      }
    }
    this.callbacks = [];
    return this;
  }

  /**
   * Removes all listeners added via this TrackedEvent instance and prevent any
   * further listeners from being added. It is considered safe to nullify any
   * references to this instance and the underlying Event without causing leaks.
   * This should be the last method called in the lifetime of TrackedEvent.
   *
   * Throws if the underlying raw Event object still has listeners. This can
   * happen when listeners have been added via other TrackedEvents or raw Event.
   */
  dispose(): void {
    this.removeAllListeners();
    if (this.event && (this.event as any).hasListeners?.()) {
      throw new Error("Underlying Event still has listeners!");
    }
    this.event = null;
    this.callbacks = [];
  }
}

class ChromePort {
  name: string;
  sender?: chrome.runtime.MessageSender;
  onMessage: TrackedEvent;
  onDisconnect: TrackedEvent;
  disconnect: () => void;
  postMessage: (...args: any[]) => void;
  
  private port: chrome.runtime.Port;

  constructor(port: chrome.runtime.Port) {
    this.port = port;
    this.name = port.name;
    this.sender = port.sender;

    this.disconnect = port.disconnect.bind(port);
    this.postMessage = (...args: any[]) => {
      try {
        this.port.postMessage(...args);
      } catch (e) {
        return;
      }
    };

    this.onMessage = new TrackedEvent(port.onMessage);
    this.onDisconnect = new TrackedEvent(port.onDisconnect);
    this.onDisconnect.addListener(this.dispose.bind(this));
  }

  dispose(): void {
    this.onMessage.dispose();
    this.onDisconnect.dispose();
  }
}

export = ChromePort;
