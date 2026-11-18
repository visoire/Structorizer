# .nsd File Format (Structorizer XML)

Source of truth: `generators/XmlGenerator.java` (writer) and `parsers/NSDParser.java`
(reader), Structorizer 3.32-35. Real example: `sourcecode/Structorizer.Desktop-3.32-35/samples/hilbert-3.nsd`.

## 1. Overall structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<root xmlns:nsd="https://structorizer.fisch.lu" version="3.32-35"
      preAlt="if" preFor="for" ... ignoreCase="false"
      author="..." created="2022-06-21" changedby="..." changed="2025-02-08"
      origin="Structorizer 3.32-07" namespace=""
      text="..." comment="..." color="ffffff" type="program" style="nice">
  <children>
    ...elements...
  </children>
</root>
```

- Root tag `root`; the sequence wrapper is `children`.
- Element tags: `instruction`, `call`, `jump`, `alternative`, `case`, `for`, `while`,
  `repeat`, `forever`, `parallel`, `try`.
- Branch (sequence) tags: `qTrue`, `qFalse` (alternative), `qCase` (case, repeated),
  `qFor`, `qWhile`, `qRepeat`, `qForever` (loops), `qPara` (parallel, repeated),
  `qTry`, `qCatch`, `qFinally` (try).
- A branch tag may carry `color="rrggbb"` (only written when the branch is empty).
  Web MVP: ignore on read, do not write (decision D-07).

## 2. The `text` and `comment` attributes (multi-line encoding)

Both are a list of lines encoded as **comma-separated double-quoted strings**
(`StringList.getCommaText()`), then XML-escaped.

- In the file: `text="&#34;forward(size)&#34;,&#34;right(parity * 90)&#34;"`
- After XML decoding (what `getAttribute()` returns): `"forward(size)","right(parity * 90)"`
- Lines: `["forward(size)", "right(parity * 90)"]`

Rules for `encodeLines(lines: string[]): string`:
- each line: `"` + line with every `"` doubled + `"`; join with `,`.
- empty list -> `""` (empty attribute).

Rules for `decodeLines(s: string): string[]` (port of `setCommaText`):
1. If `s` is empty -> `[]`.
2. If `s` does not start with `"`, prepend `"`. If it does not end with `"`, append `"`.
3. Scan characters. Outside quotes everything (commas, spaces) is ignored. `"` opens a
   line; inside, `""` is a literal quote; a single `"` closes the line and pushes it.
4. Edge cases from the original: a final unterminated chunk is pushed if not blank;
   a leading blank chunk at the very end is dropped.
5. Unit tests must cover: `""`, `"a"`, `"a","b"`, `"say ""hi"""`, `"a, b"` (comma
   inside quotes), plain `abc` without quotes, empty line in the middle `"a","","b"`.

Use the browser `DOMParser` (`application/xml`) for reading; XML entities are decoded
by it. For writing, escape `& < > "` and newline (`&#10;`) in attribute values.
The original writes `"` as `&#34;`; any valid XML escaping is fine.

## 3. Root attributes

| Attribute | Values | Model field |
|---|---|---|
| `version` | Structorizer version that wrote the file | `meta.fileVersion` (read only) |
| `type` | `program` (default), `sub`, `includable` | `diagramType` |
| `style` | `nice` = boxed, anything else (`abbr`) = not boxed | `boxed` |
| `text`, `comment`, `color` | see section 2 | |
| `includeList` | comma-separated names (no quotes) | `includeList: string[]` |
| `author`, `created`, `changedby`, `changed`, `origin`, `namespace`, `licenseName`, `license` | strings, dates `yyyy-MM-dd` | `meta.*` |
| keyword attributes: `preAlt postAlt preCase postCase preFor postFor stepFor preForIn postForIn preWhile postWhile preRepeat postRepeat preLeave preReturn preExit preThrow input output` | strings | `keywords` |
| `ignoreCase` | `true`/`false` | `keywords.ignoreCase` |

Missing keyword attributes -> use defaults from `source-analysis.md` 2.6.
If `preForIn` is missing but `preFor` exists, `preForIn = preFor`.

## 4. Element attributes

Common to all elements: `text`, `comment`, `color`, `disabled` (`"1"` / `"0"`).
`instruction` additionally writes `rotated="0"` (ignore on read, write `"0"`).

| Tag | Extra attributes | Children |
|---|---|---|
| `instruction` | `rotated` | none |
| `call` | `ismethoddecl` (`0`/`1`) | none |
| `jump` | | none |
| `alternative` | `branch_colors` | `qTrue`, `qFalse` |
| `case` | `branch_colors` | `qCase` x (text lines - 1) |
| `for` | `counterVar`, `startValue` (legacy spelling `StartValue` on read), `endValue`, `stepConst`, `style` (`FREETEXT`/`COUNTER`/`TRAVERSAL`), `insep` (legacy), `reliable` (legacy, `true` => COUNTER) | `qFor` |
| `while` | | `qWhile` |
| `repeat` | | `qRepeat` |
| `forever` | **no `text`**, only `comment`, `color`, `disabled` | `qForever` |
| `parallel` | | `qPara` x N |
| `try` | | `qTry`, `qCatch`, `qFinally` |

`color`: 6 hex digits without `#`, lowercase as written (`ffffff`). Empty string means
default (white). `branch_colors`: comma-separated hex list, one per branch, entries may
be empty (`,ff8080,`).

