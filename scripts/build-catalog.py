#!/usr/bin/env python3
"""식약처나우(kr-mfds-now) 데이터셋 카탈로그 빌더.

data.go.kr 의 식약처 오픈API 498개 + 식품안전나라 서비스 178개를 스캔해
data/catalog.json (lib/catalog-types.ts 의 Dataset[] 스키마) 을 만든다.

원천 데이터는 전부 이 리포 밖 스크래치 경로에 있다 (아래 상수 참고). 원본 HTML 은
용량이 크고 재스크랩 가능하므로 커밋하지 않는다. 네트워크로 새로 받아오는 값(AJAX 로
가져오는 추가 오퍼레이션, 식품안전나라 필드 라벨)은 scripts/raw/*.json 에 파싱된
중간 결과로 캐싱해서 커밋한다 — 재실행 시 캐시를 재사용하고, 재현이 필요하면 이
JSON 만으로 카탈로그를 다시 만들 수 있다.

사용법: python3 scripts/build-catalog.py [--no-network]
"""
from __future__ import annotations

import difflib
import html as html_lib
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

# ---------------------------------------------------------------------------
# 경로 상수
# ---------------------------------------------------------------------------

SCRATCH_ROOT = (
    "/private/tmp/claude-501/-Users-zihado-work-playground-datalab/"
    "09a42e90-1062-4277-988d-5bcc3294fb1f/scratchpad"
)
DATAGOKR_DIR = f"{SCRATCH_ROOT}/mfds-datagokr"
DATAGOKR_HTML_DIR = f"{DATAGOKR_DIR}/all"
DATAGOKR_SUMMARY_PATH = f"{DATAGOKR_DIR}/all_summary.json"

EXTERNAL_DIR = f"{SCRATCH_ROOT}/mfds-external"
FSK_SERVICE_LIST_PATH = f"{EXTERNAL_DIR}/dataset_search2.json"

COOKIE_FILE = os.path.expanduser("~/.config/datagokr-keepalive/cookies.txt")

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "scripts" / "raw"
OUT_PATH = REPO_ROOT / "data" / "catalog.json"

AJAX_EXTRA_OP_CACHE = RAW_DIR / "datagokr-extra-ops.json"
FSK_DETAIL_CACHE = RAW_DIR / "fsk-detail.json"
DISCOVERED_PARAMS_CACHE = RAW_DIR / "discovered-params.json"

DATAGOKR_AJAX_URL = "https://www.data.go.kr/tcs/dss/selectApiDetailFunction.do"
FSK_INFO_URL = "https://www.foodsafetykorea.go.kr/api/openApiInfo.do"

REQUEST_DELAY_SEC = 0.5

SYSTEM_PARAM_NAMES = {
    "servicekey", "pageno", "numofrows", "type", "_type", "resulttype",
    "keyid", "serviceid", "datatype", "startidx", "endidx",
}

FSK_TITLE_MATCH_THRESHOLD = 0.72

# ---------------------------------------------------------------------------
# 공통 유틸
# ---------------------------------------------------------------------------

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def strip_tags(s: str) -> str:
    s = TAG_RE.sub(" ", s)
    s = html_lib.unescape(s)
    return WS_RE.sub(" ", s).strip()


def run_curl(args: list[str], timeout: int = 30) -> str | None:
    try:
        r = subprocess.run(
            ["curl", "-sS", "--max-time", str(timeout), *args],
            capture_output=True, text=True, timeout=timeout + 5,
        )
        if r.returncode != 0:
            print(f"  [curl 실패] rc={r.returncode} stderr={r.stderr[:200]}", file=sys.stderr)
            return None
        return r.stdout
    except Exception as e:  # noqa: BLE001
        print(f"  [curl 예외] {e}", file=sys.stderr)
        return None


def load_json(path) -> object:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------------------
# 제목 접두어 제거 / 분류 규칙
# ---------------------------------------------------------------------------

TITLE_PREFIXES = [
    "식품의약품안전처 식품의약품안전평가원_",
    "식품의약품안전처_",
]


def strip_title_prefix(title: str) -> str:
    for p in TITLE_PREFIXES:
        if title.startswith(p):
            return title[len(p):]
    return title


