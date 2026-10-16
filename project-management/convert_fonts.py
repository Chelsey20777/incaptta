import base64
import os

def convert_to_base64_ts():
    font_path = r'c:\Users\REAL TIME\Documents\incaptta\IncapttaPro\project-management\dejavu-fonts-ttf-2.37\ttf'
    output_path = r'c:\Users\REAL TIME\Documents\incaptta\IncapttaPro\project-management\src\features\jobCards\utils\fonts.ts'
    
    regular_font = os.path.join(font_path, 'DejaVuSansCondensed.ttf')
    bold_font = os.path.join(font_path, 'DejaVuSansCondensed-Bold.ttf')
    
    with open(regular_font, 'rb') as f:
        reg_b64 = base64.b64encode(f.read()).decode('utf-8')
        
    with open(bold_font, 'rb') as f:
        bold_b64 = base64.b64encode(f.read()).decode('utf-8')
        
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"export const DEJAVU_REGULAR = '{reg_b64}';\n")
        f.write(f"export const DEJAVU_BOLD = '{bold_b64}';\n")
    
    print(f"Successfully created {output_path}")

if __name__ == '__main__':
    convert_to_base64_ts()
