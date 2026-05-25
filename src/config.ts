import { getInput, getMultilineInput } from "@actions/core";

export class Config {
  public githubToken: string | undefined;
  public styleGuideRules: string | undefined;
  public githubApiUrl: string;
  public githubServerUrl: string;
  public sonarcloudToken: string | undefined;
  public sonarcloudOrganization: string | undefined;
  public sonarcloudProjectKey: string | undefined;
  public sonarcloudUrl: string;

  constructor() {
    this.githubToken = process.env.GITHUB_TOKEN;
    if (!this.githubToken) {
      throw new Error("GITHUB_TOKEN is not set");
    }

    // GitHub Enterprise Server support
    this.githubApiUrl =
      process.env.GITHUB_API_URL || getInput('github_api_url') || 'https://api.github.com';
    this.githubServerUrl =
      process.env.GITHUB_SERVER_URL || getInput('github_server_url') || 'https://github.com';

    this.sonarcloudToken =
      process.env.SONARCLOUD_TOKEN || getInput('sonarcloud_token') || undefined;
    this.sonarcloudOrganization =
      process.env.SONARCLOUD_ORGANIZATION || getInput('sonarcloud_organization') || undefined;
    this.sonarcloudProjectKey =
      process.env.SONARCLOUD_PROJECT_KEY || getInput('sonarcloud_project_key') || undefined;
    this.sonarcloudUrl =
      process.env.SONARCLOUD_URL || getInput('sonarcloud_url') || 'https://sonarcloud.io';

    if (!process.env.DEBUG) {
      return;
    }
    console.log("[debug] loading extra inputs from .env");

    this.styleGuideRules = process.env.STYLE_GUIDE_RULES;
  }

  public loadInputs() {
    if (process.env.DEBUG) {
      console.log("[debug] skip loading inputs");
      return;
    }

    // Custom style guide rules
    try {
      const styleGuideRules = getMultilineInput("style_guide_rules") || [];
      if (
        Array.isArray(styleGuideRules) &&
        styleGuideRules.length &&
        styleGuideRules[0].trim().length
      ) {
        this.styleGuideRules = styleGuideRules.join("\n");
      }
    } catch (e) {
      console.error("Error loading style guide rules:", e);
    }
  }
}

// For testing, we'll modify how the config instance is created
// This prevents the automatic loading when the module is imported
let configInstance: Config | null = null;

// If not in test environment, create and configure the instance
if (process.env.NODE_ENV !== "test") {
  configInstance = new Config();
  configInstance.loadInputs();
}

// Export the instance or a function to create one for tests
export default process.env.NODE_ENV === "test"
  ? {
      // Default values for tests
      githubToken: "mock-token",
      styleGuideRules: "",
      githubApiUrl: "https://api.github.com",
      githubServerUrl: "https://github.com",
      sonarcloudToken: undefined,
      sonarcloudOrganization: undefined,
      sonarcloudProjectKey: undefined,
      sonarcloudUrl: "https://sonarcloud.io",
      loadInputs: jest.fn(),
    }
  : configInstance!;