# 우선순위가 높은 규칙부터 순서대로 검사 (첫 매치 채택). 키워드는 제목(접두어 제거 후) 기준.
CATEGORY_RULES: list[tuple[str, list[str]]] = [
    ("narcotic", ["마약"]),
    ("device", ["의료기기", "진단시약", "진단키트", "마스크", "체외진단", "GMP지정"]),
    ("cosmetic", ["화장품"]),
    ("bio", [
        "백신", "인체조직", "혈액제제", "생물학적제제", "유전자치료", "첨단바이오", "세포치료",
        "실험동물", "조직은행", "LMO",
    ]),
    ("drug", [
        "의약품", "한약", "생약", "낱알", "DUR", "의약외품", "임상시험", "약국",
        "완제", "원료의약품", "첩약", "e약은요", "약사법", "동물용의약품",
        "생동성", "대조약", "약물 유전", "지표성분",
    ]),
    ("import", [
        "수입식품", "수입위생", "수입관리", "해외직구", "수입신고", "수입업체", "원산지",
        "수입쇠고기", "우수수입업소", "후대교배종",
    ]),
    ("livestock", ["축산물", "축산", "수산물", "수산과학", "이력추적", "어류질병", "식육"]),
    ("restaurant", [
        "음식점", "식품접객업", "위생등급", "모범업소", "외식업", "집단급식", "일반음식점",
        "급식", "푸드트럭",
    ]),
    ("standard", [
        "공전", "기준규격", "기준·규격", "기준 및 규격", "잔류허용기준", "표시기준", "용어사전", "코드",
        "부과기준", "분류기준", "공통기준", "신고대상분류",
    ]),
    ("stats", ["통계"]),
    ("food", [
        "식품", "건강기능식품", "첨가물", "영양", "리콜", "회수", "바코드", "레시피",
        "위생용품", "HACCP", "농약", "식중독", "제조업", "가공업", "포장업",
        "인허가", "위생관리등급", "위생공통교육",
    ]),
]


def classify_category(title: str) -> str:
    for cat, keywords in CATEGORY_RULES:
        for kw in keywords:
            if kw in title:
                return cat
    return "etc"


# R&D 내부행정(연구관리) 데이터 — 목록에서 숨김
HIDDEN_KEYWORDS = ["연구관리", "RND_MB", "연구비", "연구과제", "연구 시설 장비"]
HIDDEN_PK_OVERRIDE = {"15068683"}  # 한국동물대체시험법검증센터 서비스: 오퍼레이션이 전부 홈페이지 CMS 관리 API


def is_hidden(pk: str, org: str, title_stripped: str) -> bool:
    if pk in HIDDEN_PK_OVERRIDE:
        return True
    if "식품의약품안전평가원" not in org:
        return False
    return any(kw in title_stripped for kw in HIDDEN_KEYWORDS)


# ---------------------------------------------------------------------------
# data.go.kr HTML 파싱
# ---------------------------------------------------------------------------

SWAGGER_RE = re.compile(r"const swaggerJson = `(.*?)`;", re.S)
SELECT_RE = re.compile(
    r'<select[^>]*id="open_api_detail_select"[^>]*>(.*?)</select>', re.S
)
OPTION_RE = re.compile(r'<option value="(\d+)"[^>]*>\s*([^<]+?)\s*</option>')
HIDDEN_INPUT_RE = re.compile(r'id="{name}"[^>]*value="([^"]*)"')
TR_RE = re.compile(r"<tr>(.*?)</tr>", re.S)
TD_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.S)


def read_dataset_html(pk: str) -> str | None:
    path = os.path.join(DATAGOKR_HTML_DIR, f"{pk}.html")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="ignore") as f:
        return f.read()


def extract_swagger_json(html: str) -> dict | None:
    m = SWAGGER_RE.search(html)
    if not m:
        return None
    raw = m.group(1).strip()
    if len(raw) < 20:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def hidden_input_value(html: str, field_id: str) -> str | None:
    m = re.search(HIDDEN_INPUT_RE.pattern.format(name=re.escape(field_id)), html)
    return m.group(1) if m else None


def extract_select_options(html: str) -> list[tuple[str, str]]:
    m = SELECT_RE.search(html)
    if not m:
        return []
    return [(v, strip_tags(t)) for v, t in OPTION_RE.findall(m.group(1))]


