const OP_RE = /[+\-*/]/;

interface Token {
  kind: 'num' | 'op';
  value: string;
}

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ') {
      i++;
      continue;
    }
    if (ch === '×' || ch === '÷') {
      tokens.push({ kind: 'op', value: ch === '×' ? '*' : '/' });
      i++;
      continue;
    }
    if (OP_RE.test(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i;
      while (j < expr.length && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) j++;
      const raw = expr.slice(i, j);
      if ((raw.match(/\./g) ?? []).length > 1) return null;
      if (raw === '.') return null;
      tokens.push({ kind: 'num', value: raw });
      i = j;
      continue;
    }
    return null;
  }
  return tokens;
}

export function evaluateExpression(expr: string): number | null {
  const parsed = tokenize(expr.trim());
  if (!parsed || parsed.length === 0) return null;
  const tokens: Token[] = parsed;

  let pos = 0;

  const peek = () => tokens[pos];

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < tokens.length && tokens[pos].kind === 'op' && /[+\-]/.test(tokens[pos].value)) {
      const op = tokens[pos].value;
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (pos < tokens.length && tokens[pos].kind === 'op' && /[*/]/.test(tokens[pos].value)) {
      const op = tokens[pos].value;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number | null {
    const token = peek();
    if (!token) return null;
    if (token.kind === 'op' && (token.value === '-' || token.value === '+')) {
      pos++;
      const inner = parseFactor();
      if (inner === null) return null;
      return token.value === '-' ? -inner : inner;
    }
    if (token.kind === 'num') {
      pos++;
      const n = Number(token.value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  const result = parseExpr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) return null;
  return result;
}

export function formatResult(value: number): string {
  return String(parseFloat(value.toPrecision(12)));
}
