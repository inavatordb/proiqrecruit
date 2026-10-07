# Research CSVs

Put researched datasets here (one file per type, same headers as `templates/`). Import in this order:

1. `programs.csv`
2. `conference_history.csv`
3. `coaches.csv`
4. `program_seasons.csv`
5. `rankings.csv`
6. `camps.csv`
7. `id_camp_appearances.csv`

```bash
npm run import:programs -- --file data/import/programs.csv --dry-run
npm run import:programs -- --file data/import/programs.csv
```

Rules: `program_id` is a stable code such as `ACC_DUKE_WSOC`. Leave a field blank if the source doesn't publish it (never guess an email).
Mark `verified=yes` only when checked against the page named in `source_url`. The example row in each template starts with `EXAMPLE ROW` and is ignored by the importer.