def slice_section(html: str, heading: str) -> str:
    """heading 을 담은 <table>...</table> 블록을 찾는다.

    data.go.kr 은 <h4>제목</h4> 다음에 표가 오고(제목이 표 밖),
    식품안전나라는 <table><caption>제목</caption>...</table> 형태(제목이 표 안)라
    두 패턴을 모두 봐야 한다.
    """
    for m in re.finditer(r"<table.*?</table>", html, re.S):
        if heading in m.group(0):
            return m.group(0)
    idx = html.find(heading)
    if idx < 0:
        return ""
    m = re.search(r"<table.*?</table>", html[idx:], re.S)
    return m.group(0) if m else ""


def parse_kv_table(table_html: str) -> list[dict]:
    """요청변수/출력결과 표 공통 파서: 국문명, 영문명, 크기, 구분, 샘플, 설명 6열."""
    rows: list[dict] = []
    for tr_m in TR_RE.finditer(table_html):
        tr_body = tr_m.group(1)
        if "<th" in tr_body:
            continue  # 헤더 행
        tds = TD_RE.findall(tr_body)
        if len(tds) < 6:
            continue
        kor, eng, size, division, sample, desc = (strip_tags(t) for t in tds[:6])
        if not eng:
            continue
        rows.append({
            "kor": kor, "eng": eng, "size": size,
            "division": division, "sample": sample, "desc": desc,
        })
    return rows


def extract_endpoint(html: str) -> str | None:
    m = re.search(r'요청주소</strong>\s*<div class="value">(.*?)</div>', html, re.S)
    if not m:
        return None
    text = strip_tags(m.group(1))
    return text or None


def rows_to_params(rows: list[dict]) -> list[dict]:
    params = []
    for r in rows:
        name = r["eng"]
        params.append({
            "name": name,
            "label": r["kor"] or name,
            "required": r["division"] in ("필수", "필"),
            **({"sample": r["sample"]} if r["sample"] else {}),
            **({"system": True} if name.lower() in SYSTEM_PARAM_NAMES else {}),
        })
    return params


def rows_to_fields(rows: list[dict]) -> list[dict]:
    out, seen = [], set()
    for r in rows:
        name = r["eng"]
        if name in seen:
            continue
        seen.add(name)
        out.append({"name": name, "label": r["kor"] or name})
    return out


def parse_table_op_fragment(fragment: str, op_id: str, op_name: str) -> dict | None:
    endpoint = extract_endpoint(fragment)
    if not endpoint:
        return None
    param_rows = parse_kv_table(slice_section(fragment, "요청변수(Request Parameter)"))
    field_rows = parse_kv_table(slice_section(fragment, "출력결과(Response Element)"))
    return {
        "id": op_id,
        "name": op_name,
        "endpoint": endpoint,
        "params": rows_to_params(param_rows),
        "fields": rows_to_fields(field_rows),
    }


def fetch_extra_op(pk: str, oprtin_seq_no: str, op_name: str, public_data_detail_pk: str,
                    public_data_pk: str, cache: dict) -> dict | None:
    """AJAX 로 추가 오퍼레이션 표를 받아 그 자리에서 파싱한 Op 만 캐싱한다.

    원본 HTML 조각은 커밋 금지 대상이라 저장하지 않는다 — 재현이 필요하면 이
    캐시(파싱된 Op)만으로 충분하고, 원본을 다시 보려면 이 함수를 다시 호출하면 된다.
    """
    cache_key = f"{pk}:{oprtin_seq_no}"
    if cache_key in cache:
        return cache[cache_key]
    if not os.path.exists(COOKIE_FILE):
        print(f"  [경고] 쿠키 파일이 없어 추가 오퍼레이션을 못 가져옵니다: {pk}/{oprtin_seq_no}")
        return None
    out = run_curl([
        "-b", COOKIE_FILE,
        "-X", "POST", DATAGOKR_AJAX_URL,
        "--data-urlencode", f"oprtinSeqNo={oprtin_seq_no}",
        "--data-urlencode", f"publicDataDetailPk={public_data_detail_pk}",
        "--data-urlencode", f"publicDataPk={public_data_pk}",
    ])
    time.sleep(REQUEST_DELAY_SEC)
    if not out:
        return None
    op = parse_table_op_fragment(out, oprtin_seq_no, op_name)
    if op:
        cache[cache_key] = op
    return op


