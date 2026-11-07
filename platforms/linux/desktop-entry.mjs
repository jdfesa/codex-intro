// Desktop Entry commands are argument lists, never shell programs.
export function mainValues(text) {
  const values = {};
  let group;
  for (const line of text.split(/\r?\n/)) {
    if (/^\[.*\]$/.test(line.trim())) group = line.trim();
    else if (group === '[Desktop Entry]') {
      const match = line.match(/^([\w-]+)=(.*)$/);
      if (match) {
        if (Object.hasOwn(values, match[1])) throw new Error(`Duplicate desktop key: ${match[1]}`);
        values[match[1]] = match[2];
      }
    }
  }
  if (values.Type !== 'Application' || !values.Exec) throw new Error('The desktop entry must be an Application with an Exec command.');
  return values;
}

export function parseExec(value) {
  // Undo the Desktop Entry string escaping before command-line quoting.
  const decoded = value.replace(/\\([\\sntr])/g, (_, char) => ({ '\\': '\\', s: ' ', n: '\n', t: '\t', r: '\r' })[char]);
  const tokens = [];
  let token = '', quoted = false, active = false;
  for (let index = 0; index < decoded.length; index++) {
    const char = decoded[index];
    if (char === '\\') {
      if (++index === decoded.length) throw new Error('Invalid trailing escape in desktop Exec.');
      token += decoded[index]; active = true;
    } else if (char === '"') { quoted = !quoted; active = true; }
    else if (/\s/.test(char) && !quoted) {
      if (active) tokens.push(token);
      token = ''; active = false;
    } else { token += char; active = true; }
  }
  if (quoted) throw new Error('Unclosed quote in desktop Exec.');
  if (active) tokens.push(token);
  if (!tokens[0]) throw new Error('Missing executable in desktop Exec.');
  for (const token of tokens) {
    if (/^%[fFuUick]$/.test(token)) continue;
    if (token.replaceAll('%%', '').includes('%')) throw new Error(`Unsupported desktop field code in: ${token}`);
  }
  if (tokens.filter(token => /^%[fFuU]$/.test(token)).length > 1) throw new Error('Only one desktop file/URL field is supported.');
  return tokens;
}

export function expandExec(tokens, incoming, { Name = '', Icon = '', desktopPath = '' } = {}) {
  const result = [];
  let acceptsFiles = false;
  for (const token of tokens) {
    if (/^%[FU]$/.test(token)) { result.push(...incoming); acceptsFiles = true; }
    else if (/^%[fu]$/.test(token)) { result.push(...incoming.slice(0, 1)); acceptsFiles = true; }
    else if (token === '%i') { if (Icon) result.push('--icon', Icon); }
    else if (token === '%c') result.push(Name);
    else if (token === '%k') result.push(desktopPath);
    else result.push(token.replaceAll('%%', '%'));
  }
  if (!acceptsFiles) result.push(...incoming);
  return result;
}

export function desktopQuote(value) {
  if (/[\0\r\n]/.test(value)) throw new Error('Desktop command paths cannot contain newlines or NUL.');
  // Quoting escapes first; Desktop Entry string escaping is a second layer.
  return '"' + value.replace(/[\\"`$]/g, '\\$&').replaceAll('\\', '\\\\').replaceAll('%', '%%') + '"';
}

export function integratedEntry(original, { launcher, uninstaller }) {
  const values = mainValues(original);
  if (values['X-Codex-Intro'] === 'true') throw new Error('Desktop entry is already managed by Codex Intro.');
  if (launcher.includes('=')) throw new Error('The installation path cannot contain an equals sign.');
  const actions = (values.Actions ?? '').split(';').filter(Boolean);
  if (actions.includes('CodexIntroUninstall')) throw new Error('Desktop action name is already in use.');
  const replacements = new Map(Object.entries({
    Exec: `${desktopQuote(launcher)} %U`, TryExec: launcher.replaceAll('\\', '\\\\'),
    Terminal: 'false', DBusActivatable: 'false',
    Actions: [...actions, 'CodexIntroUninstall'].join(';') + ';', 'X-Codex-Intro': 'true',
  }));
  const output = [];
  let main = false;
  const flush = () => { for (const [key, value] of replacements) output.push(`${key}=${value}`); replacements.clear(); };
  for (const line of original.split(/\r?\n/)) {
    if (/^\[.*\]$/.test(line.trim())) {
      if (main) flush();
      main = line.trim() === '[Desktop Entry]';
    }
    const key = main ? line.match(/^([\w-]+)=/)?.[1] : null;
    if (key && replacements.has(key)) {
      output.push(`${key}=${replacements.get(key)}`); replacements.delete(key);
    } else output.push(line);
  }
  if (main) flush();
  return output.join('\n').trimEnd() + `\n\n[Desktop Action CodexIntroUninstall]\nName=Uninstall startup intro\nExec=${desktopQuote(uninstaller)}\n`;
}
