# discogs-sub

Builds Discogs submission drafts for records you own that aren't on Discogs yet.

```bash
cargo run -- check <barcode>
cargo run -- draft "Artist" "Title" -i          # prompts for barcode, colour, sides, runouts…
cargo run -- csv                                # bundle new drafts for CSV_To_Draft
```

Drafts are written to `drafts/<artist-title-format>/` as `draft.md`, `draft.json` and
`draft.csv`. Discogs has no API for adding releases. Either use **Copy to Draft** on the
closest version listed, or upload the CSV once at https://www.discogs.com/release/csv_to_draft
and finish each draft with the checklist in `draft.md`.

Full docs: [`docs/backend/discogs-sub.md`](../docs/backend/discogs-sub.md).
