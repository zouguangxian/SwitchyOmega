// Type definitions for ip-address v4.x
// Minimal declarations for what's actually used in the codebase

declare module 'ip-address' {
  export namespace v4 {
    class Address {
      constructor(address: string);
      isValid(): boolean;
      correctForm?(): string;
      canonicalForm(): string;
      toArray(): number[];
      toHex(): string;
      startAddress(): Address;
      endAddress(): Address;
    }
  }

  export namespace v6 {
    class Address {
      constructor(address: string);
      isValid(): boolean;
      correctForm?(): string;
      canonicalForm(): string;
      toArray(): number[];
      toHex(): string;
      startAddress(): Address;
      endAddress(): Address;
    }
  }
}

