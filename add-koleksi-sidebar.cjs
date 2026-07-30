const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

const koleksiHtml = `
        <a href="/admin/collections.html" class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-stone hover:text-ink hover:bg-cream transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Koleksi
        </a>`;

let updatedCount = 0;

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // If already contains Koleksi, skip
  if (content.includes('>Koleksi<')) {
    console.log(`Skipping ${file} - already has Koleksi`);
    continue;
  }

  // Find the Produk link closing tag
  // We look for 'Produk' followed by optional spaces and '</a>'
  const regex = /(Produk\s*<\/a>)/;
  
  if (regex.test(content)) {
    content = content.replace(regex, `$1\n${koleksiHtml}`);
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
    updatedCount++;
  } else {
    console.log(`Warning: Could not find 'Produk</a>' in ${file}`);
  }
}

console.log(`Successfully updated ${updatedCount} files.`);
