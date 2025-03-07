declare module 'ip-address' {
  export namespace v4 {
    export class Address {
      constructor(address: string);
      isValid(): boolean;
      correctForm(): string;
      canonicalForm(): string;
    }
  }

  export namespace v6 {
    export class Address {
      constructor(address: string);
      isValid(): boolean;
      correctForm(): string;
      canonicalForm(): string;
      endAddress(): Address;
    }
  }
} 