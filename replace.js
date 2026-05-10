const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;

    if (filePath.endsWith('package.json')) {
        newContent = newContent.replace(/\"version\":\s*\"0\.2\.0-alpha\"/g, '\"version\": \"0.1.0\"');
        newContent = newContent.replace(/\"workspace:0\.2\.0-alpha\"/g, '\"workspace:*\"');
        newContent = newContent.replace(/\"@hardkas\/(.*?)\":\s*\"0\.2\.0-alpha\"/g, '\"@hardkas/$1\": \"workspace:*\"');
    }

    newContent = newContent.replace(/0\.2\.0-alpha/g, '0.1.0');
    newContent = newContent.replace(/1\.0\.0-alpha/g, '0.1.0');
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent);
        console.log('Updated ' + filePath);
    }
}

function traverse(dir) {
    if (dir.includes('node_modules') || dir.includes('.git') || dir.includes('dist')) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
            if (fs.statSync(fullPath).isDirectory()) {
                traverse(fullPath);
            } else if (file === 'package.json' || file.endsWith('.md')) {
                replaceInFile(fullPath);
            }
        } catch (e) {}
    }
}

traverse('.');
