#!/usr/bin/env python3
"""Check static-site links and preserve the approved privacy/VPN baseline.

Run from any directory: python3 scripts/verify-site.py [--baseline GIT_REF]
Uses only the Python standard library. Makes no network requests or file changes.
Browser checks are still required for layout, legal-anchor navigation, and focus.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
import posixpath
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit


DEFAULT_BASELINE = "1dd864751ecf185cd544a08c54cd607a830918cf"
PRODUCTS = {
    "xSimple VPN", "xVoice Clone", "AI Song Cover", "xsimple Life Goal",
    "Landuo", "xStock Monitor",
}
MARKETING_PAGES = {
    "index.html", "products.html", "xsimple.html", "xvoice.html",
    "ai-song-cover.html", "life-goal.html", "landuo.html", "xstock.html",
}
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}


@dataclass
class Element:
    tag: str
    attrs: dict[str, str | None] = field(default_factory=dict)
    line: int = 0
    parent: Element | None = None
    children: list[Element | str] = field(default_factory=list)

    def descendants(self):
        for child in self.children:
            if isinstance(child, Element):
                yield child
                yield from child.descendants()

    def text(self) -> str:
        return "".join(
            child.text() if isinstance(child, Element) else child
            for child in self.children
        )


class Document(HTMLParser):
    def __init__(self, content: bytes):
        super().__init__(convert_charrefs=True)
        self.root = Element("document")
        self.stack = [self.root]
        self.elements: list[Element] = []
        self.ids: Counter[str] = Counter()
        self.links: list[tuple[Element, str, str]] = []
        self.feed(content.decode("utf-8"))
        self.close()

    def handle_starttag(self, tag, attrs):
        element = Element(tag, dict(attrs), self.getpos()[0], self.stack[-1])
        self.stack[-1].children.append(element)
        self.elements.append(element)
        if element.attrs.get("id") is not None:
            self.ids[element.attrs["id"]] += 1
        for attr in ("href", "src"):
            if element.attrs.get(attr) is not None:
                self.links.append((element, attr, element.attrs[attr]))
        if tag not in VOID_TAGS:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def git(root: Path, *args: str) -> bytes:
    return subprocess.run(
        ["git", "-C", str(root), *args], check=True, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout


def legal_section(content: bytes, section_id: str) -> bytes:
    # Preserve indentation and mixed CRLF/LF endings, not just rendered text.
    pattern = (
        rb'^ {6}<section\b(?=[^>]*\bid=["\x27]'
        + re.escape(section_id.encode("ascii"))
        + rb'["\x27])[^>]*>.*?^ {6}</section>\r?\n'
    )
    matches = list(re.finditer(pattern, content, re.MULTILINE | re.DOTALL))
    if len(matches) != 1:
        raise ValueError(f"expected one original section #{section_id}, found {len(matches)}")
    return matches[0].group()


def local_target(source: str, value: str, hosts: set[str]):
    """Return (site-relative path, HTML fragment), or None for an external URL."""
    parsed = urlsplit(value.strip())
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https"}:
        return None
    if parsed.netloc and (parsed.hostname or "").lower() not in hosts:
        return None
    raw_path = unquote(parsed.path)
    if parsed.netloc:
        raw_path = raw_path or "/"
    if not raw_path:
        path = source
    elif raw_path.startswith("/"):
        path = posixpath.normpath(raw_path.lstrip("/"))
    else:
        path = posixpath.normpath(posixpath.join(posixpath.dirname(source), raw_path))
    if path == ".":
        path = "index.html"
    elif raw_path.endswith("/"):
        path = posixpath.join(path, "index.html")
    if path == ".." or path.startswith("../"):
        raise ValueError("URL resolves outside the site root")
    # Text fragments are browser directives, not document IDs.
    fragment = unquote(parsed.fragment).split(":~:text=", 1)[0]
    return path, fragment


def verify(root: Path, baseline: str) -> int:
    errors: list[str] = []
    notes: list[str] = []
    original_paths = git(root, "ls-tree", "-r", "--name-only", baseline).decode().splitlines()
    privacy_paths = {
        path for path in original_paths
        if "privacy" in Path(path).name and Path(path).suffix in {".html", ".md"}
    }
    if len(privacy_paths) != 12:
        errors.append(f"baseline has {len(privacy_paths)} privacy files; expected 12")
    protected = privacy_paths | {
        "assets/css/style.css", "xsimple.html", "assets/css/xsimple-download.css",
        "xsimple-appcast.xml", "app-ads.txt", "CNAME",
    } | {
        path for path in original_paths
        if path.startswith(("assets/images/", "assets/icons/"))
    }
    for path in sorted(protected):
        current = root / path
        if not current.is_file():
            errors.append(f"protected file missing: {path}")
        elif current.read_bytes() != git(root, "show", f"{baseline}:{path}"):
            errors.append(f"protected file differs byte-for-byte: {path}")
    notes.append(f"{len(privacy_paths)} privacy files and {len(protected) - len(privacy_paths)} shared/VPN files compared byte-for-byte")

    original_index = git(root, "show", f"{baseline}:index.html")
    home_path = root / "index.html"
    current_index = home_path.read_bytes() if home_path.is_file() else b""
    for section_id in ("privacy", "terms"):
        try:
            if legal_section(current_index, section_id) != legal_section(original_index, section_id):
                errors.append(f"index.html #{section_id}: original legal section bytes changed")
        except ValueError as error:
            errors.append(f"index.html: {error}")
    notes.append("original home privacy and terms section bytes compared")

    documents: dict[str, Document] = {}
    for path in sorted(root.rglob("*.html")):
        relative = path.relative_to(root)
        if any(part.startswith(".") or part == "node_modules" for part in relative.parts):
            continue
        try:
            documents[relative.as_posix()] = Document(path.read_bytes())
        except (OSError, UnicodeError) as error:
            errors.append(f"{relative}: cannot parse UTF-8 HTML: {error}")
    for page in sorted(MARKETING_PAGES - documents.keys()):
        errors.append(f"required marketing page missing: {page}")
    for source, document in documents.items():
        for element_id, count in document.ids.items():
            if count > 1:
                errors.append(f"{source}: duplicate id {element_id!r} ({count} occurrences)")

    domain = (root / "CNAME").read_text().strip().lower() if (root / "CNAME").is_file() else "www.xmaillc.com"
    bare_domain = domain.removeprefix("www.")
    hosts = {domain, bare_domain, f"www.{bare_domain}"}
    link_count = 0
    for source, document in documents.items():
        for element, attr, value in document.links:
            location = f"{source}:{element.line} {attr}={value!r}"
            try:
                target = local_target(source, value, hosts)
            except ValueError as error:
                errors.append(f"{location}: {error}")
                continue
            if target is None:
                continue
            link_count += 1
            path, fragment = target
            target_path = root / path
            if target_path.is_dir():
                path = posixpath.join(path, "index.html")
                target_path = root / path
            if not target_path.is_file():
                errors.append(f"{location}: missing local file {path}")
            elif fragment and target_path.suffix.lower() == ".html":
                if path not in documents or fragment not in documents[path].ids:
                    errors.append(f"{location}: missing HTML fragment {path}#{fragment}")
    notes.append(f"{len(documents)} HTML pages and {link_count} internal href/src links checked without network access")

    home = documents.get("index.html")
    if home:
        cards = [element for element in home.elements if "xm-product-card" in (element.attrs.get("class") or "").split()]
        headings = []
        for card in cards:
            card_headings = [" ".join(element.text().split()) for element in card.descendants() if element.tag in {"h1", "h2", "h3", "h4", "h5", "h6"}]
            if len(card_headings) != 1:
                errors.append(f"index.html:{card.line}: product card requires one product heading, found {card_headings!r}")
            headings.extend(card_headings)
        if len(cards) != 6 or Counter(headings) != Counter(PRODUCTS):
            errors.append(f"index.html: expected six named .xm-product-card entries, found {headings!r}")
        old_home = Document(original_index)
        legacy_ids = {"top", "products", "solutions", "platform", "about", "leadership", "compliance", "contact", "privacy", "terms"}
        legacy_ids.update(element_id for element_id in old_home.ids if element_id.endswith("-privacy-report"))
        for element_id in sorted(legacy_ids - home.ids.keys()):
            errors.append(f"index.html: missing legacy anchor #{element_id}")
        for section_id in ("privacy", "terms"):
            sections = [element for element in home.elements if element.tag == "section" and element.attrs.get("id") == section_id]
            for section in sections:
                ancestor = section.parent
                while ancestor and ancestor.tag != "details":
                    ancestor = ancestor.parent
                if not ancestor:
                    errors.append(f"index.html: #{section_id} requires a native details wrapper")
                elif "open" in ancestor.attrs:
                    errors.append(f"index.html: #{section_id} must be collapsed by default")
                elif not any(isinstance(child, Element) and child.tag == "summary" and child.text().strip() for child in ancestor.children):
                    errors.append(f"index.html: #{section_id} wrapper requires a summary label")
    notes.append("six product cards, legacy home/report anchors, and closed native legal disclosures checked")

    for source in sorted(MARKETING_PAGES & documents.keys()):
        document = documents[source]
        titles = [element for element in document.elements if element.tag == "title"]
        descriptions = [element for element in document.elements if element.tag == "meta" and (element.attrs.get("name") or "").lower() == "description"]
        canonicals = [element for element in document.elements if element.tag == "link" and "canonical" in (element.attrs.get("rel") or "").lower().split()]
        if len(titles) != 1 or not titles[0].text().strip():
            errors.append(f"{source}: requires one nonempty title")
        if len(descriptions) != 1 or not (descriptions[0].attrs.get("content") or "").strip():
            errors.append(f"{source}: requires one nonempty meta description")
        if len(canonicals) != 1:
            errors.append(f"{source}: requires one canonical URL")
        else:
            canonical = urlsplit(canonicals[0].attrs.get("href") or "")
            if canonical.scheme != "https" or canonical.hostname not in hosts:
                errors.append(f"{source}: canonical URL must be an absolute HTTPS URL on {domain}")
    notes.append(f"title, description, and canonical metadata checked on {len(MARKETING_PAGES)} marketing pages")

    redirect = documents.get("products.html")
    if redirect:
        manual_targets = [local_target("products.html", value, hosts) for element, attr, value in redirect.links if element.tag == "a" and attr == "href"]
        refresh_targets = []
        for element in redirect.elements:
            if element.tag == "meta" and (element.attrs.get("http-equiv") or "").lower() == "refresh":
                match = re.fullmatch(r"\s*0\s*;\s*url\s*=\s*(.*?)\s*", element.attrs.get("content") or "", flags=re.IGNORECASE)
                if match:
                    refresh_targets.append(local_target("products.html", match[1].strip("\"'"), hosts))
        if ("index.html", "products") not in manual_targets:
            errors.append("products.html: missing manual link to index.html#products")
        if ("index.html", "products") not in refresh_targets:
            errors.append("products.html: missing immediate meta refresh to index.html#products")
    notes.append("legacy products page automatic redirect and manual fallback checked")

    if errors:
        print(f"FAIL: {len(errors)} site regression issue(s)")
        for error in errors:
            print(f"  - {error}")
        return 1
    print(f"PASS: static-site regression checks (baseline {baseline})")
    for note in notes:
        print(f"  - {note}")
    print("  - Browser QA remains required for appearance, keyboard interaction, and history navigation.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default=DEFAULT_BASELINE, help="Git ref containing the approved original privacy/VPN files")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        # Resolve once to a commit, making subsequent ref:path reads unambiguous.
        baseline = git(root, "rev-parse", "--verify", f"{args.baseline}^{{commit}}").decode().strip()
        return verify(root, baseline)
    except subprocess.CalledProcessError as error:
        print(f"ERROR: cannot read Git baseline: {error.stderr.decode().strip()}", file=sys.stderr)
        return 2
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
