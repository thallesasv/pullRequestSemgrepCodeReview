/// <reference types="jest" />

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn((filePath: string) => {
    if (filePath.includes('event.json')) {
      return JSON.stringify({ pull_request: { number: 123 } });
    }
    return '';
  }),
}));

jest.mock('../config', () => ({
  __esModule: true,
  default: {
    githubToken: 'mock-token',
    styleGuideRules: '',
    githubApiUrl: 'https://api.github.com',
    githubServerUrl: 'https://github.com',
    sonarcloudToken: 'sonar-token',
    sonarcloudOrganization: 'my-org',
    sonarcloudProjectKey: 'my-project',
    sonarcloudUrl: 'https://sonarcloud.io',
    loadInputs: jest.fn(),
  },
}));

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

import axios from 'axios';
import { info, warning } from '@actions/core';
import { performStaticAnalysis } from '../static-analysis';
import { FileDiff } from '../diff';

const axiosGetMock = (axios as { get: jest.Mock }).get;
const infoMock = info as jest.Mock;
const warningMock = warning as jest.Mock;

describe('SonarCloud static analysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_EVENT_PATH = 'C:/temp/event.json';
  });

  test('converts SonarCloud issues into review comments and metrics', async () => {
    axiosGetMock.mockResolvedValue({
      data: {
        issues: [
          {
            key: 'ISSUE-1',
            rule: 'typescript:S4721',
            component: 'my-project:src/app.ts',
            line: 3,
            message: 'Possible command injection sink detected',
            severity: 'CRITICAL',
            type: 'VULNERABILITY',
          },
          {
            key: 'ISSUE-2',
            rule: 'typescript:S106',
            component: 'my-project:src/app.ts',
            line: 20,
            message: 'Avoid console.log in production code',
            severity: 'MAJOR',
            type: 'CODE_SMELL',
          },
          {
            key: 'ISSUE-3',
            rule: 'typescript:S9999',
            component: 'my-project:src/app.ts',
            line: 80,
            message: 'This finding is outside the changed lines',
            severity: 'CRITICAL',
            type: 'VULNERABILITY',
          },
        ],
      },
    });

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

    const result = await performStaticAnalysis(files);

    expect(axiosGetMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/issues/search'),
      expect.objectContaining({
        auth: { username: 'sonar-token', password: '' },
      })
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
    expect(infoMock).toHaveBeenCalledWith('Running SonarCloud with 1 target(s) for my-project in organization my-org');
    expect(infoMock).toHaveBeenCalledWith('SonarCloud scan completed successfully with 3 finding(s)');
  });

  test('parses SonarCloud JSON when the request fails but the response body is recoverable', async () => {
    axiosGetMock.mockRejectedValue({
      message: 'Request failed',
      response: {
        data: {
          issues: [
            {
              key: 'ISSUE-1',
              rule: 'typescript:S4721',
              component: 'my-project:src/app.ts',
              line: 3,
              message: 'Possible command injection sink detected',
              severity: 'CRITICAL',
              type: 'VULNERABILITY',
            },
          ],
        },
      },
    });

    const files: FileDiff[] = [
      {
        filename: 'src/app.ts',
        status: 'modified',
        hunks: [
          { startLine: 1, endLine: 10, diff: '@@ -1,5 +1,10 @@\n+child_process.exec(userInput);' },
        ],
      },
    ];

    const result = await performStaticAnalysis(files);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      file: 'src/app.ts',
      start_line: 3,
      end_line: 3,
      label: 'security',
      critical: true,
    });
    expect(infoMock).toHaveBeenCalledWith('SonarCloud returned parseable JSON with 1 finding(s)');
  });

  test('skips hidden files and directories before querying SonarCloud', async () => {
    axiosGetMock.mockResolvedValue({ data: { issues: [] } });

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

    const result = await performStaticAnalysis(files);

    expect(infoMock).toHaveBeenCalledWith('Running SonarCloud with 1 target(s) for my-project in organization my-org');
    expect(result.issues).toHaveLength(0);
  });

  test('skips generated and third-party directories and non-important files', async () => {
    axiosGetMock.mockResolvedValue({ data: { issues: [] } });

    const files: FileDiff[] = [
      { filename: 'node_modules/lib/index.js', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+a' }] },
      { filename: 'dist/bundle.js', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+b' }] },
      { filename: 'src/app.min.js', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+c' }] },
      { filename: 'src/types.d.ts', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+d' }] },
      { filename: 'src/app.js', status: 'modified', hunks: [{ startLine: 1, endLine: 2, diff: '+e' }] },
    ];

    const result = await performStaticAnalysis(files);

    expect(infoMock).toHaveBeenCalledWith('Running SonarCloud with 1 target(s) for my-project in organization my-org');
    expect(result.issues).toHaveLength(0);
  });

  test('returns no findings when SonarCloud credentials are missing', async () => {
    axiosGetMock.mockResolvedValue({ data: { issues: [] } });
    process.env.GITHUB_EVENT_PATH = '';

    const result = await performStaticAnalysis([
      {
        filename: 'src/app.ts',
        status: 'modified',
        hunks: [{ startLine: 1, endLine: 2, diff: '+a' }],
      },
    ]);

    expect(result.issues).toHaveLength(0);
    expect(warningMock).toHaveBeenCalledWith(
      'SonarCloud analysis skipped: missing SONARCLOUD_TOKEN, SONARCLOUD_ORGANIZATION, SONARCLOUD_PROJECT_KEY or pull request number'
    );
  });
});