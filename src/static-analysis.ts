import { execFileSync } from "child_process";
import { warning } from "@actions/core";
import { FileDiff } from "./diff";
import { AIComment, PullRequestSummary } from "./prompts";

/**
 * Static analysis module powered by Semgrep.
 * Semgrep runs the rule engine; this file adapts its JSON output to the
 * comment and summary format used by the GitHub review flow.
 */

export interface StaticAnalysisResult {
  issues: AIComment[];
  metrics: {
    estimatedEffortToReview: number;
    qualityScore: number;
    hasRelevantTests: boolean;
    securityConcerns: string;
  };
}

type SemgrepSeverity = "INFO" | "WARNING" | "ERROR" | string;

type SemgrepFinding = {
  check_id: string;
  path: string;
  start?: { line?: number };
  end?: { line?: number };
  extra?: {
    message?: string;
    severity?: SemgrepSeverity;
    lines?: string;
    metadata?: Record<string, unknown>;
  };
};

type SemgrepOutput = {
  results?: SemgrepFinding[];
  errors?: unknown[];
};

type LineRange = { start: number; end: number };

const SEMGREP_CONFIG = process.env.SEMGREP_CONFIG || "p/default";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function buildChangedLineRanges(files: FileDiff[]): Map<string, LineRange[]> {
  const rangesByFile = new Map<string, LineRange[]>();

  for (const file of files) {
    if (file.status === "removed") continue;

    const ranges = file.hunks.map((hunk) => ({
      start: hunk.startLine,
      end: hunk.endLine,
    }));

    rangesByFile.set(normalizePath(file.filename), ranges);
  }

  return rangesByFile;
}

function isFindingInChangedLines(
  finding: SemgrepFinding,
  changedRanges: Map<string, LineRange[]>
): boolean {
  const fileRanges = changedRanges.get(normalizePath(finding.path));
  if (!fileRanges || fileRanges.length === 0) {
    return false;
  }

  const startLine = finding.start?.line ?? finding.end?.line ?? 0;
  const endLine = finding.end?.line ?? startLine;
  return fileRanges.some(
    (range) => endLine >= range.start && startLine <= range.end
  );
}

function isScannable(filename: string): boolean {
  // Only scan source code files, exclude config/docs
  const scannableExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.go', '.rb', '.php',
    '.cs', '.cpp', '.c', '.swift', '.kt', '.scala', '.rs', '.sh', '.bash'
  ];
  const filename_lower = filename.toLowerCase();
  return scannableExtensions.some(ext => filename_lower.endsWith(ext));
}

function runSemgrep(files: FileDiff[]): SemgrepFinding[] {
  const scanTargets = files
    .filter((file) => file.status !== "removed" && file.hunks.length > 0 && isScannable(file.filename))
    .map((file) => file.filename);

  if (scanTargets.length === 0) {
    return [];
  }

  try {
    const output = execFileSync(
      "semgrep",
      [
        "scan",
        "--config",
        SEMGREP_CONFIG,
        "--json",
        "--quiet",
        "--metrics=off",
        "--disable-version-check",
        ...scanTargets,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      }
    );

    const parsed = JSON.parse(output) as SemgrepOutput;
    return parsed.results ?? [];
  } catch (error) {
    if (error && typeof error === "object") {
      const execError = error as Error & { stdout?: string; stderr?: string };
      const details = [execError.message, execError.stderr, execError.stdout]
        .filter(Boolean)
        .join("\n")
        .trim();

      throw new Error(
        `Semgrep analysis failed: ${details || String(error)}`
      );
    }

    throw new Error(`Semgrep analysis failed: ${String(error)}`);
  }
}

function isSecurityFinding(finding: SemgrepFinding): boolean {
  const text = `${finding.check_id} ${finding.extra?.message ?? ""}`.toLowerCase();
  return /sql|xss|csrf|injection|secret|credential|token|auth|ssrf|path traversal|insecure|vulnerab/.test(
    text
  );
}

function deriveLabel(finding: SemgrepFinding): string {
  const text = `${finding.check_id} ${finding.extra?.message ?? ""}`.toLowerCase();

  if (isSecurityFinding(finding)) {
    return "security";
  }
  if (/performance|slow|optimi[sz]e|complex/.test(text)) {
    return "performance";
  }
  if (/todo|fixme|hack|xxx/.test(text)) {
    return "documentation";
  }
  if (/unused|dead code|duplicate|duplica/.test(text)) {
    return "best practice";
  }
  if ((finding.extra?.severity || "").toUpperCase() === "ERROR") {
    return "possible bug";
  }

  return "best practice";
}

function toComment(finding: SemgrepFinding): AIComment {
  const severity = (finding.extra?.severity || "WARNING").toUpperCase();
  const highlightedCode = (finding.extra?.lines || finding.extra?.message || finding.check_id)
    .trim();

  return {
    file: normalizePath(finding.path),
    start_line: finding.start?.line ?? finding.end?.line ?? 1,
    end_line: finding.end?.line ?? finding.start?.line ?? 1,
    highlighted_code: highlightedCode,
    header: `Semgrep: ${finding.check_id}`,
    content: finding.extra?.message?.trim() || `Achado identificado por ${finding.check_id}`,
    label: deriveLabel(finding),
    critical: severity === "ERROR" || isSecurityFinding(finding),
  };
}

function hasRelevantTests(files: FileDiff[]): boolean {
  const sourceFiles = files.filter(
    (f) =>
      !f.filename.includes(".test.") &&
      !f.filename.includes(".spec.") &&
      f.status !== "removed"
  );

  const testFiles = files.filter(
    (f) =>
      (f.filename.includes(".test.") || f.filename.includes(".spec.")) &&
      f.status !== "removed"
  );

  if (testFiles.length === 0 && sourceFiles.length > 0) {
    return false;
  }

  return testFiles.length > 0;
}

