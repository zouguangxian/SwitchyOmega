declare module 'uglify-js' {
  interface CompressorOptions {
    warnings?: boolean;
    keep_fargs?: boolean;
    if_return?: boolean;
  }

  export interface AST_Node {
    start?: {
      _comments_dumped?: boolean;
      comments_before?: Array<{ type: string; value: string }>;
    };
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  interface AST_ObjectKeyVal extends AST_Node {
    key: string;
    value: AST_Node;
  }

  export class AST_Function implements AST_Node {
    constructor(props: { argnames: AST_Node[]; body: AST_Node[] });
    argnames: AST_Node[];
    body: AST_Node[];
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_SymbolFunarg implements AST_Node {
    constructor(props: { name: string });
    name: string;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_Return implements AST_Node {
    constructor(props: { value: AST_Node });
    value: AST_Node;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_Directive implements AST_Node {
    constructor(props: { value: string });
    value: string;
  }

  export class AST_Var implements AST_Node {
    constructor(props: { definitions: AST_VarDef[] });
    definitions: AST_VarDef[];
  }

  export class AST_VarDef implements AST_Node {
    constructor(props: { name: AST_SymbolVar; value: AST_Node });
    name: AST_SymbolVar;
    value: AST_Node;
  }

  export class AST_SymbolVar implements AST_Node {
    constructor(props: { name: string });
    name: string;
  }

  export class AST_SymbolRef implements AST_Node {
    constructor(props: { name: string });
    name: string;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_Call implements AST_Node {
    constructor(props: { args: AST_Node[]; expression: AST_Node });
    args: AST_Node[];
    expression: AST_Node;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_Dot implements AST_Node {
    constructor(props: { property: string; expression: AST_Node });
    property: string;
    expression: AST_Node;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_Number implements AST_Node {
    constructor(props: { value: number });
    value: number;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_String implements AST_Node {
    constructor(props: { value: string });
    value: string;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_Do implements AST_Node {
    constructor(props: { body: AST_BlockStatement; condition: AST_Node });
    body: AST_BlockStatement;
    condition: AST_Node;
  }

  export class AST_BlockStatement implements AST_Node {
    constructor(props: { body: AST_Node[] });
    body: AST_Node[];
  }

  export class AST_SimpleStatement implements AST_Node {
    constructor(props: { body: AST_Node });
    body: AST_Node;
  }

  export class AST_Assign implements AST_Node {
    constructor(props: { left: AST_Node; operator: string; right: AST_Node });
    left: AST_Node;
    operator: string;
    right: AST_Node;
  }

  export class AST_Sub implements AST_Node {
    constructor(props: { expression: AST_Node; property: AST_Node });
    expression: AST_Node;
    property: AST_Node;
  }

  export class AST_If implements AST_Node {
    constructor(props: { condition: AST_Node; body: AST_Node });
    condition: AST_Node;
    body: AST_Node;
  }

  export class AST_Binary implements AST_Node {
    constructor(props: { left: AST_Node; operator: string; right: AST_Node });
    left: AST_Node;
    operator: string;
    right: AST_Node;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_UnaryPrefix implements AST_Node {
    constructor(props: { operator: string; expression: AST_Node });
    operator: string;
    expression: AST_Node;
  }

  export class AST_Object implements AST_Node {
    constructor(props: { properties: AST_ObjectKeyVal[] });
    properties: AST_ObjectKeyVal[];
  }

  export class AST_RegExp implements AST_Node {
    constructor(props: { value: string });
    value: string;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_True implements AST_Node {
    constructor();
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_False implements AST_Node {
    constructor();
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  export class AST_New implements AST_Node {
    constructor(props: { args: AST_Node[]; expression: AST_Node });
    args: AST_Node[];
    expression: AST_Node;
    figure_out_scope(): void;
    transform(compressor: any): AST_Node;
    compute_char_frequency(): void;
    mangle_names(): void;
    print_to_string(options?: { beautify?: boolean; comments?: boolean }): string;
  }

  function Compressor(options: CompressorOptions): any;

  class AST_ObjectKeyVal {
    constructor(props: { key: string; value: AST_Node });
    key: string;
    value: AST_Node;
  }

  class AST_Toplevel implements AST_Node {
    constructor(props: { body: AST_Node[] });
    body: AST_Node[];
  }
} 