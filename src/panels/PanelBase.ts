import * as vscode from 'vscode'
import * as path from 'path'

export abstract class PanelBase {
  protected panel: vscode.WebviewPanel

  constructor(
    protected readonly viewType: string,
    protected readonly title: string,
    protected readonly extensionUri: vscode.Uri,
    protected readonly webviewEntry: string
  ) {
    this.panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webview')],
    })

    this.panel.webview.html = this.getHtml()
    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg))
    this.panel.onDidDispose(() => this.onDispose())
  }

  protected post(type: string, payload?: unknown): void {
    this.panel.webview.postMessage({ type, payload })
  }

  protected abstract onMessage(message: { type: string; payload?: unknown }): void

  protected onDispose(): void {}

  private getHtml(): string {
    const webview = this.panel.webview
    const outWebviewUri = vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(outWebviewUri, `${this.webviewEntry}.js`)
    )
    const tailwindUri = webview.asWebviewUri(
      vscode.Uri.joinPath(outWebviewUri, 'tailwind.css')
    )
    const entryStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(outWebviewUri, `${this.webviewEntry}.css`)
    )
    const nonce = getNonce()
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};`

    const entryStyleExists = require('fs').existsSync(
      vscode.Uri.joinPath(outWebviewUri, `${this.webviewEntry}.css`).fsPath
    )

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${tailwindUri}">
  ${entryStyleExists ? `<link rel="stylesheet" href="${entryStyleUri}">` : ''}
  <title>${this.title}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function getNonce(): string {
  let text = ''
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return text
}

export function getWebviewUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  ...pathSegments: string[]
): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments))
}