def collect_swagger_fields(schema: dict, out: list, seen: set) -> None:
    if not isinstance(schema, dict):
        return
    if schema.get("type") == "array":
        collect_swagger_fields(schema.get("items", {}), out, seen)
        return
    props = schema.get("properties")
    if not isinstance(props, dict):
        return
    for name, sub in props.items():
        if not isinstance(sub, dict):
            continue
        # data.go.kr swagger 는 leaf 필드에도 빈 "properties": {} 를 붙여 내보낸다.
        # object/array, 또는 type 이 없는데 properties 가 실제로 채워진 경우만 내려간다.
        sub_type = sub.get("type")
        has_real_props = isinstance(sub.get("properties"), dict) and bool(sub.get("properties"))
        if sub_type in ("object", "array") or (sub_type is None and has_real_props):
            collect_swagger_fields(sub, out, seen)
        else:
            if name in seen:
                continue
            seen.add(name)
            label = (sub.get("description") or "").strip() or name
            out.append({"name": name, "label": label})


def swagger_system_params() -> list[dict]:
    # data.go.kr swagger 덤프에는 parameters 가 채워져 있지 않다(확인됨: 200개 전부 null).
    # 표준 공통 파라미터만 system:true 로 채워 폼에서 숨긴다. 실제 호출 값은
    # lib/upstream.ts 의 queryDataGoKr() 가 무조건 채워 보낸다.
    return [
        {"name": "serviceKey", "label": "인증키", "required": True, "system": True},
        {"name": "pageNo", "label": "페이지 번호", "required": False, "sample": "1", "system": True},
        {"name": "numOfRows", "label": "한 페이지 결과 수", "required": False, "sample": "10", "system": True},
        {"name": "type", "label": "응답 형식", "required": False, "sample": "json", "system": True},
    ]


def parse_swagger_ops(swagger: dict) -> list[dict]:
    host = swagger.get("host", "")
    ops = []
    for path, methods in (swagger.get("paths") or {}).items():
        if not isinstance(methods, dict):
            continue
        for verb, op in methods.items():
            if verb not in ("get", "post") or not isinstance(op, dict):
                continue
            fields: list[dict] = []
            seen: set = set()
            schema = ((op.get("responses") or {}).get("200") or {}).get("schema") or {}
            collect_swagger_fields(schema, fields, seen)
            ops.append({
                "id": op.get("operationId") or path.strip("/"),
                "name": op.get("summary") or op.get("description") or path.strip("/"),
                "endpoint": f"https://{host}{path}",
                "params": swagger_system_params(),
                "fields": fields,
            })
    return ops


def build_datagokr_ops(pk: str, html: str, extra_op_cache: dict) -> tuple[list[dict], bool]:
    """(ops, params_from_swagger_limitation) 반환."""
    swagger = extract_swagger_json(html)
    if swagger is not None:
        return parse_swagger_ops(swagger), True

    options = extract_select_options(html)
    if len(options) <= 1:
        # 단일 오퍼레이션: 메인 HTML 에 이미 표가 있다
        op_id, op_name = (options[0] if options else (pk, ""))
        op = parse_table_op_fragment(html, op_id, op_name or "조회")
        return ([op] if op else []), False

    # 다중 오퍼레이션: 정확성을 위해 전부 AJAX 로 새로 받는다 (기본 표는 어떤 옵션인지 불확실)
    detail_pk = hidden_input_value(html, "publicDataDetailPk") or ""
    public_pk = hidden_input_value(html, "publicDataPk") or pk
    ops = []
    for op_id, op_name in options:
        op = fetch_extra_op(pk, op_id, op_name, detail_pk, public_pk, extra_op_cache)
        if op:
            ops.append(op)
    return ops, False


# ---------------------------------------------------------------------------
# 식품안전나라(foodsafetykorea) 파싱
# ---------------------------------------------------------------------------

def fetch_fsk_detail(svc_no: str, cache: dict) -> dict | None:
    """openApiInfo.do 를 받아 그 자리에서 파싱한 {params, fields} 만 캐싱한다.

    원본 HTML(서비스당 ~150KB, 178개 전체면 수십 MB) 은 커밋 금지 대상이라 저장하지
    않는다 — 재현이 필요하면 이 캐시(파싱 결과)만으로 충분하다.
    """
    if svc_no in cache:
        return cache[svc_no]
    url = (
        f"{FSK_INFO_URL}?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1"
        f"&svc_no={svc_no}&svc_type_cd=API_TYPE06"
    )
    out = run_curl([url])
    time.sleep(REQUEST_DELAY_SEC)
    if not out:
        return None
    detail = {"params": parse_fsk_params(out), "fields": parse_fsk_fields(out)}
    cache[svc_no] = detail
    return detail


