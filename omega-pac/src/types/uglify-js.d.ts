declare module 'uglify-js' {
  export interface CompressorOptions {
    warnings?: boolean;
    keep_fargs?: boolean;
    if_return?: boolean;
  }

  export interface AstOptions {
    name?: string;
    value?: any;
    key?: string;
    property?: string;
    operator?: string;
    expression?: AST_Node;
    args?: AST_Node[];
    argnames?: AST_Node[];
    body?: AST_Node[] | AST_Node;
    definitions?: AST_Node[];
    properties?: AST_Node[];
    left?: AST_Node;
    right?: AST_Node;
    condition?: AST_Node;
  }

  export interface AST_Node {
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    type?: string;
    value?: any;
  }

  export class AST_True implements AST_Node {
    constructor(options?: AstOptions);
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_False implements AST_Node {
    constructor(options?: AstOptions);
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_String implements AST_Node {
    constructor(options?: AstOptions);
    value: string;
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_Number implements AST_Node {
    constructor(options?: AstOptions);
    value: number;
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_RegExp implements AST_Node {
    constructor(options?: AstOptions);
    value: { source: string; flags: string };
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_SymbolRef implements AST_Node {
    constructor(options?: AstOptions);
    name: string;
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_SymbolFunarg implements AST_Node {
    constructor(options?: AstOptions);
    name: string;
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_Binary implements AST_Node {
    constructor(options?: AstOptions);
    left: AST_Node;
    operator: string;
    right: AST_Node;
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_Call implements AST_Node {
    constructor(options?: AstOptions);
    args: AST_Node[];
    expression: AST_Node;
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_Dot implements AST_Node {
    constructor(options?: AstOptions);
    property: string;
    expression: AST_Node;
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_Function implements AST_Node {
    constructor(options?: AstOptions);
    argnames: AST_SymbolFunarg[];
    body: AST_Node[];
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_Return implements AST_Node {
    constructor(options?: AstOptions);
    value: AST_Node;
    figure_out_scope(): void;
    transform(transformer: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
  }

  export class AST_Toplevel extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_Object extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_ObjectKeyVal extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_Var extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_VarDef extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_SymbolVar extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_Directive extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_UnaryPrefix extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_Sub extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_Assign extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_SimpleStatement extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_BlockStatement extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_If extends AST_Node {
    constructor(options?: AstOptions);
  }
  export class AST_Do extends AST_Node {
    constructor(options?: AstOptions);
  }

  export function Compressor(options: CompressorOptions): any;
} 