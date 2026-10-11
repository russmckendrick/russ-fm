# discogs-sub

Builds Discogs submission drafts for records you own that aren't on Discogs yet.

```bash
cargo run -- check <barcode>
cargo run -- draft "Artist" "Title" -i          # prompts for barcode, colour, sides, runouts…
```

Drafts are written to `drafts/<artist-title-format>/draft.md` and `draft.json`. Discogs has
no API for adding releases, so you use the draft with **Copy to Draft** on the closest
version listed, or at https://www.discogs.com/release/add.

Full docs: [`docs/backend/discogs-sub.md`](../docs/backend/discogs-sub.md).
