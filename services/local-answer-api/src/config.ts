import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PromptTemplate {
  key: string;
  title: string;
  description: string;
}

interface LocalExperimentConfig {
  submissionPolicy?: {
    maxLength?: number;
    blockedTerms?: string[];
  };
  promptCatalog?: PromptTemplate[];
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultConfigPath = path.resolve(moduleDir, "../config/local-experiment.json");

function getConfigPath() {
  return process.env.LOCAL_EXPERIMENT_CONFIG_PATH
    ? path.resolve(process.env.LOCAL_EXPERIMENT_CONFIG_PATH)
    : defaultConfigPath;
}

function readConfig(): LocalExperimentConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf8");
    return JSON.parse(raw) as LocalExperimentConfig;
  } catch {
    return {};
  }
}

export function getSubmissionPolicy() {
  const config = readConfig();
  return {
    maxLength: Math.max(1, config.submissionPolicy?.maxLength ?? 80),
    blockedTerms: (config.submissionPolicy?.blockedTerms ?? [])
      .map((term) => term.trim())
      .filter(Boolean)
  };
}

export function getPromptCatalog() {
  const config = readConfig();
  return config.promptCatalog ?? [];
}

export function resolvePromptTemplate(templateKey?: string | null) {
  if (!templateKey) {
    return null;
  }
  return getPromptCatalog().find((template) => template.key === templateKey) ?? null;
}

export function getExperimentConfigPath() {
  return getConfigPath();
}
