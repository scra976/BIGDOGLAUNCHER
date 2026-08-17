# Catalog

`catalog.json` is the store. The launcher reads the bundled copy first, then the remote catalog URL from settings.

## Add a game

1. Drop a `2:3` cover in `covers/`.
2. Append an object to `games`.
3. Publish a zip through Studio.
4. Players refresh the store.

`launch.kind` can be `exe`, `html`, or `url`.
