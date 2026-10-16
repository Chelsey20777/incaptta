import os

root_dir = 'src'
old_registry = '@/registry/new-york-v4/ui/'
new_registry = '@/components/ui/'

for subdir, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith(('.vue', '.ts', '.css')):
            filepath = os.path.join(subdir, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if old_registry in content:
                print(f"Fixing {filepath}")
                new_content = content.replace(old_registry, new_registry)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
