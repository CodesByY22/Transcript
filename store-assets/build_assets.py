"""Build all Chrome Web Store image assets, then verify."""
from generate_icons import generate
from render import render
from verify import contact_sheet, verify

if __name__ == "__main__":
    generate()
    render()
    ok = verify()
    contact_sheet()
    raise SystemExit(0 if ok else 1)
