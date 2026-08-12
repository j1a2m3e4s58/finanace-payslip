from __future__ import annotations

import math


def parse_pagination(args, default_size: int = 25, maximum_size: int = 100) -> tuple[int, int, bool]:
    requested = "page" in args or "pageSize" in args
    try:
        page = max(1, int(args.get("page", 1)))
        page_size = max(1, min(maximum_size, int(args.get("pageSize", default_size))))
    except (TypeError, ValueError):
        raise ValueError("Pagination values must be valid positive numbers")
    return page, page_size, requested


def paginate(items: list, page: int, page_size: int) -> tuple[list, dict]:
    total = len(items)
    pages = max(1, math.ceil(total / page_size))
    safe_page = min(page, pages)
    start = (safe_page - 1) * page_size
    return items[start:start + page_size], {
        "page": safe_page,
        "pageSize": page_size,
        "total": total,
        "pages": pages,
        "hasPrevious": safe_page > 1,
        "hasNext": safe_page < pages,
    }
