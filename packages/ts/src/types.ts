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

export interface Result {
  valid: boolean;          // true iff no errors
  errors: Issue[];
  warnings: Issue[];
  summary: { errors: number; warnings: number };
}

export type OcfDoc = Record<string, unknown>;
