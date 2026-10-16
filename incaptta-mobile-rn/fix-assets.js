const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const oldFontPathPart = 'assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/';
const newFontPathPart = 'assets/fonts/';

// 1. Relocate fonts
const oldFontsDir = path.join(distDir, oldFontPathPart);
const newFontsDir = path.join(distDir, newFontPathPart);

if (fs.existsSync(oldFontsDir)) {
    if (!fs.existsSync(newFontsDir)) {
        fs.mkdirSync(newFontsDir, { recursive: true });
    }
    
    const files = fs.readdirSync(oldFontsDir);
    files.forEach(file => {
        const oldFile = path.join(oldFontsDir, file);
        const newFile = path.join(newFontsDir, file);
        fs.copyFileSync(oldFile, newFile);
        console.log(`Copied ${file} to ${newFontPathPart}`);
    });
} else {
    console.log('Old font directory not found, skipping relocation.');
}

// 2. Patch files
function patchFiles(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            patchFiles(filePath);
        } else if (file.endsWith('.html') || file.endsWith('.js')) {
            let content = fs.readFileSync(filePath, 'utf8');
            if (content.includes(oldFontPathPart)) {
                console.log(`Patching ${filePath}...`);
                const newContent = content.split(oldFontPathPart).join(newFontPathPart);
                fs.writeFileSync(filePath, newContent, 'utf8');
            }
        }
    });
}

console.log('Patching references in dist...');
patchFiles(distDir);
console.log('Fix completed successfully.');