function calculateMetrics(files: FileDiff[], comments: AIComment[]) {
  const criticalIssues = comments.filter((c) => c.critical).length;
  const warningIssues = comments.length - criticalIssues;

  let score = Math.max(0, 100 - criticalIssues * 20 - warningIssues * 8);

  const hunksCount = files.reduce((sum, f) => sum + f.hunks.length, 0);
  let effort = Math.ceil((hunksCount + comments.length) / 4);
  if (effort > 5) effort = 5;
  if (criticalIssues > 4) effort = 5;

  return {
    score: Math.round(score),
    effort,
  };
}

/**
 * Main static analysis function powered by Semgrep.
 */
export function performStaticAnalysis(files: FileDiff[]): StaticAnalysisResult {
  const changedRanges = buildChangedLineRanges(files);
  const findings = runSemgrep(files).filter((finding) =>
    isFindingInChangedLines(finding, changedRanges)
  );

  const comments = findings.map(toComment);
  const metrics = calculateMetrics(files, comments);
  const securityFindings = comments.filter((comment) => comment.label === "security");

  return {
    issues: comments,
    metrics: {
      estimatedEffortToReview: metrics.effort,
      qualityScore: metrics.score,
      hasRelevantTests: hasRelevantTests(files),
      securityConcerns:
        securityFindings.length > 0
          ? securityFindings.map((comment) => comment.content).join("; ")
          : "Nenhuma vulnerabilidade Ã³bvia detectada",
    },
  };
}

/**
 * Generates a summary based on file statistics.
 */
export function generateSummaryFromDiff(
  files: FileDiff[],
  prTitle: string,
  prDescription: string,
  commitMessages: string[]
): PullRequestSummary {
  const addedFiles = files.filter((f) => f.status === "added");
  const modifiedFiles = files.filter((f) => f.status === "modified");
  const removedFiles = files.filter((f) => f.status === "removed");
  const renamedFiles = files.filter((f) => f.status === "renamed");

  const types: string[] = [];
  const allDiff = files.map((f) => f.hunks.map((h) => h.diff).join("\n")).join("\n");

  if (
    /test|spec|jest|mocha/gi.test(allDiff) ||
    files.some((f) => f.filename.includes(".test.") || f.filename.includes(".spec."))
  ) {
    types.push("TESTS");
  }
  if (/security|auth|password|token|encrypt/gi.test(allDiff)) {
    types.push("SECURITY");
  }
  if (/performance|cache|optimize|speed/gi.test(allDiff)) {
    types.push("ENHANCEMENT");
  }
  if (/bug|fix|error|issue|broken/gi.test(allDiff)) {
    types.push("BUG");
  }
  if (/doc|readme|comment|documentation/gi.test(allDiff)) {
    types.push("DOCUMENTATION");
  }
  if (types.length === 0) {
    types.push("ENHANCEMENT");
  }

  let title = prTitle.replace(/@prreview|@prreviewai|@presubmitai|@presubmit/gi, "").trim();
  if (!title || title.length === 0) {
    if (types.includes("BUG")) {
      title = `Corrigir problema em ${addedFiles.length + modifiedFiles.length} arquivo(s)`;
    } else if (types.includes("TESTS")) {
      title = `Adicionar testes para ${modifiedFiles.length} mÃ³dulo(s)`;
    } else {
      title = `Atualizar ${addedFiles.length + modifiedFiles.length} arquivo(s)`;
    }
  }

  let description = prDescription || "";
  if (!description.trim()) {
    const changes: string[] = [];

    if (addedFiles.length > 0) {
      changes.push(`Adicionado${addedFiles.length > 1 ? "s" : ""} ${addedFiles.length} arquivo(s) novo(s)`);
    }
    if (modifiedFiles.length > 0) {
      changes.push(`Modificado${modifiedFiles.length > 1 ? "s" : ""} ${modifiedFiles.length} arquivo(s)`);
    }
    if (removedFiles.length > 0) {
      changes.push(`Removido${removedFiles.length > 1 ? "s" : ""} ${removedFiles.length} arquivo(s)`);
    }
    if (renamedFiles.length > 0) {
      changes.push(`Renomeado${renamedFiles.length > 1 ? "s" : ""} ${renamedFiles.length} arquivo(s)`);
    }

    description = changes.join(". ");
  }

  const fileSummaries = files
    .filter((f) => f.status !== "removed")
    .map((f) => {
      const statusMap: Record<string, string> = {
        added: "Arquivo novo",
        modified: "Modificado",
        renamed: "Renomeado",
        copied: "Copiado",
        changed: "Alterado",
        unchanged: "Sem alteraÃ§Ãµes",
      };

      const hunksCount = f.hunks.length;
      const totalLines = f.hunks.reduce((sum, h) => sum + h.diff.split("\n").length, 0);

      let summary = `${statusMap[f.status] || f.status}.`;
      if (hunksCount > 0) {
        summary += ` AlteraÃ§Ãµes em ${hunksCount} trecho(s) com aproximadamente ${totalLines} linha(s).`;
      }
      if (f.status === "renamed" && f.previous_filename) {
        summary = `Renomeado de \`${f.previous_filename}\`. ${summary}`;
      }

      return {
        filename: f.filename,
        summary: summary.substring(0, 250),
        title: `${statusMap[f.status] || f.status}: ${f.filename.split("/").pop()}`,
      };
    });

  return {
    title: title.substring(0, 100),
    description: description.substring(0, 500),
    files: fileSummaries,
    type: types,
  };
}


