/**
 * 敏感文件检测器
 * 检测文件是否包含敏感内容
 */

// ========== 敏感级别 ==========

/**
 * 敏感级别
 */
export enum SensitivityLevel {
  /** 低敏感：配置文件 */
  LOW = 'low',
  /** 中敏感：数据库、日志 */
  MEDIUM = 'medium',
  /** 高敏感：密钥、凭证 */
  HIGH = 'high',
}

// ========== 检测结果 ==========

/**
 * 敏感检测结果
 */
export interface SensitivityResult {
  sensitive: boolean;
  level?: SensitivityLevel;
  reason?: string;
}

/**
 * 带文件路径的敏感检测结果
 */
export interface SensitivityResultWithPath {
  path: string;
  result: SensitivityResult;
}

// ========== 敏感规则 ==========

/**
 * 敏感规则
 */
interface SensitiveRule {
  pattern: RegExp;
  level: SensitivityLevel;
  reason: string;
}

// ========== 检测器 ==========

/**
 * 敏感文件检测器
 */
export class SensitiveFileDetector {
  /**
   * 敏感文件模式
   */
  private static readonly SENSITIVE_PATTERNS: SensitiveRule[] = [
    // ========== 高敏感 ==========
    // 环境变量
    { pattern: /\.env$/, level: SensitivityLevel.HIGH, reason: '环境变量文件可能包含密钥' },
    { pattern: /\.env\.(local|development|production|test)$/, level: SensitivityLevel.HIGH, reason: '环境变量文件可能包含密钥' },

    // 凭证文件
    { pattern: /credentials?\.json$/, level: SensitivityLevel.HIGH, reason: '凭证文件' },
    { pattern: /secrets?\.json$/, level: SensitivityLevel.HIGH, reason: '密钥文件' },
    { pattern: /\.credentials$/, level: SensitivityLevel.HIGH, reason: '凭证文件' },

    // 密钥文件
    { pattern: /\.pem$/, level: SensitivityLevel.HIGH, reason: '私钥/证书文件' },
    { pattern: /\.key$/, level: SensitivityLevel.HIGH, reason: '密钥文件' },
    { pattern: /\.p12$/, level: SensitivityLevel.HIGH, reason: 'PKCS12 证书文件' },
    { pattern: /\.pfx$/, level: SensitivityLevel.HIGH, reason: 'PFX 证书文件' },

    // SSH 密钥
    { pattern: /id_rsa/, level: SensitivityLevel.HIGH, reason: 'SSH RSA 私钥' },
    { pattern: /id_ed25519/, level: SensitivityLevel.HIGH, reason: 'SSH Ed25519 私钥' },
    { pattern: /id_ecdsa/, level: SensitivityLevel.HIGH, reason: 'SSH ECDSA 私钥' },
    { pattern: /id_dsa/, level: SensitivityLevel.HIGH, reason: 'SSH DSA 私钥' },

    // AWS
    { pattern: /\.aws\/credentials$/, level: SensitivityLevel.HIGH, reason: 'AWS 凭证文件' },

    // 其他
    { pattern: /\.htpasswd$/, level: SensitivityLevel.HIGH, reason: 'HTTP 密码文件' },
    { pattern: /\.netrc$/, level: SensitivityLevel.HIGH, reason: '网络凭证文件' },

    // ========== 中敏感 ==========
    // 数据库
    { pattern: /\.sqlite3?$/, level: SensitivityLevel.MEDIUM, reason: 'SQLite 数据库文件' },
    { pattern: /\.db$/, level: SensitivityLevel.MEDIUM, reason: '数据库文件' },

    // 日志
    { pattern: /\.log$/, level: SensitivityLevel.MEDIUM, reason: '日志文件可能包含敏感信息' },

    // 历史记录
    { pattern: /\.bash_history$/, level: SensitivityLevel.MEDIUM, reason: 'Bash 历史记录' },
    { pattern: /\.zsh_history$/, level: SensitivityLevel.MEDIUM, reason: 'Zsh 历史记录' },

    // 其他配置
    { pattern: /\.npmrc$/, level: SensitivityLevel.MEDIUM, reason: 'npm 配置可能包含 token' },
    { pattern: /\.pypirc$/, level: SensitivityLevel.MEDIUM, reason: 'PyPI 配置可能包含 token' },

    // ========== 低敏感 ==========
    // 配置文件
    { pattern: /config\.json$/, level: SensitivityLevel.LOW, reason: '配置文件' },
    { pattern: /settings\.json$/, level: SensitivityLevel.LOW, reason: '设置文件' },
    { pattern: /\.gitconfig$/, level: SensitivityLevel.LOW, reason: 'Git 配置文件' },
  ];

  /**
   * 危险路径模式
   */
  private static readonly DANGEROUS_PATHS: RegExp[] = [
    /^\/etc\//,
    /^\/usr\//,
    /^\/System\//,
    /^\/var\//,
    /^\/root\//,
    /^C:\\Windows\\/i,
    /^C:\\Program Files/i,
  ];

  /**
   * 检查文件敏感性
   */
  static check(filePath: string): SensitivityResult {
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const rule of this.SENSITIVE_PATTERNS) {
      if (rule.pattern.test(normalizedPath)) {
        return {
          sensitive: true,
          level: rule.level,
          reason: rule.reason,
        };
      }
    }

    return { sensitive: false };
  }

  /**
   * 检查是否是危险路径
   */
  static isDangerousPath(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.DANGEROUS_PATHS.some(pattern => pattern.test(normalizedPath));
  }

  /**
   * 批量检查文件
   */
  static checkMultiple(filePaths: string[]): SensitivityResultWithPath[] {
    return filePaths.map(path => ({
      path,
      result: this.check(path),
    }));
  }

  /**
   * 过滤出敏感文件
   */
  static filterSensitive(
    filePaths: string[],
    minLevel: SensitivityLevel = SensitivityLevel.LOW
  ): SensitivityResultWithPath[] {
    const levelOrder = {
      [SensitivityLevel.LOW]: 0,
      [SensitivityLevel.MEDIUM]: 1,
      [SensitivityLevel.HIGH]: 2,
    };

    return this.checkMultiple(filePaths).filter(
      item =>
        item.result.sensitive &&
        item.result.level &&
        levelOrder[item.result.level] >= levelOrder[minLevel]
    );
  }

  /**
   * 获取敏感级别描述
   */
  static getLevelDescription(level: SensitivityLevel): string {
    switch (level) {
      case SensitivityLevel.LOW:
        return '低敏感';
      case SensitivityLevel.MEDIUM:
        return '中敏感';
      case SensitivityLevel.HIGH:
        return '高敏感';
    }
  }

  /**
   * 获取敏感级别处理建议
   */
  static getLevelAction(level: SensitivityLevel): string {
    switch (level) {
      case SensitivityLevel.LOW:
        return '正常流程处理';
      case SensitivityLevel.MEDIUM:
        return '需要用户确认';
      case SensitivityLevel.HIGH:
        return '默认拒绝访问';
    }
  }
}