def parse_fsk_params(tab3_html: str) -> list[dict]:
    """요청인자 표: 번호/변수명/타입/변수설명/값설명. 앞 5개(keyId·serviceId·dataType·
    startIdx·endIdx)는 상위 레이어가 채우는 표준 위치 인자라 system:true."""
    section = slice_section(tab3_html, "요청인자")
    params = []
    for tr_m in TR_RE.finditer(section):
        tr_body = tr_m.group(1)
        if "<th" in tr_body:
            continue
        tds = TD_RE.findall(tr_body)
        if len(tds) < 5:
            continue
        _, name, typ, desc, sample = (strip_tags(t) for t in tds[:5])
        if not name:
            continue
        required = "필수" in typ
        params.append({
            "name": name,
            "label": desc or name,
            "required": required,
            **({"sample": sample} if sample else {}),
            **({"system": True} if name.lower() in SYSTEM_PARAM_NAMES else {}),
        })
    return params


def parse_fsk_fields(tab3_html: str) -> list[dict]:
    """변수 목록 표(출력항목): 번호/항목/설명."""
    section = slice_section(tab3_html, "변수 목록")
    fields, seen = [], set()
    for tr_m in TR_RE.finditer(section):
        tr_body = tr_m.group(1)
        if "<th" in tr_body:
            continue
        tds = TD_RE.findall(tr_body)
        if len(tds) < 3:
            continue
        _, name, desc = (strip_tags(t) for t in tds[:3])
        if not name or name in seen:
            continue
        seen.add(name)
        fields.append({"name": name, "label": desc or name})
    return fields


# ---------------------------------------------------------------------------
# 메인 빌드 로직
# ---------------------------------------------------------------------------

def dedupe_ops(ops: list[dict]) -> list[dict]:
    seen, out = set(), []
    for op in ops:
        key = (op["endpoint"], op["id"])
        if key in seen:
            continue
        seen.add(key)
        out.append(op)
    return out


def build_datagokr_datasets(no_network: bool) -> tuple[list[dict], dict]:
    summary = load_json(DATAGOKR_SUMMARY_PATH)
    extra_op_cache = load_json(AJAX_EXTRA_OP_CACHE) if AJAX_EXTRA_OP_CACHE.exists() else {}

    datasets = []
    stats = {"swagger": 0, "table_single": 0, "table_multi": 0, "no_html": 0, "no_ops": 0}

    for item in summary:
        pk = item["pk"]
        ty = item["ty"]
        org = item.get("org", "식품의약품안전처")
        raw_title = item["nm"]
        title = strip_title_prefix(raw_title)
        hidden = is_hidden(pk, org, title)
        source_url = f"https://www.data.go.kr/data/{pk}/openapi.do"

        ops: list[dict] = []
        if ty == "PRDE02":  # 정상: 실제 호출 가능한 오퍼레이션
            html = read_dataset_html(pk)
            if html is None:
                stats["no_html"] += 1
            else:
                swagger = extract_swagger_json(html)
                if swagger is not None:
                    stats["swagger"] += 1
                    ops = parse_swagger_ops(swagger)
                else:
                    options = extract_select_options(html)
                    if len(options) > 1:
                        stats["table_multi"] += 1
                    else:
                        stats["table_single"] += 1
                    if no_network and len(options) > 1:
                        # 네트워크 없이 재현할 때는 메인 페이지에 실려온 첫 오퍼레이션만 사용
                        op_id = options[0][0] if options else pk
                        op_name = options[0][1] if options else "조회"
                        op = parse_table_op_fragment(html, op_id, op_name)
                        ops = [op] if op else []
                    else:
                        ops, _ = build_datagokr_ops(pk, html, extra_op_cache)
            ops = dedupe_ops(ops)
            if not ops:
                stats["no_ops"] += 1

        dataset = {
            "id": f"dg-{pk}",
            "source": "datagokr",
            "title": title,
            "provider": org,
            "category": classify_category(title),
            **({"updatedAt": item["meta"]["수정일"]} if item.get("meta", {}).get("수정일") else {}),
            **({"hidden": True} if hidden else {}),
            "sourceUrl": source_url,
            "ops": ops,
        }
        if ty == "PRDE04":
            dataset["linkOnly"] = True  # 아래 pairing 단계에서 매칭되면 pairedWith 로 대체 표시
        datasets.append(dataset)

    save_json(AJAX_EXTRA_OP_CACHE, extra_op_cache)
    return datasets, stats


