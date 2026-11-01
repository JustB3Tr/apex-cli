# Vault big picture

Run `/vault` to open the native terminal graph. It reads the selected vault, shows real note connections and stays local. It does not start a browser, call a model, publish a note or execute a draft.

Type a name to select a matching note. Up/Down or Tab moves between matches, Enter inspects the note and its backlinks/outgoing links, `+`/`-` zooms, `0` fits, Alt+WASD pans and Ctrl+P hides/shows private nodes. Escape returns to the normal composer. The note inspector can read the selected note, refresh the graph, export a Canvas or review a plugin update. Existing draft text in the composer is preserved. `/vault graph text` provides a structured noninteractive overview; `/vault graph shared` excludes private identities and connections.

## What counts as a connection

The index reads ordinary UTF-8 Markdown, resolves wikilinks, embedded-note links and local `.md` links, and records backlinks. Unique basenames and simple inline alias lists can resolve across folders. Missing targets and ambiguous basenames are marked unresolved; APEX never invents a connection or creates a missing note automatically. Fenced/inline code and external URLs are excluded from link parsing. This is a bounded Markdown-link parser, not a full replacement for Obsidian's parser or inferred semantic architecture.

Indexing is bounded at 500 notes, 3,000 visited entries, 8 MB and 2,000 edges; individual notes above 100 KB, invalid UTF-8, hidden/control files and symlinks are not indexed. Bounds are visible in the graph/status output. Refresh explicitly after edits. Note inspection compares the observed hash with the current note, and Canvas export stops if an indexed note changed.

Private and Outbox notes remain private. Untagged notes in custom folders are also private by default. Shared folders (`Shared`, `Chats`, `Tasks`, `Decisions`, `Agents`) and exact `Home.md` can be shared unless marked private. A custom-folder note needs explicit `visibility: shared` for shared context. Shared graph exports withhold private identities/links instead of turning them into named unresolved nodes.

Vault recovery uses the same resolved graph links to find relevant basename connections across custom folders. It still loads only bounded selected excerpts. Graph visibility is not permission to send every note to a model; existing context mode, approvals and budgets apply.

## Obsidian view and Canvas

The bundled **APEX Vault** plugin adds **Open vault big picture** and a graph ribbon icon. Its SVG graph supports note selection, connection inspection, opening a selected note, search with a one-hop neighborhood, zoom, pan and private filtering. It uses local vault/DOM APIs with its parser bundled into `main.js`; no CDN, provider key, model request or remote graph service is needed.

`/vault canvas shared` and `/vault canvas local` preview the exact included note paths, then export a new `.canvas` inside the selected vault. Local exports can include private notes and are labelled accordingly. Exports use file nodes and edges from the [JSON Canvas 1.0 specification](https://jsoncanvas.org/spec/1.0/), so actual note references open in a Canvas-compatible app. Obsidian controls rendering of those note contents and any external embeds they contain; APEX does not automatically open the Canvas or fetch embeds.

The graph has browser/SDK-fixture and Windows-terminal evidence. Actual Obsidian desktop/mobile loading remains unverified. Enable the plugin yourself after reviewing its files.

## Backed-up plugin updates

Use `/vault plugin-update`. APEX previews installed/bundled hashes, requires confirmation, saves every existing managed file under `.obsidian/apex-vault-backups/<id>/`, then replaces changed managed files. Additional custom files, vault notes and enabled-plugin settings are preserved. Differing files are never silently overwritten by ordinary `/vault plugin` installation.

If APEX Vault is enabled, disable it in Obsidian before updating. APEX does not change that setting or reload the app. Stale plans and symlinked update paths are rejected. A failed replacement attempts to restore earlier files only while their contents still match this updater's writes; intervening human edits are preserved for manual review. Backups and an update/rollback receipt remain available. No backup is automatically deleted.

In a source checkout, `npm run build:plugin` refreshes the embedded parser after changing `obsidian-plugin/graph-core.cjs`. Tests check that the embedded hash matches its source. Published packages contain the already-built plugin.
