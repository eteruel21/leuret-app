import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const legalUrl = "https://admin.leurettech.com/legal";
const documents = {
  terms: {
    file: "terms-of-service.md",
    summary: "Condiciones de acceso, uso y responsabilidades de Leuret App."
  },
  privacy: {
    file: "privacy-policy.md",
    summary: "Datos personales, finalidades, seguridad y derechos en Leuret App."
  }
};

const spanishDate = new Intl.DateTimeFormat("es-PA", {
  dateStyle: "long",
  timeZone: "UTC"
});

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(
      /\[([^\[\]<>]+)\]\((https:\/\/[^\s()*<>]+)\)|\b[\w.]+@leurettech\.com\b/g,
      (match, label, url) => url
        ? '<a href="' + url + '">' + label + "</a>"
        : '<a href="mailto:' + match + '">' + match + "</a>"
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// The legal sources use headings, paragraphs, emphasis, links and flat lists.
function renderBlocks(markdown) {
  const html = [];
  let paragraph = [];
  let listTag = null;

  function closeParagraph() {
    if (paragraph.length === 0) return;
    html.push("<p>" + paragraph.join("") + "</p>");
    paragraph = [];
  }

  function closeList() {
    if (!listTag) return;
    html.push("</" + listTag + ">");
    listTag = null;
  }

  for (const line of markdown.split("\n")) {
    const item = /^(-|\d+\.) (.+)$/.exec(line);
    if (item) {
      closeParagraph();
      const tag = item[1] === "-" ? "ul" : "ol";
      if (listTag !== tag) {
        closeList();
        listTag = tag;
        html.push("<" + tag + ">");
      }
      html.push("<li>" + renderInline(item[2]) + "</li>");
      continue;
    }

    closeList();
    if (!line.trim()) {
      closeParagraph();
      continue;
    }
    paragraph.push(renderInline(line.trim()) + (line.endsWith("  ") ? "<br>" : " "));
  }

  closeList();
  closeParagraph();
  return html.join("\n");
}

function renderPage(type, title, summary, updatedAt, version, body) {
  const escapedTitle = escapeHtml(title);
  const updateLabel = spanishDate.format(new Date(updatedAt));
  const [introduction, ...sections] = body.split(/^## /m);
  const article = [
    renderBlocks(introduction),
    ...sections.map((section) => {
      const [heading, ...lines] = section.split("\n");
      return "<section>\n<h2>" + escapeHtml(heading) + "</h2>\n"
        + renderBlocks(lines.join("\n")) + "\n</section>";
    })
  ].join("\n");
  const navigation = Object.keys(documents).map((key) => {
    const label = key === "terms" ? "Términos" : "Privacidad";
    const current = key === type ? ' aria-current="page"' : "";
    return '<a href="' + legalUrl + "/" + key + '"' + current + ">" + label + "</a>";
  }).join("\n          ");

  return [
    "<!doctype html>",
    '<!-- Generado por scripts/generate-legal-documents.mjs. Edita la fuente en docs/. -->',
    '<html lang="es">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '    <meta name="description" content="' + escapeHtml(summary) + '" />',
    '    <meta name="theme-color" content="#10251d" />',
    '    <meta name="legal-document-version" content="' + version + '" />',
    '    <link rel="canonical" href="' + legalUrl + "/" + type + '" />',
    '    <link rel="stylesheet" href="/legal/legal.css" />',
    "    <title>" + escapedTitle + " | Leuret App</title>",
    "  </head>",
    "  <body>",
    '    <header class="site-header">',
    '      <div class="site-header__inner">',
    '        <a class="brand" href="' + legalUrl + '" aria-label="Leuret App, información legal">',
    '          <span class="brand__mark" aria-hidden="true">L</span>',
    "          <span>LEURET APP</span>",
    "        </a>",
    '        <nav class="site-nav" aria-label="Documentos legales">',
    '          <a href="https://app.leurettech.com/">Ir a la plataforma</a>',
    "          " + navigation,
    "        </nav>",
    "      </div>",
    "    </header>",
    '    <main class="page-shell">',
    '      <section class="hero">',
    "        <h1>" + escapedTitle + "</h1>",
    '        <p class="document-meta">Última actualización <time datetime="' + updatedAt + '">' + updateLabel + "</time></p>",
    "      </section>",
    '      <article class="legal-document">',
    ...article.split("\n").map((line) => "        " + line),
    "      </article>",
    "    </main>",
    '    <footer class="site-footer"><div class="site-footer__inner">',
    "      <p>© " + updatedAt.slice(0, 4) + " LEURET TECH.</p>",
    "    </div></footer>",
    "  </body>",
    "</html>",
    ""
  ].join("\n");
}

const checkOnly = process.argv.includes("--check");
async function outputFile(path, content) {
  const url = new URL(path, root);
  if (checkOnly) {
    if ((await readFile(url, "utf8")).replaceAll("\r\n", "\n") !== content) {
      throw new Error(path + " no corresponde a su fuente. Ejecuta npm run legal:generate.");
    }
  } else {
    await writeFile(url, content);
  }
}

const apiDocuments = {};
for (const [type, { file, summary }] of Object.entries(documents)) {
  const rawContent = await readFile(new URL("docs/" + file, root), "utf8");
  const content = rawContent.replaceAll("\r\n", "\n").trimEnd() + "\n";
  const header = /^# (.+) — Leuret App\n\n\*\*Fecha de última actualización:\*\* (\d{4}-\d{2}-\d{2})\n\n/.exec(content);
  if (!header) throw new Error("Faltan el título o la fecha ISO de " + file);
  const [metadata, title, updatedAt] = header;
  if (new Date(updatedAt).toISOString().slice(0, 10) !== updatedAt) {
    throw new Error("Fecha inválida en " + file);
  }

  const version = createHash("sha256").update(content).digest("hex");
  const html = renderPage(type, title, summary, updatedAt, version, content.slice(metadata.length));
  apiDocuments[type] = {
    document: { title, updatedAt, version, content },
    html
  };
  await outputFile("apps/admin-web/public/legal/" + type + ".html", html);
}

const stylesheet = (await readFile(new URL("apps/admin-web/public/legal/legal.css", root), "utf8"))
  .replaceAll("\r\n", "\n");
const generatedApi = "// Generado por scripts/generate-legal-documents.mjs a partir de docs/.\n"
  + "export const LEGAL_DOCUMENTS = " + JSON.stringify(apiDocuments, null, 2) + ";\n"
  + "export const LEGAL_STYLESHEET = " + JSON.stringify(stylesheet) + ";\n";
await outputFile("apps/api/src/account/legal-content.ts", generatedApi);
