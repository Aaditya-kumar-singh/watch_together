# Agent Rules

## graphify
Trigger on: codebase or architecture questions, or when `graphify-out/graph.json` exists.
- For codebase or architecture questions, first run `graphify query "<question>"` (CLI) or `query_graph` (MCP). Use `graphify path "<A>" "<B>"` / `shortest_path` for relationships and `graphify explain "<concept>"` / `get_node` for focused concepts.
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code files in this session, run `graphify update .` to keep the graph current.

## banner-design
Trigger on: requests for banner, cover, header, or display ad designs, or website hero visual sections.
- Consult [.agents/skills/banner-design/SKILL.md](file:///.agents/skills/banner-design/SKILL.md) to design high-quality multi-format creative banners.

## brand
Trigger on: requests involving brand identity, messaging frameworks, visual guidelines, asset management, tone of voice, or brand compliance.
- Consult [.agents/skills/brand/SKILL.md](file:///.agents/skills/brand/SKILL.md) to maintain brand voice and consistency.

## design-system
Trigger on: requests involving design tokens, component specifications, strategic slide structure, spacing, or typography scales.
- Consult [.agents/skills/design-system/SKILL.md](file:///.agents/skills/design-system/SKILL.md) for token architecture and systematic component designs.

## design
Trigger on: comprehensive design tasks, corporate identity programs (CIP), logos, SVG icons, HTML presentations, or multi-platform social media images.
- Consult [.agents/skills/design/SKILL.md](file:///.agents/skills/design/SKILL.md) to generate design assets, CIP mockups, and logos.

## slides
Trigger on: requests to build strategic presentation slide decks, outlines, or HTML presentations with Chart.js.
- Consult [.agents/skills/slides/SKILL.md](file:///.agents/skills/slides/SKILL.md) for strategic slide creation and copywriting formulas.

## ui-styling
Trigger on: user interface design, shadcn/ui components (Radix + Tailwind), Tailwind CSS styling, responsive layout designs, theme/color customization, or dark mode.
- Consult [.agents/skills/ui-styling/SKILL.md](file:///.agents/skills/ui-styling/SKILL.md) to implement beautiful, accessible UI components and responsive styling patterns.
