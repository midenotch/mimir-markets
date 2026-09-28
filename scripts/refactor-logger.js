const fs = require('fs');
const path = require('path');

const agents = [
    'agents/oracle/index.ts',
    'agents/market-creator/index.ts',
    'agents/council/index.ts',
    'agents/sync/index.ts',
    'agents/traders/index.ts'
];

function extractContext(text) {
    // Rough extraction of variables interpolated in template literals
    const matches = [...text.matchAll(/\$\{([^}]+)\}/g)];
    if (!matches.length) return '';
    const vars = matches.map(m => m[1]);
    const props = vars.map(v => {
        let raw = v.split('??')[0].trim();
        const parts = raw.split('.');
        const key = parts[parts.length - 1].replace(/[^a-zA-Z0-9_]/g, '');
        if (!key) return null;
        return `${key}: ${v}`;
    }).filter(Boolean);

    if (!props.length) return '';
    return `, { ${props.join(', ')} }`;
}

agents.forEach(agentPath => {
    const fullPath = path.join(__dirname, '..', agentPath);
    let code = fs.readFileSync(fullPath, 'utf8');
    const agentNameMatch = agentPath.match(/agents\/(.*?)\/index\.ts/);
    const agentName = agentNameMatch ? agentNameMatch[1] : 'worker';

    // Inject logger import and initialization safely
    if (!code.includes('createWorkerLogger')) {
        const importStmt = `import { createWorkerLogger } from "../../lib/ops/logger";\nconst logger = createWorkerLogger("${agentName}");\n`;
        code = code.replace(/import \{.*?\} from "\.\.\/\.\.\/lib\//, match => importStmt + match);
    }

    // Replace console.log(`...`) with context extraction
    code = code.replace(/console\.(log|warn|error)\(`([\s\S]*?)`\);?/g, (match, level, template) => {
        const logMethod = level === 'log' ? 'info' : level;
        let contextStr = extractContext(template);

        // Clean up template string format 
        // Wait, the template itself has the variables in the string, which is OK to keep in the message as requested? 
        // "Embed important context directly into the JSON fields rather than string interpolation for better searchability."
        // Keeping both for now doesn't hurt readability and guarantees searchability.
        return `logger.${logMethod}(\`${template}\`${contextStr});`;
    });

    // Replace console.*("...", err)
    code = code.replace(/console\.(warn|error)\((['"`].*?['"`]),\s*([^)]+)\);?/g, (match, level, str, errVar) => {
        return `logger.${level}(${str}, { error: ${errVar} });`;
    });

    // Replace console.log("stringLiteral");
    code = code.replace(/console\.(log|warn|error)\((['"].*?['"])\);?/g, (match, level, str) => {
        const logMethod = level === 'log' ? 'info' : level;
        return `logger.${logMethod}(${str});`;
    });

    fs.writeFileSync(fullPath, code);
    console.log(`Refactored ${agentPath}`);
});
