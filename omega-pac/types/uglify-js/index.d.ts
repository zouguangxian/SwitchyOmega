// Type definitions for uglify-js v2.4.15
// Minimal declarations for what's actually used in the codebase

declare module 'uglify-js' {
  export class AST_Node {
    TYPE?: string;
  }

  export class AST_Token extends AST_Node {}

  export class AST_Symbol extends AST_Token {
    name: string;
  }

  export class AST_SymbolRef extends AST_Symbol {
    constructor(options: { name: string });
  }

  export class AST_SymbolFunarg extends AST_Symbol {
    constructor(options: { name: string });
  }

  export class AST_String extends AST_Token {
    value: string;
    constructor(options: { value: string });
  }

  export class AST_Number extends AST_Token {
    value: number;
    constructor(options: { value: number });
  }

  export class AST_RegExp extends AST_Token {
    value: RegExp;
    constructor(options: { value: RegExp });
  }

  export class AST_True extends AST_Token {
    constructor();
  }

  export class AST_False extends AST_Token {
    constructor();
  }

  export class AST_Binary extends AST_Node {
    left: any;
    operator: string;
    right: any;
    constructor(options: { left: any; operator: string; right: any });
  }

  export class AST_UnaryPrefix extends AST_Node {
    operator: string;
    expression: any;
    constructor(options: { operator: string; expression: any });
  }

  export class AST_Conditional extends AST_Node {
    condition: any;
    consequent: any;
    alternative: any;
    constructor(options: { condition: any; consequent: any; alternative: any });
  }

  export class AST_Call extends AST_Node {
    args: any[];
    expression: any;
    constructor(options: { args: any[]; expression: any });
  }

  export class AST_New extends AST_Node {
    args: any[];
    expression: any;
    constructor(options: { args: any[]; expression: any });
  }

  export class AST_Dot extends AST_Node {
    property: string;
    expression: any;
    constructor(options: { property: string; expression: any });
  }

  export class AST_Sub extends AST_Node {
    property: any;
    expression: any;
    constructor(options: { property: any; expression: any });
  }

  export class AST_Function extends AST_Node {
    argnames: any[];
    body: any[];
    constructor(options: { argnames: any[]; body: any[] });
  }

  export class AST_Return extends AST_Node {
    value: any;
    constructor(options: { value: any });
  }

  export function parse(code: string, options?: any): any;
  export function minify(files: string | string[], options?: any): any;
}