Not persisted (never write, ignore if present): breakpoints, collapsed state,
execution counts.

## 5. Reader robustness rules

- Unknown tags and attributes: ignore silently, keep reading.
- Case: number of `qCase` tags wins over text line count. If they differ, pad text with
  `"?"` lines or add empty branches so that `branches.length === text.length - 1`
  (minimum text length 3, i.e. 2 branches). Log a warning.
- Parallel: number of `qPara` tags wins; set `text[0]` to that number.
- For: if `style` missing -> classify from text (MVP: treat as `FREETEXT` and keep the
  text; executor parses text later).
- Old files may lack `version`; treat as legacy, still parse.
- Files can be large (imported programs): reader must be iterative-safe for depth ~50.

## 6. Writer rules

- Always write `<?xml version="1.0" encoding="UTF-8"?>`.
- Root: `xmlns:nsd="https://structorizer.fisch.lu"`, `version` = our app version string
  prefixed so the desktop accepts it, e.g. `"3.32-35"` (decision D-08), all keyword
  attributes, then `text`, `comment`, `color`, `type`, `style`.
- Indent with tabs (cosmetic, matches desktop).
- Attribute order does not matter for the desktop reader.
- Round-trip requirement: `write(read(file))` must be loadable by Structorizer Desktop
  3.32 and must preserve every persisted field listed above (except branch colors of
  empty sequences, D-07).

## 7. Test fixture: all element types

Save as `main/web/tests/fixtures/all-elements.nsd`. Every structured element appears once.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<root xmlns:nsd="https://structorizer.fisch.lu" version="3.32-35" preAlt="if" postAlt="" preCase="case" postCase="" preFor="for" postFor="to" stepFor="by" preForIn="foreach" postForIn="in" preWhile="while" postWhile="" preRepeat="until" postRepeat="" preLeave="leave" preReturn="return" preExit="exit" preThrow="throw" input="INPUT" output="OUTPUT" ignoreCase="true" author="test" created="2026-11-18" text="&#34;AllElements&#34;" comment="&#34;Fixture with every element type&#34;" color="ffffff" type="program" style="nice">
	<children>
		<instruction text="&#34;var n: int&#34;,&#34;n &#60;- 3&#34;" comment="&#34;two lines&#34;" color="ffffff" rotated="0" disabled="0"></instruction>
		<instruction text="&#34;INPUT x&#34;" comment="" color="ffff80" rotated="0" disabled="0"></instruction>
		<alternative text="&#34;x &#62; 0&#34;" comment="" color="ffffff" branch_colors="," disabled="0">
			<qTrue>
				<instruction text="&#34;OUTPUT &#34;&#34;positive&#34;&#34;&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qTrue>
			<qFalse color="ffffff">
			</qFalse>
		</alternative>
		<case text="&#34;x&#34;,&#34;1&#34;,&#34;2, 3&#34;,&#34;default&#34;" comment="" color="ffffff" branch_colors=",,," disabled="0">
			<qCase>
				<instruction text="&#34;OUTPUT 1&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qCase>
			<qCase>
				<instruction text="&#34;OUTPUT 23&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qCase>
			<qCase color="ffffff">
			</qCase>
		</case>
		<for text="&#34;for i &#60;- 1 to n&#34;" comment="" counterVar="i" startValue="1" endValue="n" stepConst="1" style="COUNTER" color="ffffff" disabled="0">
			<qFor>
				<call text="&#34;show(i)&#34;" comment="" color="ffffff" disabled="0" ismethoddecl="0"></call>
			</qFor>
		</for>
		<for text="&#34;foreach v in {1, 2, 3}&#34;" comment="" counterVar="v" style="TRAVERSAL" insep="in" color="ffffff" disabled="0">
			<qFor>
				<instruction text="&#34;OUTPUT v&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qFor>
		</for>
		<while text="&#34;while (n &#62; 0)&#34;" comment="" color="ffffff" disabled="0">
			<qWhile>
				<instruction text="&#34;n &#60;- n - 1&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qWhile>
		</while>
		<repeat text="&#34;until (n &#62;= 3)&#34;" comment="" color="ffffff" disabled="0">
			<qRepeat>
				<instruction text="&#34;n &#60;- n + 1&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qRepeat>
		</repeat>
		<forever comment="&#34;disabled endless loop&#34;" color="ffffff" disabled="1">
			<qForever>
				<jump text="&#34;leave&#34;" comment="" color="ffffff" disabled="0"></jump>
			</qForever>
		</forever>
		<parallel text="&#34;2&#34;" comment="" color="ffffff" disabled="0">
			<qPara>
				<instruction text="&#34;a &#60;- 1&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qPara>
			<qPara>
				<instruction text="&#34;b &#60;- 2&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qPara>
		</parallel>
		<try text="&#34;ex&#34;" comment="" color="ffffff" disabled="0">
			<qTry>
				<jump text="&#34;throw &#34;&#34;oops&#34;&#34;&#34;" comment="" color="ffffff" disabled="0"></jump>
			</qTry>
			<qCatch>
				<instruction text="&#34;OUTPUT ex&#34;" comment="" color="ffffff" rotated="0" disabled="0"></instruction>
			</qCatch>
			<qFinally color="ffffff">
			</qFinally>
		</try>
	</children>
</root>
```

Expected element count after parsing (excluding root, counting nested ones): 23
(11 top-level + 12 nested). Use this as a unit-test assertion
(`countElements(root) === 23`, top-level `root.children.length === 11`).
