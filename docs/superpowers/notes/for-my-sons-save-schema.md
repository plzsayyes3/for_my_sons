# Private save repository compatibility note

Read-only inspection of `plzsayyes3/For-My-Sons-save` at the time of implementation found:

- default branch: `main`;
- root schema: `schema.json`, schema version `1`;
- existing save files: `saves/<profile>.json`;
- no existing `character-requests/` directory.

The character request pipeline therefore uses the additive paths:

```text
character-requests/
├─ pending/<request-id>/
│  ├─ request.json
│  └─ artwork.webp
└─ completed/<request-id>/
   ├─ request.json
   └─ artwork.webp
```

This note records paths and compatibility decisions only. It contains no profile names, save contents, credentials, or artwork.
