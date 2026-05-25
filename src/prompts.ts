import { info } from "@actions/core";
import { FileDiff } from "./diff";
import { ReviewCommentThread } from "./comments";
import {
  performStaticAnalysis,
  generateSummaryFromDiff,
} from "./static-analysis";

type PullRequestSummaryPrompt = {
  prTitle: string;
  prDescription: string;
  commitMessages: string[];
  files: FileDiff[];
};

export type PullRequestSummary = {
  title: string;
  description: string;
  files: {
    filename: string;
    summary: string;
    title: string;
  }[];
  type: string[];
};

export async function runSummaryPrompt(
  pr: PullRequestSummaryPrompt
): Promise<PullRequestSummary> {
  info("Using static analysis for PR summary");
  return generateSummaryFromDiff(
    pr.files,
    pr.prTitle,
    pr.prDescription,
    pr.commitMessages
  );
}

export type AIComment = {
  file: string;
  start_line: number;
  end_line: number;
  highlighted_code: string;
  header: string;
  content: string;
  label: string;
  critical: boolean;
};

export type PullRequestReview = {
  review: {
    estimated_effort_to_review: number;
    score: number;
    has_relevant_tests: boolean;
    security_concerns: string;
  };
  comments: AIComment[];
};

type PullRequestReviewPrompt = {
  prTitle: string;
  prDescription: string;
  prSummary: string;
  files: FileDiff[];
};

export async function runReviewPrompt(
  pr: PullRequestReviewPrompt
): Promise<PullRequestReview> {
  info("Using static analysis for PR review");
  const analysisResult = await performStaticAnalysis(pr.files);
  return {
    review: {
      estimated_effort_to_review:
        analysisResult.metrics.estimatedEffortToReview,
      score: analysisResult.metrics.qualityScore,
      has_relevant_tests: analysisResult.metrics.hasRelevantTests,
      security_concerns: analysisResult.metrics.securityConcerns,
    },
    comments: analysisResult.issues,
  };
}

type ReviewCommentPrompt = {
  commentThread: ReviewCommentThread;
  commentFileDiff: FileDiff;
};

export type ReviewCommentResponse = {
  response_comment: string;
  action_requested: boolean;
};

export async function runReviewCommentPrompt({
  commentThread,
  commentFileDiff,
}: ReviewCommentPrompt): Promise<ReviewCommentResponse> {
  void commentThread;
  void commentFileDiff;
  info("Comment responses are disabled in static analysis mode");
  return {
    response_comment: "",
    action_requested: false,
  };
}
