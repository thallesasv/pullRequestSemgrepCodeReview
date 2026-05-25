/// <reference types="jest" />

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

jest.mock('fs', () => ({
  mkdtempSync: jest.fn(() => '/tmp/semgrep-review-test'),
  readFileSync: jest.fn(),
}));

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

import { execFileSync } from 'child_process';
import { info, warning } from '@actions/core';
import { readFileSync } from 'fs';
import { performStaticAnalysis } from '../static-analysis';
import { FileDiff } from '../diff';

const execFileSyncMock = execFileSync as jest.Mock;
const infoMock = info as jest.Mock;
const warningMock = warning as jest.Mock;
const readFileSyncMock = readFileSync as jest.Mock;

describe('Semgrep static analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('converts Semgrep findings into review comments and metrics', () => {
    const semgrepOutput = {
      results: [
        {
          check_id: 'typescript.security.detect-child-process',
          path: 'src/app.ts',
          start: { line: 3 },
          end: { line: 3 },
          extra: {
            message: 'Possible command injection sink detected',
            severity: 'ERROR',
            lines: 'child_process.exec(userInput);',
          },
        },
        {
          check_id: 'typescript.best-practice.console-log',
          path: 'src/app.ts',
          start: { line: 20 },
          end: { line: 20 },
          extra: {
            message: 'Avoid console.log in production code',
            severity: 'WARNING',
            lines: 'console.log(result);',
          },
        },
        {
          check_id: 'typescript.security.unrelated',
          path: 'src/app.ts',
          start: { line: 80 },
          end: { line: 80 },
          extra: {
            message: 'This finding is outside the changed lines',
            severity: 'ERROR',
            lines: 'dangerousCall();',
          },
        },
      ],
    };

    execFileSyncMock.mockReturnValue('');
    readFileSyncMock.mockReturnValue(JSON.stringify(semgrepOutput));

    const files: FileDiff[] = [
      {
        filename: 'src/app.ts',
        status: 'modified',
        hunks: [
          { startLine: 1, endLine: 10, diff: '@@ -1,5 +1,10 @@\n+child_process.exec(userInput);\n+console.log(result);' },
          { startLine: 15, endLine: 25, diff: '@@ -15,3 +15,12 @@\n+console.log(result);' },
        ],
      },
    ];

    const result = performStaticAnalysis(files);

    expect(execFileSyncMock).toHaveBeenCalledWith(
      'semgrep',
      expect.arrayContaining(['scan', '--config', 'p/default', '--json-output']),
      expect.objectContaining({ cwd: expect.any(String) })
    );
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toMatchObject({
      file: 'src/app.ts',
      start_line: 3,
      end_line: 3,
      label: 'security',
      critical: true,
    });
    expect(result.issues[1]).toMatchObject({
      file: 'src/app.ts',
      start_line: 20,
      end_line: 20,
      label: 'best practice',
      critical: false,
    });
    expect(result.metrics.hasRelevantTests).toBe(false);
    expect(result.metrics.securityConcerns).toContain('Possible command injection sink detected');
    expect(infoMock).toHaveBeenCalledWith('Running Semgrep with 1 target(s) using config p/default');
    expect(infoMock).toHaveBeenCalledWith('Semgrep targets: src/app.ts');
    expect(infoMock).toHaveBeenCalledWith('Semgrep scan completed successfully with 3 finding(s)');
  });

  test('parses Semgrep JSON even when the process exits non-zero', () => {
    const semgrepOutput = {
      results: [
        {
          check_id: 'typescript.security.detect-child-process',
          path: 'src/app.ts',
          start: { line: 3 },
          end: { line: 3 },
          extra: {
            message: 'Possible command injection sink detected',
            severity: 'ERROR',
            lines: 'child_process.exec(userInput);',
          },
        },
      ],
    };

    const error = new Error('Command failed: semgrep scan') as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    error.code = 2;
    error.stdout = JSON.stringify(semgrepOutput);
    error.stderr = 'warning: partial scan output';

    execFileSyncMock.mockImplementation(() => {
      throw error;
    });
    readFileSyncMock.mockReturnValue(JSON.stringify(semgrepOutput));

    const files: FileDiff[] = [
      {
        filename: 'src/app.ts',
        status: 'modified',
        hunks: [
          { startLine: 1, endLine: 10, diff: '@@ -1,5 +1,10 @@\n+child_process.exec(userInput);' },
        ],
      },
    ];

    const result = performStaticAnalysis(files);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      file: 'src/app.ts',
      start_line: 3,
      end_line: 3,
      label: 'security',
      critical: true,
    });
    expect(infoMock).toHaveBeenCalledWith(
      'Semgrep returned parseable JSON output file with 1 finding(s)'
    );
  });

  test('ignores hidden files and directories when building Semgrep targets', () => {
    const semgrepOutput = {
      results: [] as any[],
    };

    execFileSyncMock.mockReturnValue('');
    readFileSyncMock.mockReturnValue(JSON.stringify(semgrepOutput));

    const files: FileDiff[] = [
      {
        filename: '.github/secret.py',
        status: 'modified',
        hunks: [
          { startLine: 1, endLine: 2, diff: '@@ -1,1 +1,2 @@\n+print(1)' },
        ],
      },
      {
        filename: 'src/app.ts',
        status: 'modified',
        hunks: [
          { startLine: 1, endLine: 10, diff: '@@ -1,5 +1,10 @@\n+child_process.exec(userInput);' },
        ],
      },
    ];

    const result = performStaticAnalysis(files);

    // Should only pass the visible src/app.ts to Semgrep
    expect(infoMock).toHaveBeenCalledWith('Running Semgrep with 1 target(s) using config p/default');
    expect(infoMock).toHaveBeenCalledWith('Semgrep targets: src/app.ts');
    expect(result.issues).toHaveLength(0);
  });

  test('ignores generated and third-party directories and non-important files', () => {
    const semgrepOutput = { results: [] as any[] };

    execFileSyncMock.mockReturnValue('');
    readFileSyncMock.mockReturnValue(JSON.stringify(semgrepOutput));

    const files: FileDiff[] = [
      { filename: 'node_modules/lib/index.js', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+a' }] },
      { filename: 'dist/bundle.js', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+b' }] },
      { filename: 'src/app.min.js', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+c' }] },
      { filename: 'src/types.d.ts', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+d' }] },
      { filename: 'src/app.js', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+e' }] },
    ];

    const result = performStaticAnalysis(files);

    expect(infoMock).toHaveBeenCalledWith('Running Semgrep with 1 target(s) using config p/default');
    expect(infoMock).toHaveBeenCalledWith('Semgrep targets: src/app.js');
    expect(result.issues).toHaveLength(0);
  });
});