def merge_discovered_params(dg_datasets: list[dict]) -> int:
    """scripts/raw/discovered-params.json (실호출로 알아낸 검색 파라미터)를 병합한다.

    swagger/문서에 파라미터가 없던(non-system 0개) 오퍼레이션에 한해, 실호출로 확인된
    파라미터만 추가한다. 이미 존재하는 파라미터 이름과 겹치면 덮어쓰지 않고 건너뛴다.
    """
    if not DISCOVERED_PARAMS_CACHE.exists():
        return 0
    discovered = load_json(DISCOVERED_PARAMS_CACHE)
    added = 0
    for d in dg_datasets:
        if d["source"] != "datagokr":
            continue
        for op in d.get("ops", []):
            key = f"{d['id']}:{op['id']}"
            entry = discovered.get(key)
            if not entry or entry.get("status") != "ok":
                continue
            existing_names = {p["name"].lower() for p in op["params"]}
            for p in entry.get("params", []):
                if p["name"].lower() in existing_names:
                    continue
                op["params"].append({
                    "name": p["name"],
                    "label": p["label"],
                    "required": False,
                    **({"sample": p["sample"]} if p.get("sample") else {}),
                })
                existing_names.add(p["name"].lower())
                added += 1
    return added


def pair_link_datasets(dg_datasets: list[dict], fsk_datasets: list[dict]) -> int:
    fsk_by_title = [(d["id"], d["title"]) for d in fsk_datasets]
    matched = 0
    for d in dg_datasets:
        if d["source"] != "datagokr" or not d.get("linkOnly"):
            continue
        title = d["title"]
        best_id, best_ratio = None, 0.0
        for fid, ftitle in fsk_by_title:
            ratio = difflib.SequenceMatcher(None, title, ftitle).ratio()
            if ratio > best_ratio:
                best_id, best_ratio = fid, ratio
        if best_id and best_ratio >= FSK_TITLE_MATCH_THRESHOLD:
            d["pairedWith"] = best_id
            del d["linkOnly"]
            matched += 1
    return matched


def build_fsk_datasets(no_network: bool) -> tuple[list[dict], dict]:
    services = load_json(FSK_SERVICE_LIST_PATH)["list"]
    detail_cache = load_json(FSK_DETAIL_CACHE) if FSK_DETAIL_CACHE.exists() else {}

    datasets = []
    stats = {"total": 0, "with_api": 0, "labels_missing": 0}

    for svc in services:
        svc_no = svc["svc_no"]
        title = svc["svc_nm"]
        provider = svc.get("provd_instt_nm") or "식품의약품안전처"
        has_api = svc.get("openapi_yn") == "Y"
        source_url = (
            f"https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31"
            f"&menu_no=661&show_cnt=10&start_idx=1&svc_no={svc_no}&svc_type_cd=API_TYPE06"
        )

        ops: list[dict] = []
        labels_missing = False
        if has_api:
            stats["with_api"] += 1
            detail = None
            if not no_network:
                detail = fetch_fsk_detail(svc_no, detail_cache)
            elif svc_no in detail_cache:
                detail = detail_cache[svc_no]
            if detail:
                if not detail["fields"]:
                    labels_missing = True
                ops = [{
                    "id": svc_no,
                    "name": title,
                    "endpoint": svc_no,
                    "params": detail["params"],
                    "fields": detail["fields"],
                }]
            else:
                labels_missing = True

        dataset = {
            "id": f"fsk-{svc_no}",
            "source": "fsk",
            "title": title,
            "provider": provider,
            "category": classify_category(title),
            "sourceUrl": source_url,
            **({"labelsMissing": True} if labels_missing else {}),
            **({} if has_api else {"linkOnly": True}),
            "ops": ops,
        }
        datasets.append(dataset)
        stats["total"] += 1
        if labels_missing:
            stats["labels_missing"] += 1

    save_json(FSK_DETAIL_CACHE, detail_cache)
    return datasets, stats


