import type { Filter, TunnloEvent } from '@tunnlo/core';
import { getNestedValue } from '@tunnlo/core';

export interface ContentFilterRule {
  field: string;
  match?: string;
  regex?: string;
  in?: (string | number)[];
  not_in?: (string | number)[];
}

export interface ContentFilterConfig {
  rules: ContentFilterRule[];
  mode?: 'all' | 'any';
}

export class ContentFilter implements Filter {
  name = 'content-filter';
  private rules: ContentFilterRule[];
  private compiledRegexes: Map<number, RegExp>;
  private mode: 'all' | 'any';

  constructor(config: ContentFilterConfig) {
    this.rules = config.rules;
    this.mode = config.mode ?? 'all';

    // Pre-compile regexes once to avoid ReDoS on every event
    this.compiledRegexes = new Map();
    this.rules.forEach((rule, i) => {
      if (rule.regex !== undefined) {
        this.compiledRegexes.set(i, new RegExp(rule.regex));
      }
    });
  }

  process(event: TunnloEvent): TunnloEvent | null {
    const results = this.rules.map((rule, i) => this.matchRule(event, rule, i));

    if (this.mode === 'all') {
      return results.every(Boolean) ? event : null;
    }
    return results.some(Boolean) ? event : null;
  }

  private matchRule(event: TunnloEvent, rule: ContentFilterRule, index: number): boolean {
    const value = getNestedValue(event, rule.field);
    if (value === undefined) return false;

    const strValue = String(value);

    if (rule.match !== undefined) {
      return strValue.includes(rule.match);
    }

    if (rule.regex !== undefined) {
      const compiled = this.compiledRegexes.get(index);
      return compiled ? compiled.test(strValue) : false;
    }

    if (rule.in !== undefined) {
      return rule.in.some((v) => String(v) === strValue);
    }

    if (rule.not_in !== undefined) {
      return !rule.not_in.some((v) => String(v) === strValue);
    }

    return true;
  }
}
