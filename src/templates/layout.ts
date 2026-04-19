export function renderLayout(title: string, body: string): string {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        rel="stylesheet"
        integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
        crossorigin="anonymous"
      />
      <style>
        :root {
          color-scheme: light;
          --bg: #f6efe4;
          --bg-accent: #efe3d0;
          --surface: rgba(255, 252, 246, 0.92);
          --surface-strong: #fffdf9;
          --text: #2c221b;
          --text-muted: #6f6257;
          --line: rgba(92, 70, 54, 0.14);
          --primary: #a2482f;
          --primary-hover: #8f3e28;
          --shadow: 0 24px 60px rgba(86, 56, 36, 0.12);
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          font-family: "Georgia", "Times New Roman", serif;
          color: var(--text);
          background:
            radial-gradient(circle at top left, rgba(210, 142, 98, 0.18), transparent 28%),
            linear-gradient(180deg, var(--bg) 0%, #f9f5ed 45%, #f3ebe0 100%);
        }

        a {
          color: inherit;
        }

        .page-shell {
          min-height: 100vh;
          padding: 32px 20px 48px;
        }

        .panel {
          width: min(920px, 100%);
          margin: 0 auto;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 28px;
          box-shadow: var(--shadow);
          backdrop-filter: blur(12px);
          overflow: hidden;
        }

        .panel-hero {
          padding: 28px 28px 20px;
          background:
            linear-gradient(135deg, rgba(162, 72, 47, 0.12), rgba(210, 178, 130, 0.16)),
            var(--surface-strong);
          border-bottom: 1px solid var(--line);
        }

        .eyebrow {
          margin: 0 0 10px;
          font-size: 12px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--primary);
        }

        .panel-body {
          padding: 28px;
        }

        h1, h2, h3, p {
          margin-top: 0;
        }

        h1 {
          margin-bottom: 12px;
          font-size: clamp(2.1rem, 6vw, 4rem);
          line-height: 0.95;
        }

        .lead {
          margin-bottom: 0;
          max-width: 40rem;
          font-size: 1.05rem;
          line-height: 1.7;
          color: var(--text-muted);
        }

        .button,
        button {
          appearance: none;
          border: 0;
          border-radius: 999px;
          background: var(--primary);
          color: #fffaf5;
          cursor: pointer;
          font: inherit;
          font-weight: 600;
          padding: 12px 20px;
          text-decoration: none;
          transition: background 160ms ease, transform 160ms ease;
        }

        .button:hover,
        button:hover {
          background: var(--primary-hover);
          transform: translateY(-1px);
        }

        .button.secondary,
        button.secondary {
          background: transparent;
          color: var(--text);
          border: 1px solid var(--line);
        }

        .card {
          background: var(--surface-strong);
          border: 1px solid var(--line);
          border-radius: 22px;
          padding: 18px 18px 16px;
        }

        .card-label {
          margin-bottom: 10px;
          font-size: 0.82rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .metric {
          font-size: 2rem;
          font-weight: 700;
          line-height: 1;
        }

        .muted {
          color: var(--text-muted);
        }

        .stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        form.inline-form {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        input[type="text"] {
          width: 100%;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: #fffdf9;
          padding: 12px 14px;
          font: inherit;
          color: var(--text);
        }

        ul.activity-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        ul.activity-list li {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: baseline;
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255, 253, 249, 0.82);
          border: 1px solid var(--line);
        }

        .entry-kind {
          font-weight: 600;
        }

        .entry-balance {
          font-size: 0.92rem;
          color: var(--text-muted);
          white-space: nowrap;
        }

        @media (max-width: 720px) {
          .page-shell {
            padding: 18px 12px 32px;
          }

          .panel-hero,
          .panel-body {
            padding: 20px;
          }

          form.inline-form {
            flex-direction: column;
            align-items: stretch;
          }

          ul.activity-list li {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      </style>
    </head>
    <body>${body}</body>
  </html>`;
}