# ---------------------------------------------------------------------------
# 검증/통계 출력
# ---------------------------------------------------------------------------

def print_report(datasets: list[dict], dg_stats: dict, fsk_stats: dict, paired: int) -> None:
    print("\n" + "=" * 60)
    print("식약처나우 카탈로그 빌드 결과")
    print("=" * 60)
    print(f"총 데이터셋: {len(datasets)}")

    by_source = Counter(d["source"] for d in datasets)
    print(f"  source별: {dict(by_source)}")

    by_cat = Counter(d["category"] for d in datasets)
    print("  category별:")
    for cat, cnt in by_cat.most_common():
        print(f"    {cat:12s} {cnt}")

    hidden_cnt = sum(1 for d in datasets if d.get("hidden"))
    link_only_cnt = sum(1 for d in datasets if d.get("linkOnly"))
    paired_cnt = sum(1 for d in datasets if d.get("pairedWith"))
    print(f"  hidden(R&D 내부행정): {hidden_cnt}")
    print(f"  linkOnly(매칭 실패/API 없음): {link_only_cnt}")
    print(f"  pairedWith(LINK↔FSK 매칭 성공): {paired_cnt} (시도 {paired})")

    no_ops = [d for d in datasets if not d["ops"] and not d.get("linkOnly") and not d.get("pairedWith")]
    print(f"\nops 0개인 항목(정상인데 파싱 실패 가능성): {len(no_ops)}")
    for d in no_ops[:20]:
        print(f"    {d['id']}  {d['title']}")
    if len(no_ops) > 20:
        print(f"    ... 외 {len(no_ops) - 20}개")

    labels_missing = [d for d in datasets if d.get("labelsMissing")]
    total_fsk = fsk_stats["total"]
    print(f"\nfsk 라벨 누락(labelsMissing): {len(labels_missing)} / {total_fsk}"
          f" ({len(labels_missing) / total_fsk * 100:.1f}%)" if total_fsk else "")

    print("\ndata.go.kr 파싱 경로:")
    for k, v in dg_stats.items():
        print(f"    {k:14s} {v}")

    print("\n--- 무작위 5개 항목 상세 ---")
    import random
    random.seed(42)
    sample_pool = [d for d in datasets if d["ops"]]
    for d in random.sample(sample_pool, min(5, len(sample_pool))):
        print(f"\n[{d['id']}] {d['title']} ({d['category']}, {d['provider']})")
        print(f"  sourceUrl: {d['sourceUrl']}")
        for op in d["ops"][:2]:
            print(f"  op {op['id']}: {op['name']}")
            print(f"    endpoint: {op['endpoint']}")
            print(f"    params({len(op['params'])}): "
                  + ", ".join(f"{p['name']}({p['label']})" for p in op["params"][:6]))
            print(f"    fields({len(op['fields'])}): "
                  + ", ".join(f"{f['name']}({f['label']})" for f in op["fields"][:8]))
        if len(d["ops"]) > 2:
            print(f"  ... 외 {len(d['ops']) - 2}개 오퍼레이션")


# ---------------------------------------------------------------------------
# 엔트리포인트
# ---------------------------------------------------------------------------

def main() -> None:
    no_network = "--no-network" in sys.argv

    print("[1/5] data.go.kr 498개 파싱 중...")
    dg_datasets, dg_stats = build_datagokr_datasets(no_network)

    print("[2/5] 식품안전나라 178개 파싱 중 (네트워크 호출, 0.5초 간격)...")
    fsk_datasets, fsk_stats = build_fsk_datasets(no_network)

    print("[3/5] LINK(PRDE04) ↔ 식품안전나라 서비스 짝 맞추는 중...")
    paired = pair_link_datasets(dg_datasets, fsk_datasets)

    print("[4/5] 실호출로 알아낸 검색 파라미터(discovered-params.json) 병합 중...")
    merged = merge_discovered_params(dg_datasets)
    print(f"    병합된 파라미터: {merged}개")

    all_datasets = dg_datasets + fsk_datasets

    print("[5/5] data/catalog.json 저장 중...")
    save_json(OUT_PATH, all_datasets)

    print_report(all_datasets, dg_stats, fsk_stats, paired)
    print(f"\n저장 완료: {OUT_PATH}")


if __name__ == "__main__":
    main()
