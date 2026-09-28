# @nactrace/widget

One script tag that shows what a cross-interface (NAC) call on Etherlink / Tezos X did and why it failed: status, one-sentence explanation, the legs on both runtimes with gas in both units, errors on both sides, storage before/after, links to Blockscout and TzKT.

```html
<script
  src="https://cdn.jsdelivr.net/npm/@nactrace/widget@1/dist/nactrace.js"
  data-hash="0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716"
  data-network="previewnet"
></script>
```

The widget mounts itself right after the tag. Attributes:

| attribute      | values                                         | default                |
| -------------- | ---------------------------------------------- | ---------------------- |
| `data-hash`    | EVM tx hash, Tezos op hash, or an explorer URL | required               |
| `data-network` | `previewnet`, `mainnet`, `shadownet`           | auto-detect via 0xTzKT |
| `data-theme`   | `light`, `dark`, `auto`                        | `auto`                 |
| `data-enrich`  | `false` to skip the EVM / Michelson node calls | `true`                 |
| `data-target`  | CSS selector of the container to render into   | after the script tag   |

Programmatic use, any number of times on a page:

```js
const trace = await nactrace.mount(document.getElementById("box"), {
  hash: "oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W",
  theme: "dark",
});
// the element also emits "nactrace:trace" (detail: Trace) or "nactrace:error"
```

Data comes straight from the browser: 0xTzKT first, then the public EVM and Michelson nodes for gas per frame, revert data and storage diffs (all three allow cross-origin requests). No React, no dependencies at runtime, styles isolated in a shadow root. About 28 kB gzipped.

Pre-alpha. Built on [@nactrace/core](https://www.npmjs.com/package/@nactrace/core). Source and issues: https://github.com/Migl992/nectrace. MIT.
