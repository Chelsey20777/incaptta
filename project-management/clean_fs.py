import os
import shutil

root_dir = 'src'

for subdir, dirs, files in os.walk(root_dir, topdown=False):
    # Check files
    for file in files:
        if ':' in file:
            filepath = os.path.join(subdir, file)
            print(f"Found problematic file: {filepath}")
            try:
                os.remove(filepath)
                print(f"Deleted {filepath}")
            except Exception as e:
                print(f"Failed to delete {filepath}: {e}")
                
    # Check directories
    for d in dirs:
        if ':' in d:
            dirpath = os.path.join(subdir, d)
            print(f"Found problematic directory: {dirpath}")
            try:
                shutil.rmtree(dirpath)
                print(f"Deleted directory {dirpath}")
            except Exception as e:
                print(f"Failed to delete directory {dirpath}: {e}")
