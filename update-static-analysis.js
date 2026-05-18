const fs = require('fs');

let content = fs.readFileSync('src/static-analysis.ts', 'utf8');

// Add import
content = content.replace(
  'import { execFileSync } from "child_process";',
  'import { execFileSync } from "child_process";\nimport { warning } from "@actions/core";'
);

// Update error handling
content = content.replace(
  `  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(\`Semgrep analysis failed: \${message}\`);
  }`,
  `  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warning(\`Semgrep analysis failed: \${message}. Continuing without static analysis comments.\`);
    return [];
  }`
);

fs.writeFileSync('src/static-analysis.ts', content, 'utf8');
console.log('File updated successfully');
