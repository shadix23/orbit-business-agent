"""Read-only SQLite / filesystem boundary. JSON request on stdin, JSON response on stdout."""
import csv
import io
import json
import os
import re
import sqlite3
import sys
import time
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 10000
EXTENSIONS = {'.csv', '.json', '.xlsx', '.txt', '.md', '.sqlite', '.sqlite3', '.db'}


def confined(root, relative, suffixes=None):
    root = Path(root).resolve(strict=True)
    raw = Path(str(relative))
    if raw.is_absolute() or not str(relative) or any(p.startswith('.') for p in raw.parts):
        raise ValueError('Путь должен быть относительным внутри workspace; скрытые файлы запрещены.')
    target = (root / raw).resolve(strict=True)
    if not target.is_relative_to(root) or not target.is_file() or any(p.startswith('.') for p in target.relative_to(root).parts):
        raise ValueError('Файл вне рабочей папки или не является обычным файлом.')
    if target.suffix.lower() not in (suffixes or EXTENSIONS):
        raise ValueError('Неподдерживаемый формат файла.')
    return target


def cell_text(value):
    return value if value is None or isinstance(value, (str, float, int, bool)) else str(value)


def open_db(root, database):
    path = confined(root, database, {'.sqlite', '.sqlite3', '.db'})
    con = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=1)
    con.execute('PRAGMA query_only = ON')
    con.execute('PRAGMA trusted_schema = OFF')
    con.enable_load_extension(False)
    deadline = time.monotonic() + 2
    con.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
    return con


FUNCTIONS = set('sum total count avg min max round abs coalesce ifnull nullif date time datetime strftime julianday unixepoch substr substring length lower upper trim ltrim rtrim replace instr printf format typeof cast iif like glob hex quote unicode char group_concat row_number rank dense_rank lag lead first_value last_value json_extract json_array_length json_type json_valid sqlite_version'.split())


def authorize(action, arg1, arg2, db, source):
    allowed = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_RECURSIVE}
    if action == sqlite3.SQLITE_FUNCTION:
        return sqlite3.SQLITE_OK if (arg2 or '').lower() in FUNCTIONS else sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK if action in allowed else sqlite3.SQLITE_DENY


def schema(root, database):
    with open_db(root, database) as con:
        tables = con.execute("SELECT name, type FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 101").fetchall()
        if len(tables) > 100:
            raise ValueError('База содержит более 100 таблиц/представлений; используйте отдельную reporting-базу.')
        result = []
        for name, kind in tables:
            # Parameterized inspection, not string interpolation into PRAGMA.
            cols = con.execute('SELECT name,type,"notnull",pk FROM pragma_table_info(?)', (name,)).fetchall()
            result.append({'name': name, 'type': kind, 'columns': [{'name': c[0], 'type': c[1], 'nullable': not bool(c[2]), 'primaryKey': bool(c[3])} for c in cols]})
        return {'database': database, 'readonly': True, 'tables': result}


def query(root, database, sql, params=None, limit=MAX_ROWS):
    if not isinstance(sql, str) or len(sql) > 20000 or not re.match(r'^\s*(SELECT|WITH)\b', sql, re.I):
        raise ValueError('Разрешён один SELECT-запрос или WITH … SELECT.')
    if params is not None and (not isinstance(params, list) or len(params) > 100):
        raise ValueError('Параметры SQL должны быть массивом, максимум 100 значений.')
    limit = min(MAX_ROWS, max(1, int(limit)))
    start = time.monotonic()
    with open_db(root, database) as con:
        con.set_authorizer(authorize)
        cursor = con.execute(sql, params or [])  # execute rejects multiple statements
        if cursor.description is None:
            raise ValueError('Запрос должен возвращать строки.')
        columns = [x[0] for x in cursor.description]
        if len(columns) != len(set(columns)):
            raise ValueError('Названия колонок результата повторяются; используйте AS для уникальных имён.')
        fetched = cursor.fetchmany(limit + 1)
        rows = [{k: cell_text(v) for k, v in zip(columns, row)} for row in fetched[:limit]]
        result = {'columns': columns, 'rows': rows, 'rowCount': len(rows), 'truncated': len(fetched) > limit, 'elapsedMs': round((time.monotonic() - start)*1000), 'readonly': True}
        if len(json.dumps(result, ensure_ascii=False).encode()) > MAX_BYTES:
            raise ValueError('Результат больше 5 МБ. Уточните SELECT или агрегируйте данные.')
        return result


NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def xlsx_records(path, sheet=None):
    with zipfile.ZipFile(path) as z:
        if sum(i.file_size for i in z.infolist()) > 30 * 1024 * 1024 or len(z.infolist()) > 2000:
            raise ValueError('Слишком большой распакованный XLSX (лимит 30 МБ).')
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(el.itertext()) for el in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        book = ET.fromstring(z.read('xl/workbook.xml'))
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sheets = book.findall('m:sheets/m:sheet', NS)
        chosen = next((s for s in sheets if s.attrib['name'] == sheet), None) if sheet else sheets[0]
        if chosen is None:
            raise ValueError('Лист Excel не найден.')
        target = rels[chosen.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        name = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        # Never extract ZIP entries to disk.
        xml = ET.fromstring(z.read(name))
        styles = ET.fromstring(z.read('xl/styles.xml')) if 'xl/styles.xml' in z.namelist() else None
        custom = {int(n.attrib['numFmtId']): n.attrib.get('formatCode', '') for n in styles.findall('m:numFmts/m:numFmt', NS)} if styles is not None else {}
        formats = [int(n.attrib.get('numFmtId', 0)) for n in styles.findall('m:cellXfs/m:xf', NS)] if styles is not None else []
        base = datetime(1904, 1, 1) if book.find('m:workbookPr', NS) is not None and book.find('m:workbookPr', NS).attrib.get('date1904') in ('1', 'true') else datetime(1899, 12, 30)
        grid = []
        for row in xml.findall('m:sheetData/m:row', NS):
            cells = {}
            for c in row.findall('m:c', NS):
                ref = re.match(r'([A-Z]+)', c.attrib.get('r', 'A1'))[1]
                idx = 0
                for letter in ref:
                    idx = idx * 26 + ord(letter) - 64
                if idx > 200:
                    raise ValueError('Максимум 200 столбцов Excel.')
                val = c.find('m:v', NS)
                typ = c.attrib.get('t')
                text = val.text if val is not None else None
                if typ == 's' and text is not None:
                    text = strings[int(text)]
                elif typ == 'inlineStr':
                    text = ''.join(c.find('m:is', NS).itertext())
                elif typ == 'b':
                    text = text == '1'
                elif typ not in ('str', 'e', 'd') and text is not None:
                    text = float(text)
                    style_idx = int(c.attrib.get('s', 0))
                    fmt = formats[style_idx] if style_idx < len(formats) else 0
                    fmt_code = re.sub(r'"[^"]*"|\[[^\]]*\]', '', custom.get(fmt, '')).lower()
                    if 14 <= fmt <= 22 or (fmt >= 164 and re.search(r'[yd]', fmt_code)):
                        text = (base + timedelta(days=text)).date().isoformat()
                if c.find('m:f', NS) is not None and val is None:
                    raise ValueError('У формулы Excel нет кэшированного значения. Пересчитайте и сохраните файл в Excel.')
                cells[idx-1] = text
            if cells and any(v is not None for v in cells.values()):
                grid.append([cells.get(i) for i in range(max(cells)+1)])
            if len(grid) > MAX_ROWS + 1:
                raise ValueError('Более 10 000 строк Excel. Выберите меньший файл.')
        if not grid:
            raise ValueError('Лист Excel пуст.')
        headers = [str(c).strip() if c is not None else '' for c in grid[0]]
        if not all(headers) or len(set(headers)) != len(headers):
            raise ValueError('Заголовки Excel должны быть заполнены и уникальны.')
        return [{'__sheet': chosen.attrib['name'], **{h: row[i] if i < len(row) else None for i, h in enumerate(headers)}} for row in grid[1:]]


def read_file(root, relative, sheet=None):
    path = confined(root, relative, {'.csv', '.json', '.xlsx', '.txt', '.md'})
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('Файл больше 5 МБ.')
    suffix = path.suffix.lower()
    if suffix == '.xlsx':
        records = xlsx_records(path, sheet)
        result = {'path': relative, 'format': 'xlsx', 'records': records}
    else:
        text = path.read_text(encoding='utf-8-sig')
        if suffix == '.csv':
            first = text.splitlines()[0] if text else ''
            delimiter = ';' if first.count(';') > first.count(',') else ','
            reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
            if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
                raise ValueError('CSV: требуются уникальные заголовки.')
            records = []
            for r in reader:
                if None in r or any(v is None for v in r.values()):
                    raise ValueError('CSV: число полей не совпадает с заголовком.')
                records.append(r)
                if len(records) > MAX_ROWS:
                    raise ValueError('CSV содержит больше 10 000 строк.')
            result = {'path': relative, 'format': 'csv', 'records': records}
        elif suffix == '.json':
            data = json.loads(text)
            if isinstance(data, list) and len(data) > MAX_ROWS:
                raise ValueError('JSON содержит больше 10 000 записей.')
            result = {'path': relative, 'format': 'json', 'records': data} if isinstance(data, list) else {'path': relative, 'format': 'json', 'data': data}
        else:
            result = {'path': relative, 'format': suffix[1:], 'text': text}
    if len(json.dumps(result, ensure_ascii=False).encode()) > MAX_BYTES:
        raise ValueError('Представление файла превышает 5 МБ.')
    return result


def list_files(root):
    base = Path(root).resolve(strict=True)
    output = []
    for directory, dirs, files in os.walk(base, followlinks=False):
        dirs[:] = [d for d in dirs if not d.startswith('.') and not (Path(directory)/d).is_symlink() and d not in ('node_modules', '__pycache__')]
        for name in sorted(files):
            path = Path(directory)/name
            if not name.startswith('.') and path.suffix.lower() in EXTENSIONS and not path.is_symlink() and path.is_file():
                output.append({'path': path.relative_to(base).as_posix(), 'size': path.stat().st_size, 'format': path.suffix[1:].lower()})
            if len(output) >= 500:
                return {'files': output, 'truncated': True}
    return {'files': sorted(output, key=lambda f: f['path']), 'truncated': False}


def main(payload):
    op = payload['operation']
    if op == 'schema':
        return schema(payload['root'], payload['database'])
    if op == 'query':
        return query(payload['root'], payload['database'], payload['query'], payload.get('params'), payload.get('limit', MAX_ROWS))
    if op == 'read_file':
        return read_file(payload['root'], payload['path'], payload.get('sheet'))
    if op == 'list_files':
        return list_files(payload['root'])
    raise ValueError('Неизвестная операция.')

if __name__ == '__main__':
    try:
        result = main(json.load(sys.stdin))
        print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False, allow_nan=False))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
