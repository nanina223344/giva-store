import os
import glob

html_files = glob.glob('admin/*.html')
html_files += glob.glob('kasir/*.html')

new_nav_item = """        <p class="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone">Sistem</p>
        <a href="/admin/sections.html" class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-stone hover:text-ink hover:bg-cream transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Sections Beranda
        </a>
"""

for file_path in html_files:
    if file_path == 'admin/sections.html':
        continue # we already did this one manually
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the "Sistem" category. Wait, kasir might not have it or it might already have it from earlier.
    # Previously we added "Sistem" and "Video Beranda" to all admin pages.
    # Let's replace the whole "Sistem" section.
    
    # We look for `<p class="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone">Sistem</p>`
    import re
    # If "Sections Beranda" is already in there, skip
    if "Sections Beranda" in content:
        continue
        
    pattern = re.compile(r'(<p class="px-3 pt-4 pb-1.5 text-\[10px\] font-semibold uppercase tracking-widest text-stone">Sistem</p>)')
    if pattern.search(content):
        # Insert our new_nav_item after the <p> tag? Actually our new_nav_item includes the <p> tag, so let's just insert the anchor tag after the <p> tag.
        
        anchor = """
        <a href="/admin/sections.html" class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-stone hover:text-ink hover:bg-cream transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Sections Beranda
        </a>"""
        content = pattern.sub(r'\1' + anchor, content)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file_path}")
    else:
        print(f"Sistem not found in {file_path}")

