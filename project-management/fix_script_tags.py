import os

root_dir = 'src'

for subdir, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith('.vue'):
            filepath = os.path.join(subdir, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Check if it has </script> but no <script setup> or <script>
            if '</script>' in content and '<script' not in content:
                print(f"Fixing missing script tag in {filepath}")
                new_content = '<script setup lang="ts">\n' + content
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
            elif '<script setup' in content and 'lang="ts"' not in content:
                # Optionally ensure lang="ts"
                pass
