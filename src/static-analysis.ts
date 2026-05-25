import axios from "axios";
import { readFileSync } from "fs";
import { info, warning } from "@actions/core";
import { FileDiff } from "./diff";
import { AIComment, PullRequestSummary } from "./prompts";
import config from "./config";

/**
 * Static analysis module powered by SonarCloud.
 * SonarCloud runs the rule engine; this file adapts its JSON output to the
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

type SonarCloudSeverity = "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO" | string;

type SonarCloudIssue = {
  key: string;
  rule?: string;
  severity?: SonarCloudSeverity;
  component: string;
  line?: number;
  message?: string;
  type?: string;
  textRange?: {
    startLine?: number;
    endLine?: number;
  };
};

type SonarCloudOutput = {
  issues?: SonarCloudIssue[];
  total?: number;
};

type LineRange = { start: number; end: number };

const SONARCLOUD_URL = config.sonarcloudUrl || "https://sonarcloud.io";

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
  finding: SonarCloudIssue,
  changedRanges: Map<string, LineRange[]>
): boolean {
  const fileRanges = changedRanges.get(normalizePath(normalizeSonarComponent(finding.component)));
  if (!fileRanges || fileRanges.length === 0) {
    return false;
  }

  const startLine = finding.textRange?.startLine ?? finding.line ?? 0;
  const endLine = finding.textRange?.endLine ?? startLine;
  return fileRanges.some(
    (range) => endLine >= range.start && startLine <= range.end
  );
}

function normalizeSonarComponent(component: string): string {
  const normalized = normalizePath(component);
  const colonIndex = normalized.indexOf(":");
  return colonIndex >= 0 ? normalized.slice(colonIndex + 1) : normalized;
}

function isScannable(filename: string): boolean {
  // Only scan source code files, exclude config/docs
  const scannableExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.go', '.rb', '.php',
    '.cs', '.cpp', '.c', '.swift', '.kt', '.scala', '.rs', '.sh', '.bash'
  ];
  const filename_lower = filename.toLowerCase();
  // Ignore hidden files or files inside hidden directories (prefix '.')
  const parts = normalizePath(filename).split('/');
  for (const p of parts) {
    if (p.startsWith('.') && p.length > 1) return false;
  }

  // Common directories we should skip entirely
  const ignoredDirs = new Set([
    'node_modules',
    'dist',
    'build',
    'coverage',
    'vendor',
    '__pycache__',
    '.venv',
    'third_party',
    'out',
  ]);
  if (parts.some(p => ignoredDirs.has(p))) return false;

  // Skip minified files, type declaration files and source maps
  if (filename_lower.includes('.min.')) return false;
  if (filename_lower.endsWith('.map')) return false;
  if (filename_lower.endsWith('.d.ts')) return false;

  return scannableExtensions.some(ext => filename_lower.endsWith(ext));
}

function parseSonarCloudOutput(output: string): SonarCloudIssue[] | null {
  if (!output.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(output) as SonarCloudOutput;
    return parsed.issues ?? [];
  } catch {
    return null;
  }
}

function readGitHubEventPullRequestNumber(): number | null {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return null;
  }

  try {
    const payload = JSON.parse(readFileSync(eventPath, "utf8")) as {
      pull_request?: { number?: number };
    };
    return payload.pull_request?.number ?? null;
  } catch {
    return null;
  }
}

function runSonarCloud(files: FileDiff[]): Promise<SonarCloudIssue[]> {
  const scanTargets = files
    .filter((file) => file.status !== "removed" && file.hunks.length > 0 && isScannable(file.filename))
    .map((file) => file.filename);

  if (scanTargets.length === 0) {
    info("SonarCloud skipped: no scannable file targets found");
    return Promise.resolve([]);
  }

  const token = config.sonarcloudToken;
  const projectKey = config.sonarcloudProjectKey;
  const organization = config.sonarcloudOrganization;
  const pullRequestNumber = readGitHubEventPullRequestNumber();

  if (!token || !projectKey || !organization || !pullRequestNumber) {
    warning(
      "SonarCloud analysis skipped: missing SONARCLOUD_TOKEN, SONARCLOUD_ORGANIZATION, SONARCLOUD_PROJECT_KEY or pull request number"
    );
    return Promise.resolve([]);
  }

  info(
    `Running SonarCloud with ${scanTargets.length} target(s) for ${projectKey} in organization ${organization}`
  );
  info(`SonarCloud targets: ${scanTargets.join(", ")}`);

  const endpoint = new URL("/api/issues/search", SONARCLOUD_URL);
  endpoint.searchParams.set("organization", organization);
  endpoint.searchParams.set("componentKeys", projectKey);
  endpoint.searchParams.set("pullRequest", String(pullRequestNumber));
  endpoint.searchParams.set("resolved", "false");
  endpoint.searchParams.set("ps", "500");

  return axios
    .get(endpoint.toString(), {
      auth: {
        username: token,
        password: "",
      },
      timeout: 30000,
    })
    .then((response) => {
      const parsed = response.data as SonarCloudOutput;
      const issues = parsed.issues ?? [];
      info(`SonarCloud scan completed successfully with ${issues.length} finding(s)`);
      return issues;
    })
    .catch((error) => {
      const responseText =
        error && typeof error === "object" && "response" in error
          ? JSON.stringify((error as { response?: { data?: unknown } }).response?.data ?? "")
          : "";
      const parsed = parseSonarCloudOutput(responseText);
      if (parsed) {
        info(`SonarCloud returned parseable JSON with ${parsed.length} finding(s)`);
        return parsed;
      }

      warning(
        `SonarCloud analysis failed, continuing without findings: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    });
}

function isSecurityFinding(finding: SonarCloudIssue): boolean {
  const text = `${finding.key} ${finding.rule ?? ""} ${finding.message ?? ""} ${finding.type ?? ""}`.toLowerCase();
  return /sql|xss|csrf|injection|secret|credential|token|auth|ssrf|path traversal|insecure|vulnerab|security/.test(
    text
  );
}

function deriveLabel(finding: SonarCloudIssue): string {
  const text = `${finding.key} ${finding.rule ?? ""} ${finding.message ?? ""} ${finding.type ?? ""}`.toLowerCase();

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
  if ((finding.severity || "").toUpperCase() === "BLOCKER" || (finding.severity || "").toUpperCase() === "CRITICAL") {
    return "possible bug";
  }

  return "best practice";
}

function toComment(finding: SonarCloudIssue): AIComment {
  const severity = (finding.severity || "MAJOR").toUpperCase();
  const highlightedCode = (finding.message || finding.rule || finding.key)
    .trim();

  return {
    file: normalizePath(normalizeSonarComponent(finding.component)),
    start_line: finding.textRange?.startLine ?? finding.line ?? 1,
    end_line: finding.textRange?.endLine ?? finding.textRange?.startLine ?? finding.line ?? 1,
    highlighted_code: highlightedCode,
    header: `SonarCloud: ${finding.rule ?? finding.key}`,
    content: finding.message?.trim() || `Achado identificado por ${finding.rule ?? finding.key}`,
    label: deriveLabel(finding),
    critical: severity === "BLOCKER" || severity === "CRITICAL" || isSecurityFinding(finding),
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
 * Main static analysis function powered by SonarCloud.
 */
export async function performStaticAnalysis(files: FileDiff[]): Promise<StaticAnalysisResult> {
  const changedRanges = buildChangedLineRanges(files);
  const findings = (await runSonarCloud(files)).filter((finding) =>
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
          : "Nenhuma vulnerabilidade obvia detectada",
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
      title = `Adicionar testes para ${modifiedFiles.length} modulo(s)`;
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
        unchanged: "Sem alteracoes",
      };

      const hunksCount = f.hunks.length;
      const totalLines = f.hunks.reduce((sum, h) => sum + h.diff.split("\n").length, 0);

      let summary = `${statusMap[f.status] || f.status}.`;
      if (hunksCount > 0) {
        summary += ` Alteracoes em ${hunksCount} trecho(s) com aproximadamente ${totalLines} linha(s).`;
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






