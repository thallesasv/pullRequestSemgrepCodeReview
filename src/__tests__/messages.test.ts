import {
  buildLoadingMessage,
  buildOverviewMessage,
  buildReviewSummary,
  OVERVIEW_MESSAGE_SIGNATURE,
  PAYLOAD_TAG_OPEN,
  PAYLOAD_TAG_CLOSE
} from '../messages';
import { FileDiff } from '../diff';
import { Context } from '@actions/github/lib/context';
import { AIComment, PullRequestSummary } from '../prompts';
import config from '../config';

// Mock the GitHub context
jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'test-owner',
      repo: 'test-repo'
    }
  }
}));

jest.mock('../config', () => ({
  __esModule: true,
  default: {
    githubToken: 'mock-token',
    styleGuideRules: '',
    githubApiUrl: 'https://api.github.com',
    githubServerUrl: 'https://github.com',
    loadInputs: jest.fn()
  }
}));

describe('Messages', () => {
  const mockContext = {
    repo: { owner: 'test-owner', repo: 'test-repo' }
  } as Context;
  
  const mockFileDiffs: FileDiff[] = [
    {
      filename: 'src/test1.ts',
      status: 'modified',
      hunks: [{ startLine: 1, endLine: 5, diff: '@@ -1,3 +1,5 @@\n test\n+added\n+more' }]
    },
    {
      filename: 'src/test2.ts',
      status: 'added',
      hunks: [{ startLine: 1, endLine: 3, diff: '@@ -0,0 +1,3 @@\n+new file\n+content\n+here' }]
    }
  ];

  const mockCommits = [
    { sha: 'abc123', commit: { message: 'First commit' } },
    { sha: 'def456', commit: { message: 'Second commit' } }
  ];

  test('buildLoadingMessage formats correctly', () => {
    const message = buildLoadingMessage('base-sha', mockCommits, mockFileDiffs);

    expect(message).toContain('Analisando alteracoes neste PR');
    expect(message).toContain('base-sh');
    expect(message).toContain('abc123');
    expect(message).toContain('def456');
    expect(message).toContain('First commit');
    expect(message).toContain('Second commit');
    expect(message).toContain('src/test1.ts');
    expect(message).toContain('src/test2.ts');
    expect(message).toContain(OVERVIEW_MESSAGE_SIGNATURE);
    expect(message).toContain('https://github.com/test-owner/test-repo/commit/');
  });

  test('buildOverviewMessage formats correctly', () => {
    const mockSummary: PullRequestSummary = {
      title: 'Test PR',
      description: 'This is a test PR',
      files: [
        { filename: 'src/test1.ts', summary: 'Modified test file', title: 'Test 1' },
        { filename: 'src/test2.ts', summary: 'Added new file', title: 'Test 2' }
      ],
      type: ['ENHANCEMENT']
    };

    const message = buildOverviewMessage(mockSummary, ['commit1', 'commit2']);

    expect(message).toContain('Resumo do PR');
    expect(message).toContain('This is a test PR');
    expect(message).toContain('src/test1.ts');
    expect(message).toContain('Modified test file');
    expect(message).toContain('src/test2.ts');
    expect(message).toContain('Added new file');
    expect(message).toContain(OVERVIEW_MESSAGE_SIGNATURE);
    expect(message).toContain('PR Review Static');
    expect(message).toContain(PAYLOAD_TAG_OPEN);
    expect(message).toContain(PAYLOAD_TAG_CLOSE);
    expect(message).toContain('"commits":["commit1","commit2"]');
  });

  test('buildOverviewMessage truncates large file lists safely', () => {
    const largeSummary: PullRequestSummary = {
      title: 'Large PR',
      description: 'Large summary',
      files: Array.from({ length: 3000 }, (_, index) => ({
        filename: `.github/workflows/generated-${index}.yml`,
        summary: `Arquivo novo. Alteracoes em 1 trecho(s) com aproximadamente ${index + 1} linha(s).`,
        title: `File ${index}`,
      })),
      type: ['ENHANCEMENT'],
    };

    const message = buildOverviewMessage(largeSummary, ['commit1', 'commit2']);

    expect(message).toContain('Large summary');
    expect(message).toContain('2950 arquivo(s) omitidos');
    expect(message.length).toBeLessThan(65536);
  });

  test('buildReviewSummary formats correctly with comments', () => {
    const mockActionableComments: AIComment[] = [
      {
        file: 'src/test1.ts',
        start_line: 2,
        end_line: 3,
        highlighted_code: '+added',
        header: 'Potential issue',
        content: 'This might cause a problem',
        label: 'possible bug',
        critical: true
      }
    ];

    const mockSkippedComments: AIComment[] = [
      {
        file: 'src/test2.ts',
        start_line: 1,
        end_line: 1,
        highlighted_code: '+new file',
        header: 'Style suggestion',
        content: 'Consider using a different style',
        label: 'style',
        critical: false
      }
    ];

    const summary = buildReviewSummary(
      mockContext,
      mockFileDiffs,
      mockCommits,
      mockActionableComments,
      mockSkippedComments
    );

    expect(summary).toContain('Pull request precisa de atencao');
    expect(summary).toContain('Resumo do Code Review');
    expect(summary).toContain('Commits Considerados (2)');
    expect(summary).toContain('Arquivos analisados (2)');
    expect(summary).toContain('Pontos de Acao (1)');
    expect(summary).toContain('Comentarios Ignorados (1)');
    expect(summary).toContain('src/test1.ts [2-3]');
    expect(summary).toContain('possivel bug: "Potential issue"');
    expect(summary).toContain('src/test2.ts [1-1]');
    expect(summary).toContain('estilo: "Style suggestion"');
    expect(summary).toContain('https://github.com/test-owner/test-repo/commit/');
  });

  test('buildReviewSummary formats correctly with no comments', () => {
    const summary = buildReviewSummary(
      mockContext,
      mockFileDiffs,
      mockCommits,
      [],
      []
    );
    
    expect(summary).toContain('Me avise caso precise de ajuda!');
    expect(summary).toContain('Pontos de Acao (0)');
    expect(summary).toContain('Comentarios Ignorados (0)');
    expect(summary).toContain('https://github.com/test-owner/test-repo/commit/');
  });

  test('buildReviewSummary truncates large file lists safely', () => {
    const largeFiles: FileDiff[] = Array.from({ length: 3000 }, (_, index) => ({
      filename: `.github/workflows/generated-${index}.yml`,
      status: 'modified',
      hunks: [{ startLine: 1, endLine: 1, diff: '@@ -1,1 +1,1 @@\n+changed' }]
    }));

    const summary = buildReviewSummary(
      mockContext,
      largeFiles,
      mockCommits,
      [],
      []
    );

    expect(summary).toContain('Arquivos analisados (3000)');
    expect(summary).toContain('... e mais 2950 arquivo(s) omitidos');
    expect(summary.length).toBeLessThan(65536);
  });

  test('buildLoadingMessage uses custom GitHub server URL', () => {
    // Temporarily override the githubServerUrl
    const originalServerUrl = config.githubServerUrl;
    Object.defineProperty(config, 'githubServerUrl', {
      value: 'https://github.example.com',
      writable: true
    });

    const message = buildLoadingMessage('base-sha', mockCommits, mockFileDiffs);

    expect(message).toContain('https://github.example.com/test-owner/test-repo/commit/');

    // Restore the original value
    Object.defineProperty(config, 'githubServerUrl', {
      value: originalServerUrl,
      writable: true
    });
  });

  test('buildLoadingMessage truncates large file lists safely', () => {
    const largeFileDiffs: FileDiff[] = Array.from({ length: 3000 }, (_, index) => ({
      filename: `.github/workflows/generated-${index}.yml`,
      status: 'modified',
      hunks: [{ startLine: 1, endLine: 1, diff: '@@ -1,1 +1,1 @@\n+changed' }]
    }));

    const message = buildLoadingMessage('base-sha', mockCommits, largeFileDiffs);

    expect(message).toContain('Arquivos sendo considerados (3000)');
    expect(message).toContain('... e mais 2950 arquivo(s) omitidos');
    expect(message.length).toBeLessThan(65536);
  });
});
