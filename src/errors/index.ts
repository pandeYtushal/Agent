/**
 * Custom Error Hierarchy for Portfolio Publishing Agent
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string = 'INTERNAL_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

export class SecurityError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SECURITY_ERROR', details);
  }
}

export class WorkspaceError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKSPACE_ERROR', details);
  }
}

export class GitOperationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GIT_OPERATION_ERROR', details);
  }
}

export class GitHubApiError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GITHUB_API_ERROR', details);
  }
}

export class AgentError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', details);
  }
}
