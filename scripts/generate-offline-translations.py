import json
import os
from pathlib import Path
from argostranslate import translate

source = json.loads(Path('/tmp/masar-ui-arabic.json').read_text())
overrides = {
    'مسير الرواتب': 'Payroll run', 'مسيرات الرواتب': 'Payroll runs', 'قيد محاسبي': 'Journal entry',
    'القيود المحاسبية': 'Accounting journals', 'قيود': 'Qoyod', 'السلف': 'Employee loans',
    'الجزاءات': 'Penalties', 'التأمينات الاجتماعية': 'GOSI', 'المنشأة': 'Company',
    'رقم الإقامة': 'Iqama number', 'الهوية الوطنية': 'National ID', 'بدل السكن': 'Housing allowance',
    'بدل النقل': 'Transport allowance', 'الراتب الأساسي': 'Basic salary', 'صافي الراتب': 'Net salary',
    'إجمالي الاستحقاقات': 'Total earnings', 'إجمالي الاستقطاعات': 'Total deductions',
    'مركز التكلفة': 'Cost center', 'تحت المراجعة': 'Under review', 'معتمد': 'Approved',
}

result = {}
for index, text in enumerate(source, 1):
    result[text] = overrides.get(text) or translate.translate(text, 'ar', 'en').strip()
    if index % 100 == 0:
        print(f'Translated {index}/{len(source)}', flush=True)

lines = ['// Generated from static UI text using an offline Arabic-English model.', '// Review overrides in scripts/generate-offline-translations.py.', 'export const generatedTranslations: Record<string, string> = {']
for key, value in result.items():
    lines.append(f'  {json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)},')
lines.append('};\n')
Path('src/i18n/generatedTranslations.ts').write_text('\n'.join(lines))
print(f'Wrote {len(result)} translations')
