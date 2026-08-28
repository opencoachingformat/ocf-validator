export type Severity = "error" | "warning";

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  path: string;            // JSON-Pointer
  frame?: string;          // human anchor (frame id)
  spec_ref?: string;
  data?: Record<string, unknown>;
}

export interface SchemaBlock {
  validatedAgainst: string;         // schema version actually validated against
  documentDeclared: string | null;  // the doc's $schema URL, if any
  requiredByDoc: string | null;      // the doc's meta.min_schema_version, if any
  match: boolean;                    // major matches AND validatedAgainst >= requiredByDoc
}

export interface Result {
  valid: boolean;          // true iff no errors
  errors: Issue[];
  warnings: Issue[];
  summary: { errors: number; warnings: number };
  schema: SchemaBlock;
}

export type OcfDoc = Record<string, unknown>;
