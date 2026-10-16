const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
    });
}

function processFile(filePath) {
    if (!filePath.match(/\.(vue|ts|js|css)$/)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/text-\[#79c21b\]/g, 'text-brand-primary');
    content = content.replace(/bg-\[#79c21b\]/g, 'bg-brand-primary');
    content = content.replace(/border-\[#79c21b\]/g, 'border-brand-primary');
    content = content.replace(/ring-\[#79c21b\]/g, 'ring-brand-primary');

    content = content.replace(/text-\[#76b900\]/g, 'text-brand-primary');
    content = content.replace(/bg-\[#76b900\]/g, 'bg-brand-primary');
    content = content.replace(/border-\[#76b900\]/g, 'border-brand-primary');
    content = content.replace(/ring-\[#76b900\]/g, 'ring-brand-primary');

    content = content.replace(/text-\[#ff8903\]/g, 'text-brand-secondary');
    content = content.replace(/bg-\[#ff8903\]/g, 'bg-brand-secondary');
    content = content.replace(/border-\[#ff8903\]/g, 'border-brand-secondary');
    content = content.replace(/ring-\[#ff8903\]/g, 'ring-brand-secondary');

    content = content.replace(/'#79c21b'/g, "'var(--color-brand-primary)'");
    content = content.replace(/"#79c21b"/g, '"var(--color-brand-primary)"');

    content = content.replace(/'#76b900'/g, "'var(--color-brand-primary)'");
    content = content.replace(/"#76b900"/g, '"var(--color-brand-primary)"');

    content = content.replace(/'#ff8903'/g, "'var(--color-brand-secondary)'");
    content = content.replace(/"#ff8903"/g, '"var(--color-brand-secondary)"');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated:', filePath);
    }
}

walkDir('src', (filepath) => {
    try { processFile(filepath); } catch (e) { console.error('Error in', filepath, e); }
});
