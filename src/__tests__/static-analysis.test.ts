/// <reference types="jest" />

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

import { execFileSync } from 'child_process';
import { performStaticAnalysis } from '../static-analysis';
import { FileDiff } from '../diff';

const execFileSyncMock = execFileSync as jest.Mock;

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

    execFileSyncMock.mockReturnValue(JSON.stringify(semgrepOutput));

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
      expect.arrayContaining(['scan', '--config', 'p/default', '--json']),
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
  });
});
